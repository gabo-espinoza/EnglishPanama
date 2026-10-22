import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { declareGrade, getClass, getStudents } from '../../api/teacher';
import { clearSession, getSession } from '../../api/session';
import TopBar from '../../components/TopBar';
import WindBackdrop from '../../components/WindBackdrop';

// true  = diseñar con datos falsos (sin backend ni sesión)
// false = usar el backend real. Déjalo en false antes de hacer commit.
const USE_MOCK = true;

const MOCK_CLASS = {
    displayName: 'Prof. Fernando',
    classCode: 'PROFE-123',
    classGrade: 4, // Con un número se ve el grado ya establecido. Pon null para ver el selector.
    classLevel: 'Primaria',
    grades: [
        { grade: 4, level: 'Primaria' },
        { grade: 5, level: 'Primaria' },
        { grade: 6, level: 'Primaria' },
    ],
};

const MOCK_STUDENTS = [
    { userId: 1, alias: 'GamerKid 👾', xp: 1250, level: 5, completedActivities: 14, averages: { vocabulary: 95, grammar: 85, reading: 90 } },
    { userId: 2, alias: 'NinjaStar ⭐', xp: 980, level: 4, completedActivities: 8, averages: { vocabulary: 80, grammar: null, reading: 75 } },
    { userId: 3, alias: 'ProPlayer 🏆', xp: 2100, level: 10, completedActivities: 25, averages: { vocabulary: 100, grammar: 95, reading: 98 } },
    { userId: 4, alias: 'MagoVerde 🧙', xp: 640, level: 3, completedActivities: 6, averages: { vocabulary: 60, grammar: 45, reading: 55 } },
    { userId: 5, alias: 'PandaPro 🐼', xp: 1520, level: 7, completedActivities: 18, averages: { vocabulary: 88, grammar: 72, reading: 81 } },
    // NUEVO ALUMNO INACTIVO AÑADIDO PARA LA VISTA DE "LISTA COMPLETA"
    { userId: 6, alias: 'NuevoAlumno 🥚', xp: 0, level: 1, completedActivities: 0, averages: { vocabulary: null, grammar: null, reading: null } },
];

const MOCK_TICKETS = [
    { id: 'TCK-001', subject: 'No veo a un estudiante en mi lista', category: 'Consulta general', status: 'En revisión', date: '19/10/2026' },
];

const MOCK_POSTS = [
    { id: 'MSG-001', subject: 'Bienvenidos al nuevo periodo', category: 'Mensaje a la comunidad', status: 'Enviado', date: '18/10/2026' },
];

const TICKET_CATEGORIES = [
    { value: 'consulta', label: 'Consulta general' },
    { value: 'error', label: 'Error técnico' },
    { value: 'nivel', label: 'Cambio de nivel de la clase' },
    { value: 'otro', label: 'Otro' },
];

const COMMUNITY_CATEGORIES = [
    { value: 'mensaje', label: 'Mensaje a la comunidad' },
    { value: 'reporte', label: 'Reporte de contenido o conducta' },
];

const EMPTY_TICKET = { subject: '', category: 'consulta', message: '' };
const EMPTY_POST = { subject: '', category: 'mensaje', message: '' };

const CARD = 'bg-white rounded-[1.75rem] shadow-[0_6px_24px_rgb(7,48,54,0.25)] p-5 sm:p-6';
const FIELD = 'w-full rounded-xl border-2 border-blue-200 bg-white px-4 py-2.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300';
const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400';
const BTN_PRIMARY = 'rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow-[0_4px_0_0_#1A5955] transition-all hover:translate-y-1 hover:shadow-[0_2px_0_0_#1A5955] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none';
const BTN_SECONDARY = 'rounded-xl border-2 border-blue-200 px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:border-blue-500 hover:bg-blue-50';
const BAR_COLORS = ['bg-blue-600', 'bg-brand-500', 'bg-amber-300'];
const RING = 2 * Math.PI * 52;

/* ---------- Iconos (SVG, sin emojis) ---------- */
function IconBase({ children, className = 'h-5 w-5' }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${className} shrink-0`}
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

function IconUser(props) {
    return (
        <IconBase {...props}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </IconBase>
    );
}

function IconChart(props) {
    return (
        <IconBase {...props}>
            <path d="M5 20v-6" />
            <path d="M12 20V6" />
            <path d="M19 20v-10" />
            <path d="M3 20h18" />
        </IconBase>
    );
}

function IconChat(props) {
    return (
        <IconBase {...props}>
            <rect x="3" y="4" width="18" height="13" rx="3" />
            <path d="M8 17v4l4-4" />
        </IconBase>
    );
}

function IconHelp(props) {
    return (
        <IconBase {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" />
            <circle cx="12" cy="17" r=".6" fill="currentColor" />
        </IconBase>
    );
}

function IconCap(props) {
    return (
        <IconBase {...props}>
            <path d="M2 9l10-5 10 5-10 5-10-5Z" />
            <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
            <path d="M22 9v6" />
        </IconBase>
    );
}

function IconUsers(props) {
    return (
        <IconBase {...props}>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
            <circle cx="17" cy="9" r="2.8" />
            <path d="M17 14.2c2.7.2 4.5 2.2 4.5 5.8" />
        </IconBase>
    );
}

function IconBolt(props) {
    return (
        <IconBase {...props}>
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8Z" />
        </IconBase>
    );
}

function IconCheck(props) {
    return (
        <IconBase {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l2.7 2.7L16 9.5" />
        </IconBase>
    );
}

// Módulos a los que tiene acceso el docente (según la matriz de roles).
const MODULES = [
    { id: 'docente', label: 'Docente', Icon: IconUser },
    { id: 'datos', label: 'Datos y Reportes', Icon: IconChart },
    { id: 'comunidad', label: 'Comunidad y Moderación', Icon: IconChat },
    { id: 'soporte', label: 'Soporte', Icon: IconHelp },
];

const DEFAULT_MODULE = 'docente';

function gradeLabel(grade, level) {
    return `${grade}.º grado · ${level}`;
}

function formatAverage(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '—';
}

// Color de la etiqueta según el promedio: turquesa (alto), ámbar (medio), rojo (bajo).
function averageChip(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'bg-gray-100 text-gray-500';
    if (value >= 80) return 'bg-blue-100 text-blue-700';
    if (value >= 50) return 'bg-amber-50 text-amber-700';
    return 'bg-red-50 text-red-600';
}

function statusChip(status) {
    if (status === 'Resuelto') return 'bg-gray-100 text-gray-600';
    if (status === 'En revisión') return 'bg-amber-50 text-amber-700';
    return 'bg-blue-100 text-blue-700';
}

// Crea un ticket o mensaje nuevo a partir del formulario. Devuelve null si faltan datos.
function buildItem(prefix, list, categories, form, status) {
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (!subject || !message) return null;
    return {
        id: `${prefix}-${String(list.length + 1).padStart(3, '0')}`,
        subject,
        category: categories.find((c) => c.value === form.category)?.label || categories[0].label,
        status,
        date: new Date().toLocaleDateString('es-PA'),
    };
}

function Title({ children }) {
    return (
        <h2 className="inline-block border-b-[3px] border-blue-300 text-lg font-bold leading-tight text-brand-600">
            {children}
        </h2>
    );
}

function StatCard({ Icon, label, value }) {
    return (
        <div className={`${CARD} flex items-center gap-4 !p-4`}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Icon className="h-6 w-6" />
            </span>
            <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
                <p className="text-2xl font-bold text-brand-600">{value}</p>
            </div>
        </div>
    );
}

// Tarjeta de lista + botón "Nuevo" + tarjeta de formulario aparte (la usan Soporte y Comunidad).
function RequestModule({
    idPrefix,
    listTitle,
    newButtonLabel,
    formTitle,
    categories,
    categoryLabel,
    subjectLabel,
    subjectPlaceholder,
    messageLabel,
    messagePlaceholder,
    submitLabel,
    emptyText,
    items,
    showForm,
    onToggleForm,
    form,
    onFormChange,
    onSubmit,
    notice,
}) {
    return (
        <div className="space-y-6">
            {showForm && (
                <section className={CARD}>
                    <Title>{formTitle}</Title>
                    <form onSubmit={onSubmit} className="mt-5 space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor={`${idPrefix}-subject`} className={LABEL}>{subjectLabel}</label>
                                <input
                                    id={`${idPrefix}-subject`}
                                    className={FIELD}
                                    value={form.subject}
                                    onChange={(e) => onFormChange('subject', e.target.value)}
                                    placeholder={subjectPlaceholder}
                                    maxLength={120}
                                    required
                                />
                            </div>
                            <div>
                                <label htmlFor={`${idPrefix}-category`} className={LABEL}>{categoryLabel}</label>
                                <select
                                    id={`${idPrefix}-category`}
                                    className={FIELD}
                                    value={form.category}
                                    onChange={(e) => onFormChange('category', e.target.value)}
                                >
                                    {categories.map((c) => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label htmlFor={`${idPrefix}-message`} className={LABEL}>{messageLabel}</label>
                            <textarea
                                id={`${idPrefix}-message`}
                                className={`${FIELD} min-h-[120px] resize-y`}
                                value={form.message}
                                onChange={(e) => onFormChange('message', e.target.value)}
                                placeholder={messagePlaceholder}
                                maxLength={1000}
                                required
                            />
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button type="submit" className={BTN_PRIMARY}>{submitLabel}</button>
                            <button type="button" onClick={onToggleForm} className={`${BTN_SECONDARY} py-3`}>Cancelar</button>
                        </div>
                    </form>
                </section>
            )}

            <section className={CARD}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <Title>{listTitle}</Title>
                        <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-800">{items.length}</span>
                    </div>
                    {!showForm && (
                        <button type="button" onClick={onToggleForm} className={BTN_SECONDARY}>
                            + {newButtonLabel}
                        </button>
                    )}
                </div>

                {notice && (
                    <p role="status" className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-center text-sm font-medium text-blue-700">
                        {notice}
                    </p>
                )}

                {items.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center">
                        <p className="text-sm font-medium text-gray-600">{emptyText}</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {items.map((item) => (
                            <li key={item.id} className="rounded-2xl border-2 border-blue-100 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-bold tracking-wide text-blue-700">{item.id}</span>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusChip(item.status)}`}>{item.status}</span>
                                </div>
                                <p className="mt-1 text-sm font-bold text-brand-600">{item.subject}</p>
                                <p className="mt-1 text-xs font-medium text-gray-400">{item.category} · {item.date}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

export default function TeacherHome() {
    const navigate = useNavigate();
    const [activeModule, setActiveModule] = useState(DEFAULT_MODULE);

    // NUEVO ESTADO: Controla qué tabla de alumnos vemos ('ranking' o 'lista')
    const [studentView, setStudentView] = useState('ranking');

    const [classData, setClassData] = useState(USE_MOCK ? MOCK_CLASS : null);
    const [loading, setLoading] = useState(!USE_MOCK);
    const [loadError, setLoadError] = useState('');

    const [selected, setSelected] = useState(null);
    const [understood, setUnderstood] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [students, setStudents] = useState(USE_MOCK ? MOCK_STUDENTS : null);
    const [studentsLoading, setStudentsLoading] = useState(!USE_MOCK);
    const [studentsError, setStudentsError] = useState('');

    // Perfil del docente (por ahora solo en pantalla, sin API).
    const [profile, setProfile] = useState({ displayName: '', school: '', email: '' });
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileDraft, setProfileDraft] = useState({ displayName: '', school: '', email: '' });
    const [profileSaved, setProfileSaved] = useState(false);

    // Soporte: tickets del docente (por ahora solo en pantalla, sin API).
    const [tickets, setTickets] = useState(USE_MOCK ? MOCK_TICKETS : []);
    const [ticketForm, setTicketForm] = useState(EMPTY_TICKET);
    const [showTicketForm, setShowTicketForm] = useState(false);
    const [ticketNotice, setTicketNotice] = useState('');

    // Comunidad: mensajes y reportes del docente (por ahora solo en pantalla, sin API).
    const [posts, setPosts] = useState(USE_MOCK ? MOCK_POSTS : []);
    const [postForm, setPostForm] = useState(EMPTY_POST);
    const [showPostForm, setShowPostForm] = useState(false);
    const [postNotice, setPostNotice] = useState('');

    function toLogin() {
        clearSession();
        navigate('/login', { replace: true });
    }

    // Carga de la clase (solo con el backend real).
    useEffect(() => {
        if (USE_MOCK) return undefined;
        let active = true;
        const session = getSession();
        if (!session) {
            toLogin();
            return undefined;
        }
        getClass(session.token)
            .then((data) => {
                if (active) setClassData(data);
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 401) toLogin();
                else setLoadError(err.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Carga de estudiantes (solo con el backend real).
    useEffect(() => {
        if (USE_MOCK) return undefined;
        let active = true;
        const session = getSession();
        if (!session) return undefined;
        getStudents(session.token)
            .then((data) => {
                if (active) setStudents(data);
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 401) toLogin();
                else setStudentsError(err.message);
            })
            .finally(() => {
                if (active) setStudentsLoading(false);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function chooseGrade(option) {
        setSelected(option);
        setUnderstood(false);
        setError('');
    }

    function handleGradeSelect(e) {
        const option = classData.grades.find((g) => String(g.grade) === e.target.value);
        if (option) chooseGrade(option);
        else setSelected(null);
    }

    async function handleConfirm() {
        // Modo diseño: simula el guardado.
        if (USE_MOCK) {
            setSaving(true);
            setTimeout(() => {
                setClassData((prev) => ({ ...prev, classGrade: selected.grade, classLevel: selected.level }));
                setSelected(null);
                setSaving(false);
            }, 800);
            return;
        }

        const session = getSession();
        if (!session) {
            toLogin();
            return;
        }
        setError('');
        setSaving(true);
        try {
            const updated = await declareGrade(session.token, selected.grade);
            setClassData(updated);
            setSelected(null);
        } catch (err) {
            if (err.status === 401) {
                toLogin();
            } else if (err.status === 409 && err.code === 'GRADE_LOCKED') {
                // Otra petición ya declaró el grado: se recarga el estado y se muestra ese grado.
                try {
                    setClassData(await getClass(session.token));
                    setSelected(null);
                } catch (reloadErr) {
                    setError(reloadErr.message);
                }
            } else {
                setError(err.message);
            }
        } finally {
            setSaving(false);
        }
    }

    const teacherName = profile.displayName || classData?.displayName || 'Docente';

    function startEditProfile() {
        setProfileDraft({ displayName: teacherName, school: profile.school, email: profile.email });
        setProfileSaved(false);
        setEditingProfile(true);
    }

    function handleProfileSave(e) {
        e.preventDefault();
        const displayName = profileDraft.displayName.trim();
        if (!displayName) return;
        // TODO: cuando exista la API, enviar aquí los datos del perfil al backend.
        setProfile({ displayName, school: profileDraft.school.trim(), email: profileDraft.email.trim() });
        setEditingProfile(false);
        setProfileSaved(true);
    }

    // Desde el nivel bloqueado: abre Soporte con el ticket de cambio de nivel ya preparado.
    function openLevelTicket() {
        setTicketForm({ subject: 'Solicitud de cambio de nivel de la clase', category: 'nivel', message: '' });
        setTicketNotice('');
        setShowTicketForm(true);
        setActiveModule('soporte');
    }

    function handleTicketSubmit(e) {
        e.preventDefault();
        const item = buildItem('TCK', tickets, TICKET_CATEGORIES, ticketForm, 'Abierto');
        if (!item) return;
        // TODO: cuando exista la API, enviar aquí { subject, category, message } al backend.
        setTickets((prev) => [item, ...prev]);
        setTicketForm(EMPTY_TICKET);
        setShowTicketForm(false);
        setTicketNotice(`Ticket ${item.id} creado.`);
    }

    function handlePostSubmit(e) {
        e.preventDefault();
        const item = buildItem('MSG', posts, COMMUNITY_CATEGORIES, postForm, 'Enviado');
        if (!item) return;
        // TODO: cuando exista la API, enviar aquí { subject, category, message } al backend.
        setPosts((prev) => [item, ...prev]);
        setPostForm(EMPTY_POST);
        setShowPostForm(false);
        setPostNotice(`${item.id} enviado.`);
    }

    const locked = classData !== null && classData.classGrade !== null;

    // Datos derivados para las gráficas (se calculan con la lista de estudiantes).
    const list = students || [];
    const totalStudents = list.length;
    const totalXp = list.reduce((sum, s) => sum + (Number(s.xp) || 0), 0);
    const totalActivities = list.reduce((sum, s) => sum + (Number(s.completedActivities) || 0), 0);

    function averageOf(key) {
        const values = list.map((s) => s.averages?.[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
        return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    }

    const moduleAverages = [
        { key: 'vocabulary', label: 'Vocabulary', value: averageOf('vocabulary') },
        { key: 'grammar', label: 'Grammar', value: averageOf('grammar') },
        { key: 'reading', label: 'Reading', value: averageOf('reading') },
    ];
    const known = moduleAverages.filter((m) => m.value !== null);
    const overall = known.length ? Math.round(known.reduce((a, m) => a + m.value, 0) / known.length) : null;

    // Listas ordenadas
    const ranked = [...list].sort((a, b) => (Number(b.xp) || 0) - (Number(a.xp) || 0));
    const maxXp = Math.max(1, ...ranked.map((s) => Number(s.xp) || 0));
    
    // NUEVO: Lista completa en orden alfabético
    const alphabeticalList = [...list].sort((a, b) => a.alias.localeCompare(b.alias));

    return (
        <div className="relative min-h-screen font-sans">
            <WindBackdrop />

            <div className="relative z-10">
                <TopBar name={teacherName} />

                <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
                    {/* Panel izquierdo: módulos del docente */}
                    <aside className="sticky top-4 hidden w-60 shrink-0 self-start rounded-[1.75rem] bg-white p-3 shadow-[0_6px_24px_rgb(7,48,54,0.25)] lg:block">
                        <p className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wider text-gray-400">Módulos</p>
                        <nav className="space-y-1" aria-label="Módulos del docente">
                            {MODULES.map(({ id, label, Icon }) => {
                                const active = activeModule === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setActiveModule(id)}
                                        aria-current={active ? 'page' : undefined}
                                        className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                                            active
                                                ? 'bg-blue-50 font-medium text-gray-900'
                                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                        }`}
                                    >
                                        {active && (
                                            <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-gradient-to-b from-blue-300 to-blue-600" />
                                        )}
                                        <span className={active ? 'text-blue-600' : 'text-gray-400'}>
                                            <Icon />
                                        </span>
                                        {label}
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

                    <main className="min-w-0 flex-1 space-y-6">
                        {/* Menú de módulos en pantallas pequeñas */}
                        <nav className="flex gap-2 overflow-x-auto rounded-full bg-white p-2 shadow-[0_6px_24px_rgb(7,48,54,0.25)] lg:hidden" aria-label="Módulos del docente">
                            {MODULES.map(({ id, label, Icon }) => {
                                const active = activeModule === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setActiveModule(id)}
                                        aria-current={active ? 'page' : undefined}
                                        className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
                                            active ? 'bg-blue-600 font-medium text-white' : 'text-gray-500 hover:bg-blue-50'
                                        }`}
                                    >
                                        <Icon />
                                        {label}
                                    </button>
                                );
                            })}
                        </nav>

                        {/* Encabezado */}
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 -rotate-6 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                                <IconCap className="h-7 w-7" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-display tracking-wide text-white">Centro de Mando</h1>
                                <p className="text-sm font-medium text-brand-100">Gestiona tu clase y el progreso de tus alumnos</p>
                            </div>
                        </div>

                        {loading && <p className="text-center text-sm text-brand-100">Cargando...</p>}
                        {loadError && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">{loadError}</div>}
                        {studentsError && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">{studentsError}</div>}

                        {/* ===== Módulo: Docente (su clase y su perfil) ===== */}
                        {activeModule === 'docente' && (
                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                                {/* Izquierda: código y un solo grado */}
                                {classData && (
                                    <div className="space-y-6 lg:col-span-7">
                                        <section className={`${CARD} flex flex-col items-center justify-center text-center`}>
                                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">Código de Invitación</p>
                                            <p className="rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-3xl font-display tracking-widest text-blue-700">
                                                {classData.classCode}
                                            </p>
                                            <p className="mt-3 text-xs font-medium text-gray-500">Tus estudiantes lo usan para unirse a tu aula.</p>
                                        </section>

                                        <section className={CARD}>
                                            <Title>Grado de la clase</Title>

                                            {locked ? (
                                                <div className="mt-4 rounded-2xl border-2 border-blue-100 bg-blue-50 p-5">
                                                    <p className="flex items-center gap-3 text-xl font-display text-brand-600">
                                                        <span aria-hidden="true" className="text-2xl"></span>
                                                        {gradeLabel(classData.classGrade, classData.classLevel)}
                                                    </p>
                                                    <p className="mt-3 text-xs font-medium text-gray-500">
                                                        Nivel establecido. Si fue un error, abre un ticket con el gestor de cuentas.
                                                    </p>
                                                    <button type="button" onClick={openLevelTicket} className={`${BTN_PRIMARY} mt-4 !py-2 text-sm`}>
                                                        Abrir ticket
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="mt-4 space-y-4">
                                                    <div>
                                                        <label htmlFor="grade-select" className={LABEL}>Tu grado</label>
                                                        <select
                                                            id="grade-select"
                                                            className={FIELD}
                                                            value={selected ? String(selected.grade) : ''}
                                                            onChange={handleGradeSelect}
                                                        >
                                                            <option value="">Selecciona el grado que impartes</option>
                                                            {classData.grades.map((option) => (
                                                                <option key={option.grade} value={String(option.grade)}>
                                                                    {gradeLabel(option.grade, option.level)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {selected && (
                                                        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                                                            <p className="text-xs font-bold text-amber-800">
                                                                ATENCIÓN: Este nivel no se puede cambiar durante todo el periodo escolar.
                                                            </p>
                                                            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-amber-900">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={understood}
                                                                    onChange={(e) => setUnderstood(e.target.checked)}
                                                                    className="h-5 w-5 rounded accent-blue-600"
                                                                />
                                                                Entiendo que es definitivo
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={handleConfirm}
                                                                disabled={!understood || saving}
                                                                className={`${BTN_PRIMARY} w-full`}
                                                            >
                                                                {saving ? 'Guardando...' : `Confirmar ${gradeLabel(selected.grade, selected.level)}`}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </section>
                                    </div>
                                )}

                                {/* Derecha: perfil editable */}
                                <section className={`${CARD} h-fit lg:col-span-5 lg:col-start-8`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Title>Mi perfil</Title>
                                        {!editingProfile && (
                                            <button type="button" onClick={startEditProfile} className={BTN_SECONDARY}>
                                                Editar perfil
                                            </button>
                                        )}
                                    </div>

                                    <div className="mt-5 flex items-center gap-4">
                                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700">
                                            {String(teacherName).charAt(0).toUpperCase()}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-lg font-bold text-brand-600">{teacherName}</p>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Docente</p>
                                        </div>
                                    </div>

                                    {profileSaved && !editingProfile && (
                                        <p role="status" className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-center text-sm font-medium text-blue-700">
                                            Perfil actualizado.
                                        </p>
                                    )}

                                    {editingProfile ? (
                                        <form onSubmit={handleProfileSave} className="mt-5 space-y-4">
                                            <div>
                                                <label htmlFor="profile-name" className={LABEL}>Nombre para mostrar</label>
                                                <input
                                                    id="profile-name"
                                                    className={FIELD}
                                                    value={profileDraft.displayName}
                                                    onChange={(e) => setProfileDraft({ ...profileDraft, displayName: e.target.value })}
                                                    maxLength={60}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label htmlFor="profile-school" className={LABEL}>Institución</label>
                                                <input
                                                    id="profile-school"
                                                    className={FIELD}
                                                    value={profileDraft.school}
                                                    onChange={(e) => setProfileDraft({ ...profileDraft, school: e.target.value })}
                                                    placeholder="Ej. Escuela Primaria Central"
                                                    maxLength={80}
                                                />
                                            </div>
                                            <div>
                                                <label htmlFor="profile-email" className={LABEL}>Correo de contacto</label>
                                                <input
                                                    id="profile-email"
                                                    type="email"
                                                    className={FIELD}
                                                    value={profileDraft.email}
                                                    onChange={(e) => setProfileDraft({ ...profileDraft, email: e.target.value })}
                                                    placeholder="nombre@correo.com"
                                                    maxLength={80}
                                                />
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button type="submit" className={BTN_PRIMARY}>Guardar</button>
                                                <button type="button" onClick={() => setEditingProfile(false)} className={`${BTN_SECONDARY} py-3`}>
                                                    Cancelar
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <dl className="mt-5 space-y-4 text-sm">
                                            <div>
                                                <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Institución</dt>
                                                <dd className="mt-0.5 font-medium text-gray-700">{profile.school || 'Sin definir'}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Correo de contacto</dt>
                                                <dd className="mt-0.5 font-medium text-gray-700">{profile.email || 'Sin definir'}</dd>
                                            </div>
                                        </dl>
                                    )}
                                </section>

                                {/* NUEVA SECCION: TABLAS CON PESTAÑAS */}
                                <section className={`${CARD} lg:col-span-12`}>
                                    <div className="mb-5 flex items-center gap-6 border-b-2 border-gray-100">
                                        <button 
                                            onClick={() => setStudentView('ranking')}
                                            className={`pb-3 -mb-[2px] text-base font-bold transition-colors ${studentView === 'ranking' ? 'border-b-[3px] border-blue-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            Ranking - Activos
                                        </button>
                                        <button 
                                            onClick={() => setStudentView('lista')}
                                            className={`pb-3 -mb-[2px] text-base font-bold transition-colors ${studentView === 'lista' ? 'border-b-[3px] border-blue-600 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            Lista Completa
                                        </button>
                                        {students && (
                                            <span className="ml-auto mb-3 rounded-full bg-blue-100 px-4 py-1 text-sm font-bold text-blue-800">
                                                {students.length} Registrados
                                            </span>
                                        )}
                                    </div>

                                    {studentsLoading && <p className="text-sm text-gray-500">Cargando estudiantes...</p>}

                                    {students && students.length === 0 && (
                                        <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center">
                                            <p className="text-sm font-medium text-gray-600">Aún no hay estudiantes registrados con tu código de clase.</p>
                                        </div>
                                    )}

                                    {/* PESTAÑA DE RANKING (FILTRA LOS QUE TIENEN > 0 XP) */}
                                    {students && students.length > 0 && studentView === 'ranking' && (
                                        <div className="overflow-x-auto rounded-2xl border-2 border-blue-100">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-blue-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                                    <tr>
                                                        <th scope="col" className="px-4 py-3">Jugador</th>
                                                        <th scope="col" className="px-4 py-3">Nivel / XP</th>
                                                        <th scope="col" className="px-4 py-3">Misiones</th>
                                                        <th scope="col" className="px-4 py-3 text-center">Vocab.</th>
                                                        <th scope="col" className="px-4 py-3 text-center">Gram.</th>
                                                        <th scope="col" className="px-4 py-3 text-center">Lect.</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-blue-50">
                                                    {ranked.filter(s => s.xp > 0).map((student, index) => (
                                                        <tr key={student.userId} className="transition-colors hover:bg-blue-50/60">
                                                            <th scope="row" className="whitespace-nowrap px-4 py-3 font-bold text-brand-600">
                                                                <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                                                    {index + 1}
                                                                </span>
                                                                {student.alias}
                                                            </th>
                                                            <td className="px-4 py-3 font-medium text-gray-600">
                                                                <span className="font-bold text-blue-600">Lvl {student.level}</span>
                                                                <span className="ml-2 text-xs text-gray-400">({student.xp} XP)</span>
                                                            </td>
                                                            <td className="px-4 py-3 font-bold text-gray-700">{student.completedActivities}</td>
                                                            {['vocabulary', 'grammar', 'reading'].map((module) => (
                                                                <td key={module} className="px-4 py-3 text-center">
                                                                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${averageChip(student.averages?.[module])}`}>
                                                                        {formatAverage(student.averages?.[module])}
                                                                    </span>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* PESTAÑA DE LISTA COMPLETA (ORDEN ALFABÉTICO) */}
                                    {students && students.length > 0 && studentView === 'lista' && (
                                        <div className="overflow-x-auto rounded-2xl border-2 border-blue-100">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-blue-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                                    <tr>
                                                        <th scope="col" className="px-4 py-3">Jugador (A-Z)</th>
                                                        <th scope="col" className="px-4 py-3">Estado</th>
                                                        <th scope="col" className="px-4 py-3">Nivel Actual</th>
                                                        <th scope="col" className="px-4 py-3">Experiencia</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-blue-50">
                                                    {alphabeticalList.map((student) => {
                                                        const isInactive = student.xp === 0;
                                                        return (
                                                            <tr key={student.userId} className={`transition-colors hover:bg-blue-50/60 ${isInactive ? 'bg-gray-50/50 opacity-80' : ''}`}>
                                                                <th scope="row" className={`whitespace-nowrap px-4 py-3 font-bold ${isInactive ? 'text-gray-500' : 'text-brand-600'}`}>
                                                                    {student.alias}
                                                                </th>
                                                                <td className="px-4 py-3 font-medium">
                                                                    {isInactive 
                                                                        ? <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-600">Sin empezar</span>
                                                                        : <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">Jugando</span>
                                                                    }
                                                                </td>
                                                                <td className="px-4 py-3 font-medium text-gray-600">
                                                                    Nivel {student.level}
                                                                </td>
                                                                <td className="px-4 py-3 font-bold text-gray-700">
                                                                    {student.xp} XP
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}

                        {/* ===== Módulo: Datos y Reportes (ver datos de sus clases) ===== */}
                        {activeModule === 'datos' && (
                            <>
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                                    <section className={`${CARD} lg:col-span-5`}>
                                        <Title>Promedio por módulo</Title>
                                        <div className="mt-6 flex h-48 items-end justify-around gap-4">
                                            {moduleAverages.map((m, i) => (
                                                <div key={m.key} className="flex h-full flex-1 flex-col items-center">
                                                    <div className="flex w-full flex-1 items-end justify-center">
                                                        <div
                                                            className={`w-full max-w-[56px] rounded-t-2xl ${BAR_COLORS[i]}`}
                                                            style={{ height: `${m.value ?? 2}%`, minHeight: 6 }}
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-sm font-bold text-gray-700">{formatAverage(m.value)}</p>
                                                    <p className="text-xs font-semibold text-gray-400">{m.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section className={`${CARD} flex flex-col items-center lg:col-span-3`}>
                                        <div className="self-start">
                                            <Title>Promedio general</Title>
                                        </div>
                                        <div className="relative mt-4 flex items-center justify-center">
                                            <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90" aria-hidden="true">
                                                <circle cx="60" cy="60" r="52" fill="none" strokeWidth="14" className="stroke-blue-100" />
                                                <circle
                                                    cx="60"
                                                    cy="60"
                                                    r="52"
                                                    fill="none"
                                                    strokeWidth="14"
                                                    strokeLinecap="round"
                                                    className="stroke-blue-600"
                                                    strokeDasharray={`${((overall ?? 0) / 100) * RING} ${RING}`}
                                                />
                                            </svg>
                                            <span className="absolute text-3xl font-bold text-brand-600">{formatAverage(overall)}</span>
                                        </div>
                                        <p className="mt-3 text-center text-xs font-medium text-gray-400">Media de Vocabulary, Grammar y Reading</p>
                                    </section>

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-1">
                                        <StatCard Icon={IconUsers} label="Estudiantes" value={totalStudents} />
                                        <StatCard Icon={IconBolt} label="XP total" value={totalXp} />
                                        <StatCard Icon={IconCheck} label="Misiones completadas" value={totalActivities} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                                    <section className={`${CARD} lg:col-span-4`}>
                                        <Title>Top XP</Title>
                                        {ranked.length === 0 ? (
                                            <p className="mt-4 text-sm text-gray-500">Aún no hay estudiantes.</p>
                                        ) : (
                                            <ul className="mt-5 space-y-4">
                                                {ranked.slice(0, 5).map((student) => {
                                                    const xp = Number(student.xp) || 0;
                                                    return (
                                                        <li key={student.userId}>
                                                            <div className="mb-1 flex items-baseline justify-between gap-2">
                                                                <span className="truncate text-sm font-bold text-brand-600">{student.alias}</span>
                                                                <span className="text-xs font-semibold text-gray-400">{xp} XP</span>
                                                            </div>
                                                            <div className="h-2.5 overflow-hidden rounded-full bg-blue-100">
                                                                <div className="h-full rounded-full bg-blue-600" style={{ width: `${(xp / maxXp) * 100}%` }} />
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </section>

                                    {/* MANTUVIMOS EL RANKING TAMBIÉN EN LA VISTA DE DATOS, COMO ESTABA ANTES */}
                                    <section className={`${CARD} lg:col-span-8`}>
                                        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                                            <Title>🏆 Ranking de Estudiantes</Title>
                                            {students && (
                                                <span className="rounded-full bg-blue-100 px-4 py-1 text-sm font-bold text-blue-800">
                                                    {students.length === 1 ? '1 Jugador Activo' : `${students.length} Jugadores Activos`}
                                                </span>
                                            )}
                                        </div>

                                        {studentsLoading && <p className="text-sm text-gray-500">Cargando estudiantes...</p>}

                                        {students && students.length === 0 && (
                                            <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center">
                                                <p className="text-sm font-medium text-gray-600">Aún no hay estudiantes registrados con tu código de clase.</p>
                                            </div>
                                        )}

                                        {students && students.length > 0 && (
                                            <div className="overflow-x-auto rounded-2xl border-2 border-blue-100">
                                                <table className="w-full text-left text-sm">
                                                    <thead className="bg-blue-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                                        <tr>
                                                            <th scope="col" className="px-4 py-3">Jugador</th>
                                                            <th scope="col" className="px-4 py-3">Nivel / XP</th>
                                                            <th scope="col" className="px-4 py-3">Misiones</th>
                                                            <th scope="col" className="px-4 py-3 text-center">Vocab.</th>
                                                            <th scope="col" className="px-4 py-3 text-center">Gram.</th>
                                                            <th scope="col" className="px-4 py-3 text-center">Lect.</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-blue-50">
                                                        {ranked.map((student, index) => (
                                                            <tr key={student.userId} className="transition-colors hover:bg-blue-50/60">
                                                                <th scope="row" className="whitespace-nowrap px-4 py-3 font-bold text-brand-600">
                                                                    <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                                                        {index + 1}
                                                                    </span>
                                                                    {student.alias}
                                                                </th>
                                                                <td className="px-4 py-3 font-medium text-gray-600">
                                                                    <span className="font-bold text-blue-600">Lvl {student.level}</span>
                                                                    <span className="ml-2 text-xs text-gray-400">({student.xp} XP)</span>
                                                                </td>
                                                                <td className="px-4 py-3 font-bold text-gray-700">{student.completedActivities}</td>
                                                                {['vocabulary', 'grammar', 'reading'].map((module) => (
                                                                    <td key={module} className="px-4 py-3 text-center">
                                                                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${averageChip(student.averages?.[module])}`}>
                                                                            {formatAverage(student.averages?.[module])}
                                                                        </span>
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            </>
                        )}

                        {/* ===== Módulo: Comunidad y Moderación ===== */}
                        {activeModule === 'comunidad' && (
                            <RequestModule
                                idPrefix="post"
                                listTitle="Mis mensajes"
                                newButtonLabel="Nuevo mensaje"
                                formTitle="Nuevo mensaje"
                                categories={COMMUNITY_CATEGORIES}
                                categoryLabel="Tipo"
                                subjectLabel="Título"
                                subjectPlaceholder="Ej. Recordatorio de la actividad de esta semana"
                                messageLabel="Mensaje"
                                messagePlaceholder="Escribe lo que quieres compartir con la comunidad..."
                                submitLabel="Enviar mensaje"
                                emptyText="Aún no has enviado mensajes."
                                items={posts}
                                showForm={showPostForm}
                                onToggleForm={() => {
                                    setShowPostForm((v) => !v);
                                    setPostNotice('');
                                }}
                                form={postForm}
                                onFormChange={(field, value) => setPostForm((f) => ({ ...f, [field]: value }))}
                                onSubmit={handlePostSubmit}
                                notice={postNotice}
                            />
                        )}

                        {/* ===== Módulo: Soporte ===== */}
                        {activeModule === 'soporte' && (
                            <RequestModule
                                idPrefix="ticket"
                                listTitle="Mis tickets"
                                newButtonLabel="Nuevo ticket"
                                formTitle="Nuevo ticket"
                                categories={TICKET_CATEGORIES}
                                categoryLabel="Tipo de consulta"
                                subjectLabel="Asunto"
                                subjectPlaceholder="Ej. No puedo ver a un estudiante"
                                messageLabel="Mensaje"
                                messagePlaceholder="Cuéntanos qué necesitas..."
                                submitLabel="Generar ticket"
                                emptyText="Aún no has creado tickets."
                                items={tickets}
                                showForm={showTicketForm}
                                onToggleForm={() => {
                                    setShowTicketForm((v) => !v);
                                    setTicketNotice('');
                                }}
                                form={ticketForm}
                                onFormChange={(field, value) => setTicketForm((f) => ({ ...f, [field]: value }))}
                                onSubmit={handleTicketSubmit}
                                notice={ticketNotice}
                            />
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}