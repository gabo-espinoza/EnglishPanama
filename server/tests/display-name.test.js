const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDisplayName } = require('../src/services/user.service');

// Validacion en el servidor del texto del perfil (diseno §5.6). Prueba unitaria
// pura: no necesita MySQL.

test('acepta un nombre normal y lo recorta', () => {
    assert.equal(validateDisplayName('  Ana Perez  '), 'Ana Perez');
    assert.equal(validateDisplayName('Docente de demostracion'), 'Docente de demostracion');
});

test('rechaza tipos que no son texto', () => {
    for (const bad of [123, {}, [], null, undefined, true]) {
        assert.throws(() => validateDisplayName(bad), /no es valido/);
    }
});

test('rechaza vacio y mas de 100 caracteres', () => {
    assert.throws(() => validateDisplayName('   '), /obligatorio/);
    assert.throws(() => validateDisplayName('x'.repeat(101)), /demasiado largo/);
    assert.equal(validateDisplayName('x'.repeat(100)).length, 100);
});

test('rechaza caracteres de control y marcado HTML', () => {
    for (const bad of [
        'Ana<script>alert(1)</script>',
        'Ana<img src=x onerror=alert(1)>',
        'Ana\nPerez',
        'Ana\u0000Perez',
        '<b>Ana</b>'
    ]) {
        assert.throws(() => validateDisplayName(bad), /no permitidos/);
    }
});
