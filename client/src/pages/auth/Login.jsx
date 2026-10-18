import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, loginMfa } from '../../api/auth';
import { saveSession } from '../../api/session';
import AuthBackground from '../../components/AuthBackground';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // Si la cuenta tiene MFA, el primer paso devuelve un reto (mfaToken) y no una sesion.
    const [mfaToken, setMfaToken] = useState(null);
    const [code, setCode] = useState('');
    const navigate = useNavigate();

    function finishLogin({ token, role }) {
        if (!token || !role) {
            throw new Error('No se pudo iniciar sesión. Intenta de nuevo.');
        }
        saveSession(token, role);
        navigate(role === 'teacher' ? '/teacher' : '/student');
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const result = await login(username, password);
            if (result.mfaRequired) {
                setMfaToken(result.mfaToken);
                setPassword('');
                return;
            }
            finishLogin(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleMfaSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            finishLogin(await loginMfa(mfaToken, code.trim()));
        } catch (err) {
            setError(err.message);
            // El reto dura 5 minutos: si venció o fue rechazado, hay que empezar de nuevo.
            if (/expir|no es v[aá]lido|revocada/i.test(err.message)) {
                backToCredentials();
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    }

    function backToCredentials() {
        setMfaToken(null);
        setCode('');
        setError('');
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
                    <p className="text-sm text-gray-500 mb-1">
                        {mfaToken ? 'Un paso más para entrar' : 'Por favor, ingresa tus datos'}
                    </p>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {mfaToken ? 'Verifica tu identidad' : '¡Bienvenido!'}
                    </h1>
                </div>

                {mfaToken ? (
                <form onSubmit={handleMfaSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Código del autenticador</label>
                        <input
                            className="auth-input text-center tracking-[0.4em]"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            autoFocus
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">Abre tu app de autenticación e ingresa el código de 6 dígitos.</p>
                    </div>

                    {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}

                    <button type="submit" disabled={loading || code.length !== 6} className="auth-button mt-2">
                        {loading ? 'Verificando...' : 'Verificar'}
                    </button>
                    <button type="button" onClick={backToCredentials} className="w-full text-sm text-gray-600 hover:underline">
                        Volver
                    </button>
                </form>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Usuario</label>
                        <input className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ej. estudiante_1" required />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                        <input type="password" className="auth-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>

                    {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}

                    <button type="submit" disabled={loading} className="auth-button mt-2">
                        {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                    </button>
                </form>
                )}

                {!mfaToken && (
                <div className="mt-8 text-center text-sm text-gray-600">
                    ¿No tienes una cuenta? <Link to="/register" className="text-blue-600 font-medium hover:underline">Regístrate</Link>
                </div>
                )}
            </div>
        </AuthBackground>
    );
}
