import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import TopBar from '../../components/TopBar';
import WindBackdrop from '../../components/WindBackdrop';
import { getSession, clearSession } from '../../api/session';

const USE_MOCK = true;

const ROLES = [
    { id: 'access_manager', name: 'Gestor de Accesos' },
    { id: 'auditor', name: 'Auditor' },
    { id: 'analyst', name: 'Analista de Datos' },
    { id: 'content_manager', name: 'Gestor de Contenido' },
    { id: 'content_reviewer', name: 'Revisor de Contenido' },
    { id: 'game_manager', name: 'Gestor de Juego' },
    { id: 'moderator', name: 'Moderador' },
    { id: 'support', name: 'Soporte Técnico' }
];

const STAFF_MENU = [
    { id: 'identidad', path: '/staff/access', label: 'Identidad y Acceso', roles: ['access_manager', 'auditor'] },
    { id: 'auditoria', path: '/staff/audit', label: 'Auditoría', roles: ['auditor'] },
    { id: 'datos', path: '/staff/analytics', label: 'Datos y Reportes', roles: ['analyst'] },
    
    // SEPARACIÓN DE RUTAS: Gestor vs Revisor
    { id: 'contenido_gestor', path: '/staff/content', label: 'Estudio de Creación', roles: ['content_manager', 'analyst'] },
    { id: 'contenido_revisor', path: '/staff/review', label: 'Aprobación de Contenidos', roles: ['content_reviewer'] },
    
    { id: 'juego', path: '/staff/game', label: 'Gestión del Juego', roles: ['game_manager'] },
    { id: 'comunidad', path: '/staff/moderation', label: 'Moderación', roles: ['moderator'] },
    { id: 'soporte', path: '/staff/support', label: 'Tickets de Soporte', roles: ['support', 'access_manager', 'content_manager'] },
];

export default function StaffLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    
    const [currentRole, setCurrentRole] = useState('content_reviewer');

    useEffect(() => {
        if (!USE_MOCK) {
            const session = getSession();
            if (!session) {
                navigate('/login', { replace: true });
                return;
            }
        }
    }, [navigate]);

    const allowedMenu = STAFF_MENU.filter(item => item.roles.includes(currentRole));

    useEffect(() => {
        const currentPathAllowed = allowedMenu.some(item => location.pathname.includes(item.path));
        if (!currentPathAllowed && allowedMenu.length > 0 && location.pathname !== '/staff') {
            navigate(allowedMenu[0].path, { replace: true });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentRole]);

    function handleLogout() {
        clearSession();
        navigate('/login', { replace: true });
    }

    const roleName = ROLES.find(r => r.id === currentRole)?.name || currentRole;

    return (
        <div className="relative min-h-screen bg-gray-50 font-sans">
            <WindBackdrop />
            
            <div className="relative z-10 flex h-screen flex-col">
                <header className="flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur-md border-b border-blue-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="bg-brand-600 text-white p-2 rounded-xl text-xl">🎮</div>
                        <span className="font-display text-xl text-brand-600">English Panamá</span>
                    </div>
                    
                    {USE_MOCK && (
                        <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-200 px-4 py-2 rounded-xl">
                            <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">👀 Vista Demo:</span>
                            <select 
                                className="bg-transparent text-sm font-bold text-brand-700 outline-none cursor-pointer"
                                value={currentRole}
                                onChange={(e) => setCurrentRole(e.target.value)}
                            >
                                {ROLES.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </header>

                <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 overflow-hidden px-4 py-6">
                    <aside className="hidden w-64 flex-col rounded-[1.75rem] bg-white p-4 shadow-[0_6px_24px_rgb(7,48,54,0.25)] lg:flex">
                        <div className="mb-6 px-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Rol Activo</p>
                            <p className="text-lg font-display text-brand-600 capitalize">{roleName}</p>
                        </div>
                        
                        <nav className="flex-1 space-y-2">
                            {allowedMenu.map((item) => (
                                <NavLink
                                    key={item.id}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `block rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                                            isActive 
                                                ? 'bg-blue-600 text-white shadow-[0_4px_0_0_#1A5955] -translate-y-0.5' 
                                                : 'text-gray-500 hover:bg-blue-50 hover:text-brand-600'
                                        }`
                                    }
                                >
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                        
                        <div className="mt-4 pt-4 border-t-2 border-gray-100">
                            <button onClick={handleLogout} className="w-full rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-100">
                                Cerrar Sesión
                            </button>
                        </div>
                    </aside>

                    <main className="flex-1 overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-[0_6px_24px_rgb(7,48,54,0.25)] sm:p-8">
                        <Outlet context={{ currentRole }} /> 
                    </main>
                </div>
            </div>
        </div>
    );
}