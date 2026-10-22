import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { clearStaffSession, getStaffSession } from '../api/staffSession';
import { me } from '../api/staff';
import { ApiError } from '../api/client';

// Contexto del personal de gestión. Lo provee StaffRoute y lo consumen el layout y las
// páginas de /staff con useStaff():
//   const { token, role, area, username, handleAuthError, logout } = useStaff();
// `role` y `area` vienen de GET /api/staff/me (el servidor), nunca del almacenamiento ni de
// un control de la pantalla. En una llamada de página que falle, usa:
//   catch (err) { if (!handleAuthError(err)) setError(err.message); }
// handleAuthError cierra la sesión de staff y lleva al login ante un 401 y devuelve true.
const StaffContext = createContext(null);

export function useStaff() {
    const value = useContext(StaffContext);
    if (!value) throw new Error('useStaff debe usarse dentro de StaffRoute.');
    return value;
}

const EXPIRED_NOTICE = 'Tu sesión de gestión terminó. Inicia sesión de nuevo.';
const INACTIVE_NOTICE = 'Tu cuenta de gestión no está activa.';

// Guarda del área /staff. Sin sesión de staff redirige a /staff/login. Con sesión confirma con
// GET /api/staff/me (una vez) y fija rol y área desde el servidor. No toca la sesión de plataforma.
export default function StaffRoute({ children }) {
    const navigate = useNavigate();
    // Se lee una sola vez al montar: el token no cambia mientras dure esta pantalla.
    const [session] = useState(() => getStaffSession());
    const token = session ? session.token : null;
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);

    // useNavigate() cambia de identidad en cada cambio de ruta (BrowserRouter). Si goToLogin
    // dependiera de él, el efecto de /me se repetiría al navegar entre secciones y reiniciaría
    // la pantalla. Se guarda la última versión en una ref para que goToLogin sea estable.
    const navigateRef = useRef(navigate);
    useEffect(() => {
        navigateRef.current = navigate;
    }, [navigate]);

    const goToLogin = useCallback((notice) => {
        clearStaffSession();
        navigateRef.current('/staff/login', { replace: true, state: notice ? { notice } : undefined });
    }, []);

    useEffect(() => {
        if (!token) return undefined;
        let active = true;
        setProfile(null);
        setError('');
        me(token)
            .then((data) => {
                if (active) setProfile(data);
            })
            .catch((err) => {
                if (!active) return;
                // /me no restringe por rol: un 401 es token vencido o revocado y un 403, cuenta no activa.
                const apiError = err instanceof ApiError;
                if (apiError && err.status === 401) {
                    goToLogin(EXPIRED_NOTICE);
                    return;
                }
                if (apiError && err.status === 403) {
                    goToLogin(INACTIVE_NOTICE);
                    return;
                }
                // Solo se muestran mensajes de ApiError (incluye la falta de conexión, estado 0).
                setError(apiError && err.message ? err.message : 'No se pudo confirmar tu sesión.');
            });
        return () => {
            active = false;
        };
    }, [token, attempt, goToLogin]);

    const handleAuthError = useCallback((err) => {
        if (err && err.status === 401) {
            goToLogin(EXPIRED_NOTICE);
            return true;
        }
        return false;
    }, [goToLogin]);

    const logout = useCallback(() => {
        goToLogin();
    }, [goToLogin]);

    const value = useMemo(() => (profile ? {
        token,
        id: profile.id,
        username: profile.username,
        role: profile.role,
        area: profile.area,
        handleAuthError,
        logout
    } : null), [token, profile, handleAuthError, logout]);

    if (!token) return <Navigate to="/staff/login" replace />;

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm border border-gray-100" role="alert">
                    <p className="text-sm text-red-600 mb-4">{error}</p>
                    <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="auth-button">
                            Reintentar
                        </button>
                        <button type="button" onClick={() => goToLogin()} className="text-sm text-gray-600 hover:underline">
                            Volver al inicio de sesión
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!value) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-live="polite">
                <p className="text-sm text-gray-500">Verificando tu sesión...</p>
            </div>
        );
    }

    return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}
