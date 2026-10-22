// Comparacion de respuestas compartida por los intentos de actividad y el reto diario.
// La respuesta correcta vive SOLO en el servidor: nunca se envia al cliente.

// Compara la respuesta del estudiante con la guardada, sin importar el formato
// (string, numero o arreglo).
function normalizeAnswer(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(normalizeAnswer).join('|');
    if (typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .map((key) => `${key}:${normalizeAnswer(value[key])}`)
            .join('|');
    }
    return String(value).trim().toLowerCase();
}

module.exports = { normalizeAnswer };
