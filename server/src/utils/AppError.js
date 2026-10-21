// Error de aplicacion con codigo HTTP propio.
// El errorHandler central lee `status` y responde con { error: "..." }.
// Se usa en los servicios para devolver 4xx en vez de un 500 generico.
// `apiCode` (opcional) es un codigo estable para el cliente; el handler lo expone como `code`.
class AppError extends Error {
    constructor(message, status = 400, apiCode) {
        super(message);
        this.status = status;
        if (apiCode !== undefined) this.apiCode = apiCode;
    }
}

module.exports = AppError;
