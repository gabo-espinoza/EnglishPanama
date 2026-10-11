// Middleware de errores centralizado. Cualquier `next(err)` en un controlador
// termina aquí, en vez de que cada ruta arme su propio try/catch con formato distinto.
function errorHandler(err, req, res, next) {
    // Body JSON mal formado enviado por el cliente.
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
    }

    // Body demasiado grande (ver límite en app.js).
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande.' });
    }

    const status = err.status || 500;

    // Solo se registra la traza de los errores 5xx (los 4xx son esperados).
    // La traza nunca se envía al cliente para no filtrar detalles internos.
    if (status >= 500) {
        console.error(err);
    }

    const message = status === 500 ? 'Ocurrió un error inesperado.' : err.message;

    res.status(status).json({ error: message });
}

module.exports = errorHandler;
