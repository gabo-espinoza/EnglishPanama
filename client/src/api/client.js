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
        throw new Error(data.error || 'Ocurrió un error inesperado.');
    }
    return data;
}
