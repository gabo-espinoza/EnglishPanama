// Error de la API: conserva el estado HTTP para que las pantallas decidan por el número
// (429, 409, ...) y no leyendo el texto del mensaje, que está en español y puede cambiar.
export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

// Wrapper mínimo sobre fetch: arma la URL, manda JSON, y convierte errores HTTP en excepciones.
export async function apiRequest(path, { method = 'GET', body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`/api${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new ApiError(data.error || 'Ocurrió un error inesperado.', response.status);
    }
    return data;
}
