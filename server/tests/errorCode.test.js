const test = require('node:test');
const assert = require('node:assert');
const errorHandler = require('../src/middleware/errorHandler');

// `res` falso: status() devuelve el mismo objeto y json() guarda el cuerpo.
function run(err) {
    const res = {
        statusCode: null,
        body: null,
        status(n) {
            this.statusCode = n;
            return this;
        },
        json(b) {
            this.body = b;
            return this;
        }
    };
    errorHandler(err, {}, res, () => {});
    return res;
}

test('incluye code cuando el error trae apiCode', () => {
    const res = run({ status: 403, message: 'x', apiCode: 'PASSWORD_CHANGE_REQUIRED' });
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'x', code: 'PASSWORD_CHANGE_REQUIRED' });
});

test('no incluye code si no hay apiCode', () => {
    const res = run({ status: 400, message: 'x' });
    assert.deepStrictEqual(res.body, { error: 'x' });
});

test('no filtra el code de MySQL', () => {
    const res = run({ status: 409, message: 'x', code: 'ER_DUP_ENTRY' });
    assert.deepStrictEqual(res.body, { error: 'x' });
});

test('un 500 no expone apiCode', () => {
    const original = console.error;
    console.error = () => {};
    try {
        const res = run({ status: 500, apiCode: 'X' });
        assert.deepStrictEqual(res.body, { error: 'Ocurrio un error inesperado.' });
    } finally {
        console.error = original;
    }
});
