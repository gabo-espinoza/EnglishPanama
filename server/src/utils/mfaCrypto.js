// Cifrado del secreto TOTP de las cuentas de gestion.
// El secreto nunca se guarda en texto plano: se cifra con AES-256-GCM y la clave
// vive solo en el entorno del servidor (STAFF_MFA_KEY, 32 bytes en base64).
const crypto = require('crypto');

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
    const raw = process.env.STAFF_MFA_KEY;
    if (!raw) throw new Error('Falta STAFF_MFA_KEY en el entorno.');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
        throw new Error('STAFF_MFA_KEY debe ser de 32 bytes codificados en base64.');
    }
    return key;
}

// Formato: iv(12) || authTag(16) || ciphertext
function encrypt(plaintext) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv, {
        authTagLength: TAG_LENGTH,
    });
    const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

function decrypt(payload) {
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    // Un dato mas corto no trae iv + etiqueta completos: se rechaza antes de descifrar.
    if (buf.length < IV_LENGTH + TAG_LENGTH) {
        throw new Error('Secreto MFA cifrado con formato invalido.');
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
    // authTagLength fija la longitud de la etiqueta: Node no acepta etiquetas truncadas.
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv, {
        authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
