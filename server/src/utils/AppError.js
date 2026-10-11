// Error de aplicación con código HTTP propio.
// El errorHandler central lee `status` y responde con { error: "..." }.
// Se usa en los servicios para devolver 4xx en vez de un 500 genérico.
class AppError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

module.exports = AppError;
