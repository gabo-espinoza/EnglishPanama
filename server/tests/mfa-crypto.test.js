const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Cifrado del secreto TOTP (AES-256-GCM, formato iv(12) || etiqueta(16) || datos).
// Pruebas unitarias sin base de datos: la clave se fija aqui, no es un secreto real.
process.env.STAFF_MFA_KEY = Buffer.alloc(32, 7).toString('base64');
const { encrypt, decrypt } = require('../src/utils/mfaCrypto');

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('cifra y descifra el secreto con el formato iv(12) + etiqueta(16) + datos', () => {
    const payload = encrypt(SECRET);
    assert.equal(payload.length, 12 + 16 + Buffer.byteLength(SECRET));
    assert.equal(decrypt(payload), SECRET);
});

test('descifra datos cifrados sin authTagLength explicito (compatibilidad con produccion)', () => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), iv);
    const data = Buffer.concat([cipher.update(SECRET, 'utf8'), cipher.final()]);
    const legacy = Buffer.concat([iv, cipher.getAuthTag(), data]);
    assert.equal(decrypt(legacy), SECRET);
});

test('rechaza una etiqueta truncada aunque sea un prefijo valido', () => {
    // Texto vacio: el dato es solo iv || etiqueta. Recortar la etiqueta a 8 bytes
    // se aceptaria si el descifrado no fijara authTagLength.
    const truncated = encrypt('').subarray(0, 12 + 8);
    assert.throws(() => decrypt(truncated));
});

test('rechaza un dato mas corto que iv + etiqueta', () => {
    assert.throws(() => decrypt(Buffer.alloc(27)), /formato invalido/);
});

test('rechaza una etiqueta alterada', () => {
    const payload = encrypt(SECRET);
    payload[12] ^= 0xff;
    assert.throws(() => decrypt(payload));
});

test('rechaza datos alterados', () => {
    const payload = encrypt(SECRET);
    payload[payload.length - 1] ^= 0x01;
    assert.throws(() => decrypt(payload));
});
