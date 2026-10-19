import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerStudent } from '../../api/auth';
import { saveSession } from '../../api/session';
import AuthBackground from '../../components/AuthBackground';

// Los códigos reales son 6 caracteres sin guion: se ignoran espacios y guiones al enviarlo.
function normalizeClassCode(value) {
    return value.replace(/[\s-]/g, '').toUpperCase();
}

export default function Register() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [classCode, setClassCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { token } = await registerStudent(username, password, normalizeClassCode(classCode));
            saveSession(token, 'student');
            navigate('/student');
        } catch (err) {
            setError(err.message);
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
                    <p className="text-sm text-gray-500 mb-1">Únete a la plataforma</p>
                    <h1 className="text-2xl font-bold text-gray-900">Crear Cuenta</h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="register-alias" className="block text-sm font-medium text-gray-700 mb-1.5">Alias</label>
                        <input id="register-alias" className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="estrella_azul" minLength={3} maxLength={30} pattern="[A-Za-z0-9_.\-]{3,30}" title="De 3 a 30 caracteres: letras, números, punto, guion o guion bajo." autoComplete="username" required />
                        <p className="text-xs text-gray-500 mt-1">Inventa un alias divertido. ¡No uses tu nombre real!</p>
                    </div>
                    
                    <div>
                        <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                        <input id="register-password" type="password" className="auth-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>

                    <div>
                        <label htmlFor="register-class-code" className="block text-sm font-medium text-gray-700 mb-1.5">Código de Clase</label>
                        <input id="register-class-code" className="auth-input uppercase" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="K7MQ4P" autoCapitalize="characters" autoComplete="off" spellCheck={false} required />
                        <p className="text-xs text-gray-500 mt-1">¡Pídele este código a tu profesor si no lo tienes!</p>
                    </div>

                    {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}

                    <button type="submit" disabled={loading} className="auth-button mt-4">
                        {loading ? 'Creando cuenta...' : 'Registrarme'}
                    </button>
                </form>

                <div className="mt-8 text-center text-sm text-gray-600">
                    ¿Ya tienes una cuenta? <Link to="/login" className="text-blue-600 font-medium hover:underline">Inicia Sesión</Link>
                </div>
            </div>
        </AuthBackground>
    );
}
