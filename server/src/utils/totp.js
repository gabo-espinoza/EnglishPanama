// TOTP (RFC 6238) implementado con `crypto` nativo, sin dependencias externas.
// Se usa para el segundo factor (MFA) de las cuentas de gestion: contrasena + codigo
// de 6 digitos que cambia cada 30 segundos.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 (RFC 4648)
const PERIOD = 30; // segundos
const DIGITS = 6;

function base32Encode(buf) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(str) {
    const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (const char of clean) {
        const idx = ALPHABET.indexOf(char);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

function generateSecret(bytes = 20) {
    return base32Encode(crypto.randomBytes(bytes));
}

function hotp(secret, counter) {
    const key = base32Decode(secret);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24)
        | (hmac[offset + 1] << 16)
        | (hmac[offset + 2] << 8)
        | hmac[offset + 3];
    return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

function counterFor(timestamp) {
    return Math.floor(timestamp / (PERIOD * 1000));
}

// Codigo actual (se usa para probar el login de punta a punta).
function generateToken(secret, timestamp = Date.now()) {
    return hotp(secret, counterFor(timestamp));
}

// Acepta una ventana de ±1 paso (30 s) por desfase de reloj.
function verifyToken(secret, token, window = 1, timestamp = Date.now()) {
    const candidate = String(token || '').trim();
    if (!new RegExp(`^\\d{${DIGITS}}$`).test(candidate)) return false;
    const counter = counterFor(timestamp);
    for (let i = -window; i <= window; i += 1) {
        if (hotp(secret, counter + i) === candidate) return true;
    }
    return false;
}

// URI para que el gestor escanee el codigo en su app de autenticacion.
function keyUri({ secret, label, issuer = 'English Panama' }) {
    const { encodeURIComponent: enc } = global;
    return `otpauth://totp/${enc(issuer)}:${enc(label)}`
        + `?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}

module.exports = { generateSecret, generateToken, verifyToken, keyUri, PERIOD };
