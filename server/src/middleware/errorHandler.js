// Middleware de errores centralizado. Cualquier `next(err)` en un controlador
// termina aqui, en vez de que cada ruta arme su propio try/catch con formato distinto.
function errorHandler(err, req, res, next) {
    // Body JSON mal formado enviado por el cliente.
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'El cuerpo de la peticion no es JSON valido.' });
    }

    // Body demasiado grande (ver limite en app.js).
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'El cuerpo de la peticion es demasiado grande.' });
    }

    const status = err.status || 500;

    // Solo se registra la traza de los errores 5xx (los 4xx son esperados).
    // La traza nunca se envia al cliente para no filtrar detalles internos.
    if (status >= 500) {
        console.error(err);
    }

    const message = status === 500 ? 'Ocurrio un error inesperado.' : err.message;

    // Solo se expone el apiCode propio de la API, nunca el `code` de errores ajenos
    // (MySQL, Node), y nunca en un 5xx.
    const body = { error: message };
    if (status < 500 && typeof err.apiCode === 'string') {
        body.code = err.apiCode;
    }

    res.status(status).json(body);
}

module.exports = errorHandler;
