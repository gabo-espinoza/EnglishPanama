import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerStudent, registerTeacher } from '../../api/auth';
import { saveSession } from '../../api/session';

export default function Register() {
    const [role, setRole] = useState('student');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [classCode, setClassCode] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [teacherClassCode, setTeacherClassCode] = useState(null);
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (role === 'student') {
                const { token } = await registerStudent(username, password, classCode);
                saveSession(token, 'student');
                navigate('/student');
            } else {
                const { token, classCode: newCode } = await registerTeacher(username, password, displayName);
                saveSession(token, 'teacher');
                setTeacherClassCode(newCode);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    if (teacherClassCode) {
        return (
            <div>
                <h1>¡Listo!</h1>
                <p>Tu código de clase es:</p>
                <p><strong>{teacherClassCode}</strong></p>
                <p>Compártelo con tus estudiantes para que se registren contigo.</p>
                <Link to="/teacher">Ir a mi panel</Link>
            </div>
        );
    }

    return (
        <div>
            <h1>Registro</h1>
            <div role="radiogroup">
                <label>
                    <input type="radio" checked={role === 'student'} onChange={() => setRole('student')} />
                    Soy estudiante
                </label>
                <label>
                    <input type="radio" checked={role === 'teacher'} onChange={() => setRole('teacher')} />
                    Soy docente
                </label>
            </div>
            <form onSubmit={handleSubmit}>
                <label>
                    Usuario
                    <input value={username} onChange={(e) => setUsername(e.target.value)} required />
                </label>
                <label>
                    Contraseña
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </label>
                {role === 'student' ? (
                    <label>
                        Código del docente
                        <input value={classCode} onChange={(e) => setClassCode(e.target.value)} required />
                    </label>
                ) : (
                    <label>
                        Nombre para mostrar
                        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                    </label>
                )}
                {error && <p role="alert">{error}</p>}
                <button type="submit" disabled={loading}>
                    {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                </button>
            </form>
            <p>
                ¿Ya tienes cuenta? <Link to="/">Iniciar sesión</Link>
            </p>
        </div>
    );
}
