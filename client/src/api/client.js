import { clearSession } from './session';

// Error de la API: conserva el estado HTTP para que las pantallas decidan por el número
// (429, 409, ...) y no leyendo el texto del mensaje, que está en español y puede cambiar.
export class ApiError extends Error {
    constructor(message, status, code) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        // Código legible por máquina enviado por el servidor (opcional).
        this.code = code;
    }
}

// Wrapper mínimo sobre fetch: arma la URL, manda JSON, y convierte errores HTTP en excepciones.
export async function apiRequest(path, { method = 'GET', body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
        response = await fetch(`/api${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
    } catch {
        // Servidor caído o sin red: fetch lanza un TypeError en inglés. Estado 0 = sin respuesta HTTP.
        throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', 0, 'NETWORK_ERROR');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        // Sesión vieja de un docente que aún debe reemplazar su contraseña temporal:
        // se descarta y se envía al login, donde el flujo normal lo lleva a crearla.
        if (response.status === 403 && data.code === 'PASSWORD_CHANGE_REQUIRED') {
            clearSession();
            window.location.assign('/login');
        }
        throw new ApiError(data.error || 'Ocurrió un error inesperado.', response.status, data.code);
    }
    return data;
}
