import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../../api/staff';
import { ApiError } from '../../api/client';
import { getStaffSession, saveStaffSession } from '../../api/staffSession';
import AuthBackground from '../../components/AuthBackground';

// Inicio de sesión del personal de gestión: usuario, contraseña y código del autenticador.
export default function StaffLogin() {
    const navigate = useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    // Mensaje que deja StaffRoute al devolver aquí al usuario (sesión vencida).
    const [error, setError] = useState(location.state?.notice || '');
    const [loading, setLoading] = useState(false);

    // Si ya hay sesión de staff, StaffRoute la confirma con el servidor.
    if (getStaffSession()) return <Navigate to="/staff" replace />;

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const result = await login(username.trim(), password, code);
            if (!result.token || !result.role) {
                throw new Error('No se pudo iniciar sesión. Intenta de nuevo.');
            }
            if (!saveStaffSession(result.token, result.role, result.area)) {
                setError('Tu navegador no permite guardar la sesión. Desactiva el modo privado o habilita el almacenamiento.');
                setPassword('');
                setCode('');
                return;
            }
            navigate('/staff', { replace: true });
        } catch (err) {
            // Solo se muestran los mensajes del cliente de la API (ApiError); cualquier otro valor lanzado usa un texto fijo.
            const apiError = err instanceof ApiError;
            if (apiError && err.status === 401) {
                setError('Usuario, contraseña o código incorrectos.');
            } else if (apiError && err.status === 429) {
                setError(err.message || 'Demasiados intentos. Espera un momento e inténtalo de nuevo.');
            } else if (apiError) {
                setError(err.message || 'No se pudo iniciar sesión. Intenta de nuevo.');
            } else {
                setError('No se pudo iniciar sesión. Intenta de nuevo.');
            }
            setPassword('');
            setCode('');
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthBackground>
            <div className="auth-card">
                <div className="flex items-center justify-center mb-8">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3 shadow-sm">
                        <span className="text-white font-bold text-xl font-['Fredoka_One']">E</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-gray-900">English Panamá</span>
                </div>

                <div className="mb-8 text-center">
                    <p className="text-sm text-gray-500 mb-1">Acceso del personal de gestión</p>
                    <h1 className="text-2xl font-bold text-gray-900">Inicia sesión</h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="staff-username" className="block text-sm font-medium text-gray-700 mb-1.5">Usuario</label>
                        <input
                            id="staff-username"
                            className="auth-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            autoFocus
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="staff-password" className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                        <input
                            id="staff-password"
                            type="password"
                            className="auth-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="staff-code" className="block text-sm font-medium text-gray-700 mb-1.5">Código del autenticador</label>
                        <input
                            id="staff-code"
                            className="auth-input text-center tracking-[0.4em]"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">Abre tu app de autenticación e ingresa el código de 6 dígitos.</p>
                    </div>

                    {error && (
                        <div role="alert" className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">
                            {error}
                        </div>
                    )}

                    <button type="submit" disabled={loading || code.length !== 6} className="auth-button mt-2">
                        {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
                    </button>
                </form>
            </div>
        </AuthBackground>
    );
}
