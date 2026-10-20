// Error de aplicacion con codigo HTTP propio.
// El errorHandler central lee `status` y responde con { error: "..." }.
// Se usa en los servicios para devolver 4xx en vez de un 500 generico.
class AppError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

module.exports = AppError;
