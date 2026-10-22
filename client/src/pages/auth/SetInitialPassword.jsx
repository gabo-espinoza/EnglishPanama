import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setInitialPassword } from '../../api/auth';
import { saveSession } from '../../api/session';
import AuthBackground from '../../components/AuthBackground';

// Primer ingreso de un docente: reemplaza la contraseña temporal. El login no entrega sesión
// sino un token de un solo propósito (passwordToken) que viaja en el estado del router
// (historial del navegador), nunca en localStorage ni en la URL. Una recarga lo descarta (política
// de sesión, sessionPolicy.js) y se vuelve al login. Sin ese token no hay nada que hacer aquí.
export default function SetInitialPassword() {
    const location = useLocation();
    const navigate = useNavigate();
    const passwordToken = location.state?.passwordToken || null;

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    function backToLogin(notice) {
        navigate('/login', { replace: true, state: { notice } });
    }

    useEffect(() => {
        if (!passwordToken) navigate('/login', { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        // El servidor es la autoridad, pero se evita un viaje si ya se ve que no coinciden.
        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }
        setLoading(true);
        try {
            const result = await setInitialPassword(passwordToken, newPassword, confirmPassword);
            if (result.mfaSetupRequired) {
                navigate('/mfa/setup', { replace: true, state: { enrollToken: result.enrollToken } });
            } else if (result.mfaRequired) {
                navigate('/login', { replace: true, state: { mfaToken: result.mfaToken } });
            } else if (result.token && result.role) {
                saveSession(result.token, result.role);
                navigate(result.role === 'teacher' ? '/teacher' : '/student', { replace: true });
            } else {
                setError('No se pudo guardar la contraseña. Intenta de nuevo.');
            }
        } catch (err) {
            if (err.status === 401) {
                backToLogin('Tu tiempo para crear la contraseña venció. Inicia sesión de nuevo.');
            } else if (err.status === 409 && err.code === 'PASSWORD_ALREADY_SET') {
                backToLogin('Tu contraseña ya fue creada. Inicia sesión.');
            } else {
                // 429 (límite de intentos), 400 (validación) y el resto: el mensaje del servidor.
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    }

    if (!passwordToken) return null;

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
                    <p className="text-sm text-gray-500 mb-1">Es tu primer ingreso</p>
                    <h1 className="text-2xl font-bold text-gray-900">Crea tu contraseña</h1>
                    <p className="text-sm text-gray-600 mt-2">La temporal deja de servir en cuanto guardes la nueva.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña nueva</label>
                        <input
                            id="new-password"
                            type="password"
                            className="auth-input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            autoFocus
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">Repetir contraseña</label>
                        <input
                            id="confirm-password"
                            type="password"
                            className="auth-input"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}

                    <button type="submit" disabled={loading} className="auth-button mt-2">
                        {loading ? 'Guardando...' : 'Guardar contraseña'}
                    </button>
                </form>
            </div>
        </AuthBackground>
    );
}
