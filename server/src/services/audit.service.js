// Registro de auditoria inmutable.
//
// Cada accion del personal deja una fila. Las filas se encadenan: cada una guarda
// el hash de la anterior y su propio hash, asi cualquier edicion o borrado hecho a
// mano en la base rompe la cadena y se detecta con verify().
const crypto = require('crypto');
const { getAuditPool } = require('../config/auditDb');

const GENESIS = '0'.repeat(64);
const MAX_ACTION = 60;

function pad(value, length = 2) {
    return String(value).padStart(length, '0');
}

// Fecha en UTC con milisegundos: el mismo texto que se guarda y que se hashea,
// para que la verificacion de la cadena sea reproducible.
function formatUtc(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
        + ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
        + `.${pad(d.getUTCMilliseconds(), 3)}`;
}

function canonical(row) {
    return [
        row.prev_hash,
        formatUtc(row.occurred_at),
        row.actor_type,
        row.actor_id === null || row.actor_id === undefined ? '' : String(row.actor_id),
        row.actor_role || '',
        row.action,
        row.target || '',
        row.outcome,
        row.ip || ''
    ].join('|');
}

function hashRow(row) {
    return crypto.createHash('sha256').update(canonical(row)).digest('hex');
}

const CHAIN_LOCK = 'englishpanama_audit_chain';
const CHAIN_LOCK_TIMEOUT_SECONDS = 5;

// Cada fila depende del hash de la anterior, asi que leer el ultimo hash e insertar
// debe ser atomico: si dos peticiones lo hacen a la vez toman el mismo prev_hash y
// verify() reporta una rotura que no es manipulacion. Se serializa con GET_LOCK, que
// no necesita permisos de UPDATE (audit_writer solo tiene INSERT y SELECT) y funciona
// aunque haya varios procesos del servidor.
//
// Nunca lanza: si la auditoria falla, no debe tumbar la peticion del usuario.
async function record({ actorType, actorId = null, actorRole = null, action, target = null, outcome = 'ok', ip = null }) {
    let conn = null;
    let locked = false;
    try {
        conn = await getAuditPool().getConnection();
        const [lockRows] = await conn.query('SELECT GET_LOCK(?, ?) AS acquired', [CHAIN_LOCK, CHAIN_LOCK_TIMEOUT_SECONDS]);
        if (Number(lockRows[0].acquired) !== 1) {
            throw new Error('no se pudo obtener el bloqueo de la cadena de auditoria');
        }
        locked = true;

        const [last] = await conn.query('SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1');
        const prevHash = last.length > 0 ? last[0].row_hash : GENESIS;

        const occurredAt = new Date();
        const row = {
            prev_hash: prevHash,
            occurred_at: occurredAt,
            actor_type: actorType,
            actor_id: actorId,
            actor_role: actorRole,
            action: String(action).slice(0, MAX_ACTION),
            target,
            outcome,
            ip
        };
        const rowHash = hashRow(row);

        await conn.query(
            `INSERT INTO audit_log
                (occurred_at, actor_type, actor_id, actor_role, action, target, outcome, ip, prev_hash, row_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [formatUtc(occurredAt), actorType, actorId, actorRole, row.action, target, outcome, ip, prevHash, rowHash]
        );
        return rowHash;
    } catch (err) {
        console.error('No se pudo escribir en auditoria:', err.message);
        return null;
    } finally {
        if (conn) {
            let clean = true;
            if (locked) {
                try {
                    await conn.query('SELECT RELEASE_LOCK(?)', [CHAIN_LOCK]);
                } catch {
                    clean = false;
                }
            }
            // Una conexion que no pudo soltar el bloqueo se destruye: devolverla al pool
            // dejaria la cadena bloqueada para las demas peticiones.
            if (clean) conn.release();
            else conn.destroy();
        }
    }
}

async function list({ actorType, actorRole, action, from, to, limit = 50, offset = 0 } = {}) {
    const pool = getAuditPool();
    const where = [];
    const params = [];
    if (actorType) { where.push('actor_type = ?'); params.push(actorType); }
    if (actorRole) { where.push('actor_role = ?'); params.push(actorRole); }
    if (action) { where.push('action LIKE ?'); params.push(`%${action}%`); }
    if (from) { where.push('occurred_at >= ?'); params.push(from); }
    if (to) { where.push('occurred_at <= ?'); params.push(to); }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const [rows] = await pool.query(
        `SELECT id, occurred_at, actor_type, actor_id, actor_role, action, target, outcome, ip
         FROM audit_log ${clause}
         ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, safeLimit, safeOffset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM audit_log ${clause}`, params);

    return { total: countRows[0].total, rows };
}

// Recorre toda la cadena y confirma que ninguna fila fue alterada o borrada.
async function verify() {
    const pool = getAuditPool();
    const [rows] = await pool.query(
        `SELECT id, occurred_at, actor_type, actor_id, actor_role, action, target, outcome, ip, prev_hash, row_hash
         FROM audit_log ORDER BY id ASC`
    );

    let prevHash = GENESIS;
    for (const row of rows) {
        if (row.prev_hash !== prevHash) return { ok: false, brokenAtId: row.id, reason: 'prev_hash' };
        if (hashRow(row) !== row.row_hash) return { ok: false, brokenAtId: row.id, reason: 'row_hash' };
        prevHash = row.row_hash;
    }
    return { ok: true, checked: rows.length };
}

module.exports = { record, list, verify, GENESIS };
