import { Navigate } from 'react-router-dom';
import { getSession } from '../api/session';

// Envuelve una ruta y exige sesión + rol correcto. El backend igual revalida
// el token en cada request — esto es solo para no mostrar la pantalla equivocada.
export default function ProtectedRoute({ role, children }) {
    const session = getSession();

    if (!session) return <Navigate to="/" replace />;
    if (session.role !== role) return <Navigate to="/" replace />;

    return children;
}
