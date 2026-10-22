import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, getSession } from '../../api/session';
import TopBar from '../../components/TopBar';
import WindBackdrop from '../../components/WindBackdrop';

// true  = diseñar con datos falsos (sin backend ni sesión)
// false = usar el backend real.
const USE_MOCK = true;

const MOCK_PROFILE = {
    userId: 1,
    alias: 'GamerKid',
    avatar: '👾',
    xp: 1250,
    level: 5,
    rank: 2,
    teacherName: 'Prof. Fernando',
    classCode: 'PROFE-123'
};

const AVATAR_OPTIONS = ['👾', '⭐', '🏆', '🧙', '🐼', '🦊', '🚀', '⚡'];

const MOCK_DAILY_CHALLENGE = {
    id: 1,
    title: '¡Reto del Día!',
    description: 'Completa 2 lecciones perfectas de Vocabulary.',
    xpReward: 50,
    isCompleted: false
};

const MOCK_MODULES_PROGRESS = [
    { id: 'vocabulary', title: 'Vocabulary', progress: 80, color: 'bg-blue-500', icon: '📝' },
    { id: 'grammar', title: 'Grammar', progress: 45, color: 'bg-brand-500', icon: '🧩' },
    { id: 'reading', title: 'Reading', progress: 10, color: 'bg-amber-400', icon: '📖' },
];

const MOCK_RANKING = [
    { userId: 3, alias: 'ProPlayer', avatar: '🏆', xp: 2100, level: 10 },
    { userId: 1, alias: 'GamerKid', avatar: '👾', xp: 1250, level: 5 }, // El usuario actual
    { userId: 2, alias: 'NinjaStar', avatar: '⭐', xp: 980, level: 4 },
    { userId: 4, alias: 'MagoVerde', avatar: '🧙', xp: 640, level: 3 },
];

// Estilos base (Heredados del diseño del docente)
const CARD = 'bg-white rounded-[1.75rem] shadow-[0_6px_24px_rgb(7,48,54,0.25)] p-5 sm:p-6';
const BTN_PLAY = 'rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white shadow-[0_4px_0_0_#1A5955] transition-all hover:translate-y-1 hover:shadow-[0_2px_0_0_#1A5955] active:translate-y-2 active:shadow-none';
const FIELD = 'w-full rounded-xl border-2 border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300';
const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400';
const BTN_PRIMARY = 'rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow-[0_4px_0_0_#1A5955] transition-all hover:translate-y-1 hover:shadow-[0_2px_0_0_#1A5955]';
const BTN_SECONDARY = 'rounded-xl border-2 border-blue-200 px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:border-blue-500 hover:bg-blue-50';

/* ---------- Iconos (SVG) ---------- */
function IconBase({ children, className = 'h-5 w-5' }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${className} shrink-0`} aria-hidden="true">
            {children}
        </svg>
    );
}
function IconGamepad(props) { return <IconBase {...props}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 12h4" /><path d="M8 10v4" /><line x1="15" y1="13" x2="15.01" y2="13" /><line x1="18" y1="11" x2="18.01" y2="11" /></IconBase>; }
function IconTrophy(props) { return <IconBase {...props}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></IconBase>; }
function IconHelp(props) { return <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></IconBase>; }
function IconStar(props) { return <IconBase {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></IconBase>; }
function IconUser(props) { return <IconBase {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></IconBase>; }

const MODULES = [
    { id: 'misiones', label: 'Mis Misiones', Icon: IconGamepad },
    { id: 'ranking', label: 'Salón de la Fama', Icon: IconTrophy },
    { id: 'perfil', label: 'Mi Perfil', Icon: IconUser },
    { id: 'soporte', label: 'Ayuda', Icon: IconHelp },
];

function Title({ children }) {
    return <h2 className="inline-block border-b-[3px] border-blue-300 text-lg font-bold leading-tight text-brand-600">{children}</h2>;
}

export default function StudentHome() {
    const navigate = useNavigate();
    const [activeModule, setActiveModule] = useState('misiones');
    
    // Estados de datos principales
    const [profile, setProfile] = useState(USE_MOCK ? MOCK_PROFILE : null);
    const [ranking, setRanking] = useState(USE_MOCK ? MOCK_RANKING : []);
    const [modulesProgress, setModulesProgress] = useState(USE_MOCK ? MOCK_MODULES_PROGRESS : []);
    const [loading, setLoading] = useState(!USE_MOCK);

    // Estados para la edición del perfil
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileDraft, setProfileDraft] = useState({ alias: '', avatar: '' });
    const [profileSaved, setProfileSaved] = useState(false);

    function toLogin() {
        clearSession();
        navigate('/login', { replace: true });
    }

    useEffect(() => {
        if (USE_MOCK) return;
        const session = getSession();
        if (!session) {
            toLogin();
            return;
        }
        // TODO: llamadas a la API real
        setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Funciones de Perfil
    function startEditProfile() {
        setProfileDraft({ alias: profile.alias, avatar: profile.avatar });
        setProfileSaved(false);
        setEditingProfile(true);
    }

    function handleProfileSave(e) {
        e.preventDefault();
        const newAlias = profileDraft.alias.trim();
        if (!newAlias) return;
        
        // TODO: Cuando exista el Backend, aquí se envía la petición PUT para actualizar la DB.
        setProfile({ ...profile, alias: newAlias, avatar: profileDraft.avatar });
        
        // Actualizamos el ranking mockeado en tiempo real para que el niño vea su nuevo alias/avatar
        setRanking(prev => prev.map(s => s.userId === profile.userId ? { ...s, alias: newAlias, avatar: profileDraft.avatar } : s));
        
        setEditingProfile(false);
        setProfileSaved(true);
    }

    return (
        <div className="relative min-h-screen font-sans">
            <WindBackdrop />

            <div className="relative z-10">
                <TopBar name={`${profile?.alias} ${profile?.avatar}` || 'Estudiante'} />

                <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
                    
                    {/* PANEL IZQUIERDO: Navegación del Estudiante */}
                    <aside className="sticky top-4 hidden w-60 shrink-0 self-start rounded-[1.75rem] bg-white p-3 shadow-[0_6px_24px_rgb(7,48,54,0.25)] lg:block">
                        
                        {/* Tarjeta de Nivel del Estudiante */}
                        <div className="mb-6 flex flex-col items-center justify-center rounded-2xl bg-blue-50 p-4 text-center border-2 border-blue-100">
                            <div className="relative mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-3xl shadow-md border-2 border-white">
                                {profile?.avatar}
                                <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-amber-400 text-xs font-black text-amber-900">
                                    L{profile?.level || 1}
                                </span>
                            </div>
                            <p className="text-base font-bold text-brand-600">{profile?.alias}</p>
                            <p className="mt-1 flex items-center gap-1 text-sm font-bold text-amber-500">
                                <IconStar className="h-4 w-4" /> {profile?.xp} XP
                            </p>
                        </div>

                        <p className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wider text-gray-400">Tu Aventura</p>
                        <nav className="space-y-1">
                            {MODULES.map(({ id, label, Icon }) => {
                                const active = activeModule === id;
                                return (
                                    <button 
                                        key={id} 
                                        onClick={() => setActiveModule(id)} 
                                        className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${active ? 'bg-blue-50 font-bold text-gray-900' : 'font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
                                    >
                                        {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-gradient-to-b from-blue-300 to-blue-600" />}
                                        <span className={active ? 'text-blue-600' : 'text-gray-400'}><Icon /></span>
                                        {label}
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

                    <main className="min-w-0 flex-1 space-y-6">
                        
                        {/* Menú móvil */}
                        <nav className="flex gap-2 overflow-x-auto rounded-full bg-white p-2 shadow-[0_6px_24px_rgb(7,48,54,0.25)] lg:hidden">
                            {MODULES.map(({ id, label, Icon }) => {
                                const active = activeModule === id;
                                return (
                                    <button key={id} onClick={() => setActiveModule(id)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${active ? 'bg-blue-600 font-bold text-white' : 'font-medium text-gray-500 hover:bg-blue-50'}`}>
                                        <Icon /> {label}
                                    </button>
                                );
                            })}
                        </nav>

                        {/* ===== MÓDULO 1: MIS MISIONES ===== */}
                        {activeModule === 'misiones' && profile && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 -rotate-6 items-center justify-center rounded-2xl bg-amber-400 text-white shadow-sm border-b-4 border-amber-500">
                                        <IconGamepad className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl font-display tracking-wide text-white">¡Hola, {profile.alias}!</h1>
                                        <p className="text-sm font-medium text-brand-100">Clase de {profile.teacherName} • Continúa tu aventura</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                                    {/* Reto Diario */}
                                    <section className={`${CARD} lg:col-span-12 bg-gradient-to-br from-blue-600 to-brand-600 border-none relative overflow-hidden`}>
                                        <div className="absolute -right-10 -top-10 opacity-20"><IconStar className="h-48 w-48 text-white" /></div>
                                        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                                            <div className="text-white">
                                                <p className="text-xs font-black uppercase tracking-wider text-blue-200">⭐ {MOCK_DAILY_CHALLENGE.title}</p>
                                                <h3 className="mt-1 text-2xl font-display">{MOCK_DAILY_CHALLENGE.description}</h3>
                                                <p className="mt-2 text-sm font-medium text-blue-100">Recompensa: +{MOCK_DAILY_CHALLENGE.xpReward} XP</p>
                                            </div>
                                            <button className="rounded-2xl bg-amber-400 px-6 py-3 font-bold text-amber-900 shadow-[0_4px_0_0_#b45309] transition-all hover:translate-y-1 hover:shadow-[0_2px_0_0_#b45309] active:translate-y-2 active:shadow-none">
                                                ¡Jugar ahora!
                                            </button>
                                        </div>
                                    </section>

                                    {/* Módulos de Aprendizaje */}
                                    {modulesProgress.map((mod) => (
                                        <section key={mod.id} className={`${CARD} lg:col-span-4 flex flex-col justify-between hover:-translate-y-1 transition-transform cursor-pointer border-b-4 border-gray-200 hover:border-blue-400`}>
                                            <div>
                                                <div className="mb-4 flex items-center justify-between">
                                                    <span className="text-4xl">{mod.icon}</span>
                                                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">{mod.progress}% completado</span>
                                                </div>
                                                <h3 className="text-xl font-display text-brand-600">{mod.title}</h3>
                                            </div>
                                            <div className="mt-6">
                                                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                                                    <div className={`h-full rounded-full ${mod.color}`} style={{ width: `${mod.progress}%` }} />
                                                </div>
                                                <button className={`${BTN_PLAY} w-full mt-5 bg-blue-50 text-blue-600 shadow-[0_4px_0_0_#bfdbfe] hover:shadow-[0_2px_0_0_#bfdbfe]`}>
                                                    Entrar al mundo
                                                </button>
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ===== MÓDULO 2: SALÓN DE LA FAMA (Ranking) ===== */}
                        {activeModule === 'ranking' && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 -rotate-6 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm border-b-4 border-blue-700">
                                        <IconTrophy className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl font-display tracking-wide text-white">Salón de la Fama</h1>
                                        <p className="text-sm font-medium text-brand-100">¡Compite con tus compañeros de clase!</p>
                                    </div>
                                </div>

                                <section className={CARD}>
                                    <Title>🏆 Top Jugadores</Title>
                                    <div className="mt-6 overflow-hidden rounded-2xl border-2 border-blue-100 bg-white">
                                        <ul className="divide-y divide-blue-50">
                                            {ranking.sort((a, b) => b.xp - a.xp).map((student, index) => {
                                                const isMe = student.userId === profile?.userId;
                                                return (
                                                    <li key={student.userId} className={`flex items-center justify-between p-4 transition-colors ${isMe ? 'bg-blue-50/80 border-l-4 border-l-blue-600' : 'hover:bg-gray-50'}`}>
                                                        <div className="flex items-center gap-4">
                                                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${index === 0 ? 'bg-amber-400 text-amber-900' : index === 1 ? 'bg-gray-300 text-gray-800' : index === 2 ? 'bg-amber-700 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                                                {index + 1}
                                                            </span>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-2xl">{student.avatar}</span>
                                                                <div>
                                                                    <p className={`text-base font-bold ${isMe ? 'text-blue-700' : 'text-brand-600'}`}>
                                                                        {student.alias} {isMe && <span className="ml-2 rounded-full bg-blue-200 px-2 py-0.5 text-xs text-blue-800">Tú</span>}
                                                                    </p>
                                                                    <p className="text-xs font-semibold text-gray-400">Nivel {student.level}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-lg font-black text-amber-500">{student.xp} XP</p>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* ===== MÓDULO 3: MI PERFIL ===== */}
                        {activeModule === 'perfil' && profile && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 -rotate-6 items-center justify-center rounded-2xl bg-green-500 text-white shadow-sm border-b-4 border-green-600">
                                        <IconUser className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl font-display tracking-wide text-white">Mi Perfil</h1>
                                        <p className="text-sm font-medium text-brand-100">Personaliza tu identidad en el juego</p>
                                    </div>
                                </div>

                                <section className={`${CARD} max-w-2xl`}>
                                    <div className="flex justify-between items-center mb-6">
                                        <Title>Tus Datos</Title>
                                        {!editingProfile && (
                                            <button type="button" onClick={startEditProfile} className={BTN_SECONDARY}>
                                                Modificar Perfil
                                            </button>
                                        )}
                                    </div>

                                    {profileSaved && !editingProfile && (
                                        <p className="mb-6 rounded-lg border border-green-200 bg-green-50 p-3 text-center text-sm font-bold text-green-700">
                                            ¡Perfil actualizado con éxito!
                                        </p>
                                    )}

                                    {editingProfile ? (
                                        <form onSubmit={handleProfileSave} className="space-y-6">
                                            <div>
                                                <label className={LABEL}>Tu Nombre de Jugador (Alias)</label>
                                                <input 
                                                    className={FIELD} 
                                                    value={profileDraft.alias} 
                                                    onChange={(e) => setProfileDraft({...profileDraft, alias: e.target.value})} 
                                                    maxLength={30} 
                                                    required 
                                                    placeholder="Escribe tu nuevo alias..."
                                                />
                                                <p className="mt-2 text-xs text-gray-500">Recuerda: No uses tu nombre real. ¡Invéntate un nombre divertido!</p>
                                            </div>

                                            <div>
                                                <label className={LABEL}>Elige tu Avatar</label>
                                                <div className="flex flex-wrap gap-3">
                                                    {AVATAR_OPTIONS.map((emoji) => (
                                                        <button
                                                            key={emoji}
                                                            type="button"
                                                            onClick={() => setProfileDraft({...profileDraft, avatar: emoji})}
                                                            className={`h-14 w-14 rounded-2xl text-3xl transition-transform ${profileDraft.avatar === emoji ? 'bg-blue-100 border-4 border-blue-500 scale-110' : 'bg-gray-50 border-2 border-gray-200 hover:scale-105 hover:bg-blue-50'}`}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-3 pt-4 border-t-2 border-gray-100">
                                                <button type="submit" className={BTN_PRIMARY}>Guardar Cambios</button>
                                                <button type="button" onClick={() => setEditingProfile(false)} className={`${BTN_SECONDARY} py-3`}>
                                                    Cancelar
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row items-center gap-8 py-4">
                                            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-brand-600 text-6xl shadow-md border-4 border-blue-100">
                                                {profile.avatar}
                                            </div>
                                            <div className="space-y-3 text-center sm:text-left">
                                                <div>
                                                    <p className={LABEL}>Nombre de Jugador</p>
                                                    <p className="text-2xl font-bold text-brand-600">{profile.alias}</p>
                                                </div>
                                                <div className="flex gap-6 justify-center sm:justify-start">
                                                    <div>
                                                        <p className={LABEL}>Nivel</p>
                                                        <p className="text-xl font-bold text-amber-500">{profile.level}</p>
                                                    </div>
                                                    <div>
                                                        <p className={LABEL}>Experiencia</p>
                                                        <p className="text-xl font-bold text-amber-500">{profile.xp} XP</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}

                        {/* ===== MÓDULO 4: SOPORTE ===== */}
                        {activeModule === 'soporte' && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 -rotate-6 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm border-b-4 border-brand-700">
                                        <IconHelp className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl font-display tracking-wide text-white">Centro de Ayuda</h1>
                                        <p className="text-sm font-medium text-brand-100">¿Tienes algún problema con el juego?</p>
                                    </div>
                                </div>

                                <section className={CARD}>
                                    <Title>Enviar un mensaje de soporte</Title>
                                    <form className="mt-5 space-y-4" onSubmit={(e) => e.preventDefault()}>
                                        <div>
                                            <label className={LABEL}>¿Qué ocurre?</label>
                                            <select className={FIELD}>
                                                <option>No me cargan los juegos</option>
                                                <option>Perdí mis puntos (XP)</option>
                                                <option>Quiero reportar a un jugador</option>
                                                <option>Otro problema</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={LABEL}>Cuéntanos más detalles</label>
                                            <textarea className={`${FIELD} min-h-[120px] resize-y`} placeholder="Escribe aquí..." required />
                                        </div>
                                        <button type="button" className={BTN_PRIMARY}>
                                            Enviar mensaje
                                        </button>
                                    </form>
                                </section>
                            </div>
                        )}

                    </main>
                </div>
            </div>
        </div>
    );
}