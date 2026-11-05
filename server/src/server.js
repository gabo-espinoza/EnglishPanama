const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const app = require('./app');
const { assertAuditConfig } = require('./config/auditDb');

// En produccion no se arranca sin la base de auditoria separada.
assertAuditConfig();

// En produccion tampoco se arranca sin los secretos de firma y cifrado: si
// faltaran, cada endpoint de autenticacion responderia 500. Fallar aqui es mas
// claro y evita un bucle de reinicios silencioso (docs/migraciones-produccion.md).
function assertAuthConfig() {
    if (process.env.NODE_ENV !== 'production') return;
    const required = ['JWT_SECRET', 'STAFF_JWT_SECRET', 'STAFF_MFA_KEY'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error('Faltan secretos en produccion: ' + missing.join(', '));
    }
    if (Buffer.from(process.env.STAFF_MFA_KEY, 'base64').length !== 32) {
        throw new Error('STAFF_MFA_KEY debe tener 32 bytes codificados en base64.');
    }
}

assertAuthConfig();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`English Panama API escuchando en el puerto ${PORT}`);
});
