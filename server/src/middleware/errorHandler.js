// Middleware de errores centralizado. Cualquier `next(err)` en un controlador
// termina aquí, en vez de que cada ruta arme su propio try/catch con formato distinto.
function errorHandler(err, req, res, next) {
    console.error(err);

    const status = err.status || 500;
    const message = status === 500 ? 'Ocurrió un error inesperado.' : err.message;

    res.status(status).json({ error: message });
}

module.exports = errorHandler;
