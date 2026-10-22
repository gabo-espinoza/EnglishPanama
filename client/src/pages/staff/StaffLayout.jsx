import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import WindBackdrop from '../../components/WindBackdrop';
import { useStaff } from '../../components/StaffRoute';

// Secciones del panel de gestión. El servidor es la autoridad (server/src/routes/staff.routes.js
// y server/src/config/staffRoles.js); el cliente solo oculta lo que el rol no puede usar.
export const STAFF_SECTIONS = {
    access: { path: '/staff/access', label: 'Identidad y accesos' },
    audit: { path: '/staff/audit', label: 'Auditoría' },
    analytics: { path: '/staff/analytics', label: 'Datos y reportes' }
};

// Rol -> secciones permitidas, según la matriz del servidor:
//   access_manager: cuentas, solicitudes y docentes (área access).
//   auditor: lee cuentas y solicitudes (access, solo lectura) y usa la auditoría (área audit).
//   analyst: métricas anónimas (área analytics).
// Los demás roles (contenido, juego, moderación, soporte) aún no tienen paneles ni endpoints.
const ROLE_SECTIONS = {
    access_manager: ['access'],
    auditor: ['access', 'audit'],
    analyst: ['analytics']
};

export const ROLE_LABELS = {
    access_manager: 'Gestor de usuarios y accesos',
    auditor: 'Auditor',
    analyst: 'Analista de datos',
    content_manager: 'Gestor de contenido',
    content_reviewer: 'Revisor de contenido',
    game_manager: 'Gestor del juego',
    moderator: 'Moderador',
    support: 'Soporte'
};

export function sectionsForRole(role) {
    return (ROLE_SECTIONS[role] || []).map((id) => ({ id, ...STAFF_SECTIONS[id] }));
}

// Índice de /staff: lleva a la primera sección permitida o avisa que el rol aún no tiene paneles.
export function StaffHome() {
    const { role } = useStaff();
    const sections = sectionsForRole(role);
    if (sections.length > 0) return <Navigate to={sections[0].path} replace />;
    return (
        <div className="py-8 text-center">
            <h1 className="text-xl font-bold text-gray-900 mb-2">Aún no hay paneles para tu rol</h1>
            <p className="text-sm text-gray-500">Tu cuenta está activa, pero todavía no tiene secciones disponibles.</p>
        </div>
    );
}

// Protege una sección: si el rol no la tiene, vuelve al índice. Uso en App.jsx:
//   <RequireSection section="audit"><Audit /></RequireSection>
export function RequireSection({ section, children }) {
    const { role } = useStaff();
    const allowed = sectionsForRole(role).some((item) => item.id === section);
    return allowed ? children : <Navigate to="/staff" replace />;
}

function navClass({ isActive }) {
    return `block rounded-xl px-4 py-3 text-sm font-bold transition-all ${
        isActive
            ? 'bg-blue-600 text-white shadow-[0_4px_0_0_#1A5955] -translate-y-0.5'
            : 'text-gray-500 hover:bg-blue-50 hover:text-brand-600'
    }`;
}

// Estructura del área /staff: encabezado, menú lateral (escritorio), menú desplegable (móvil)
// y un <Outlet /> donde se dibuja la sección. Rol, área y token los da useStaff().
export default function StaffLayout() {
    const { role, username, logout } = useStaff();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const sections = sectionsForRole(role);
    const roleName = ROLE_LABELS[role] || role;

    // Cierra el menú móvil al cambiar de sección.
    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    // Escape cierra el menú móvil; el listener existe solo mientras está abierto.
    useEffect(() => {
        if (!menuOpen) return undefined;
        function onKeyDown(e) {
            if (e.key === 'Escape') setMenuOpen(false);
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [menuOpen]);

    const nav = (
        <nav aria-label="Secciones de gestión" className="space-y-2">
            {sections.map((item) => (
                <NavLink key={item.id} to={item.path} className={navClass} onClick={() => setMenuOpen(false)}>
                    {item.label}
                </NavLink>
            ))}
        </nav>
    );

    const logoutButton = (
        <button
            type="button"
            onClick={logout}
            className="w-full rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
        >
            Cerrar sesión
        </button>
    );

    return (
        <div className="relative min-h-screen bg-gray-50 font-sans">
            <WindBackdrop />

            <div className="relative z-10 flex h-dvh flex-col">
                <header className="relative bg-white/80 backdrop-blur-md border-b border-blue-100 shadow-sm">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 shadow-sm">
                                <span className="font-display text-lg text-white">E</span>
                            </div>
                            <span className="truncate font-display text-xl text-brand-600">English Panamá</span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="hidden text-right sm:block">
                                <p className="text-sm font-bold text-gray-700">{username}</p>
                                <p className="text-xs text-gray-500">{roleName}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMenuOpen((open) => !open)}
                                aria-expanded={menuOpen}
                                aria-controls="staff-mobile-menu"
                                className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-bold text-brand-600 lg:hidden"
                            >
                                {menuOpen ? 'Cerrar menú' : 'Menú'}
                            </button>
                        </div>
                    </div>

                    {menuOpen && (
                        <div
                            id="staff-mobile-menu"
                            className="animate-fade-in space-y-4 border-t border-blue-100 bg-white p-4 lg:hidden"
                        >
                            <div>
                                <p className="text-sm font-bold text-gray-700">{username}</p>
                                <p className="text-xs text-gray-500">{roleName}</p>
                            </div>
                            {nav}
                            {logoutButton}
                        </div>
                    )}
                </header>

                <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 overflow-hidden px-4 py-6">
                    <aside className="hidden w-64 shrink-0 flex-col rounded-[1.75rem] bg-white p-4 shadow-[0_6px_24px_rgb(7,48,54,0.25)] lg:flex">
                        <div className="mb-6 px-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Rol activo</p>
                            <p className="font-display text-lg text-brand-600">{roleName}</p>
                        </div>

                        <div className="flex-1">{nav}</div>

                        <div className="mt-4 border-t-2 border-gray-100 pt-4">{logoutButton}</div>
                    </aside>

                    <main className="min-w-0 flex-1 overflow-y-auto rounded-[1.75rem] bg-white p-4 shadow-[0_6px_24px_rgb(7,48,54,0.25)] sm:p-8">
                        <Outlet />
                    </main>
                </div>
            </div>
        </div>
    );
}
