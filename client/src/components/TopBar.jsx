import { useNavigate } from 'react-router-dom';
import { clearSession } from '../api/session';

// Barra superior de los paneles: nombre del usuario y cierre de sesión.
export default function TopBar({ name }) {
    const navigate = useNavigate();

    function handleLogout() {
        clearSession();
        navigate('/login', { replace: true });
    }

    return (
        <header className="bg-white border-b border-gray-100">
            <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center min-w-0">
                    <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center mr-3 shadow-sm shrink-0">
                        <span className="text-white font-bold text-lg font-['Fredoka_One']">E</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
                </div>
                <button
                    type="button"
                    onClick={handleLogout}
                    className="text-sm font-medium text-gray-600 hover:text-blue-700 transition-colors"
                >
                    Cerrar sesión
                </button>
            </div>
        </header>
    );
}
