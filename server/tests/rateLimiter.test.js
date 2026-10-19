// Pruebas del limitador de autenticacion. No necesitan MySQL: se monta una ruta de prueba que
// responde 200 o 401 segun un parametro, detras del mismo authLimiter que usa la API.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const express = require('express');
const { authLimiter, AUTH_RATE_LIMIT_MAX } = require('../src/middleware/rateLimiter');

let server;
let baseUrl;

test.before(async () => {
    const app = express();
    app.post('/probe', authLimiter, (req, res) => {
        const ok = req.query.ok === '1';
        res.status(ok ? 200 : 401).json({ ok });
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
    server.close();
});

async function hit(ok) {
    const res = await fetch(`${baseUrl}/probe?ok=${ok ? 1 : 0}`, { method: 'POST' });
    const body = await res.json();
    return { status: res.status, body };
}

test('las respuestas exitosas no gastan el cupo: un salon puede entrar completo', async () => {
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX + 10; i++) {
        const { status } = await hit(true);
        assert.strictEqual(status, 200, `exito #${i + 1}`);
    }
});

test('los intentos fallidos si cuentan y al pasar el tope responde 429', async () => {
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i++) {
        const { status } = await hit(false);
        assert.strictEqual(status, 401, `fallo #${i + 1}`);
    }
    const blocked = await hit(false);
    assert.strictEqual(blocked.status, 429);
    assert.match(blocked.body.error, /Demasiados intentos de autenticacion/);

    // Con la IP bloqueada, incluso un intento correcto recibe 429 hasta que pase la ventana.
    assert.strictEqual((await hit(true)).status, 429);
});

// El tope se lee al cargar el modulo, asi que se prueba en un proceso aparte por cada valor.
function maxWith(value) {
    const env = { ...process.env };
    if (value === undefined) delete env.AUTH_RATE_LIMIT_MAX;
    else env.AUTH_RATE_LIMIT_MAX = value;
    const result = spawnSync(
        process.execPath,
        ['-e', "console.log(require('./src/middleware/rateLimiter').AUTH_RATE_LIMIT_MAX)"],
        { env, cwd: path.join(__dirname, '..'), encoding: 'utf8' }
    );
    return Number(result.stdout.trim());
}

test('AUTH_RATE_LIMIT_MAX sube el tope y un valor invalido vuelve a 20', () => {
    assert.strictEqual(maxWith(undefined), 20);
    assert.strictEqual(maxWith('200'), 200);
    for (const invalid of ['abc', '0', '-5', '']) {
        assert.strictEqual(maxWith(invalid), 20, `valor ${JSON.stringify(invalid)}`);
    }
});
