import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerStudent } from '../../api/auth';
import { saveSession } from '../../api/session';

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
            const { token } = await registerStudent(username, password, classCode);
            saveSession(token, 'student');
            navigate('/student');
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
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center mr-3 shadow-sm">
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
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
                        <input className="auth-input-green" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Juan Gutierrez" required />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                        <input type="password" className="auth-input-green" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Código de Clase</label>
                        <input className="auth-input-green uppercase" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="PROFE-123" required />
                        <p className="text-xs text-gray-500 mt-1">¡Pídele este código a tu profesor si no lo tienes!</p>
                    </div>

                    {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}

                    <button type="submit" disabled={loading} className="auth-button-green mt-4">
                        {loading ? 'Creando cuenta...' : 'Registrarme'}
                    </button>
                </form>

                <div className="mt-8 text-center text-sm text-gray-600">
                    ¿Ya tienes una cuenta? <Link to="/login" className="text-green-600 font-medium hover:underline">Inicia Sesión</Link>
                </div>
            </div>
        </div>
    );
}