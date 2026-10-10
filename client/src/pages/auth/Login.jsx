import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../../api/auth';
import { saveSession } from '../../api/session';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { token, role } = await login(username, password);
            saveSession(token, role);
            navigate(role === 'teacher' ? '/teacher' : '/student');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                
                <div className="flex items-center justify-center mb-8">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3 shadow-sm">
                        <span className="text-white font-bold text-xl font-['Fredoka_One']">E</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-gray-900">English Panamá</span>
                </div>

                <div className="mb-8 text-center">
                    <p className="text-sm text-gray-500 mb-1">Por favor, ingresa tus datos</p>
                    <h1 className="text-2xl font-bold text-gray-900">¡Bienvenido!</h1>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Usuario</label>
                        <input className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ej. estudiante_1" required />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                        <input type="password" className="auth-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center text-gray-600 cursor-pointer">
                            <input type="checkbox" className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            Recordarme por 30 días
                        </label>
                        <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">¿Olvidaste tu contraseña?</a>
                    </div>

                    {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}

                    <button type="submit" disabled={loading} className="auth-button mt-2">
                        {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                    </button>
                </form>

                <div className="mt-8 text-center text-sm text-gray-600">
                    ¿No tienes una cuenta? <Link to="/register" className="text-blue-600 font-medium hover:underline">Regístrate</Link>
                </div>
            </div>
        </div>
    );
}