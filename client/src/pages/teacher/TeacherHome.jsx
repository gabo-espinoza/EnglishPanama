import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { declareGrade, getClass, getDifficultTopics, getStudents } from '../../api/teacher';
import { clearSession, getSession } from '../../api/session';
import TopBar from '../../components/TopBar';
import WindBackdrop from '../../components/WindBackdrop';

const CARD = 'bg-white rounded-[1.75rem] shadow-[0_6px_24px_rgb(7,48,54,0.25)] p-5 sm:p-6';
const ERROR_BOX = 'p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center';
const EMPTY_BOX = 'rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center';
const BAR_COLORS = ['bg-blue-600', 'bg-brand-500', 'bg-amber-300'];

const TABS = [
    { id: 'clase', label: 'Mi clase' },
    { id: 'estudiantes', label: 'Estudiantes' },
    { id: 'progreso', label: 'Progreso' },
];

const MODULES = [
    { key: 'vocabulary', label: 'Vocabulario' },
    { key: 'grammar', label: 'Gramática' },
    { key: 'reading', label: 'Lectura' },
];

function gradeLabel(grade, level) {
    return `${grade}.º grado · ${level}`;
}

// Promedio en porcentaje; sin intentos en el módulo llega null y se muestra "—".
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

function Title({ children }) {
    return (
        <h2 className="inline-block border-b-[3px] border-blue-300 text-lg font-bold leading-tight text-brand-600">
            {children}
        </h2>
    );
}

function StatCard({ label, value }) {
    return (
        <div className={`${CARD} !p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-brand-600">{value}</p>
        </div>
    );
}

// Panel docente: código de la clase, declaración del grado (una sola vez), estudiantes y progreso.
export default function TeacherHome() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('clase');

    const [classData, setClassData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [selected, setSelected] = useState(null);
    const [understood, setUnderstood] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [students, setStudents] = useState(null);
    const [studentsLoading, setStudentsLoading] = useState(true);
    const [studentsError, setStudentsError] = useState('');
    const [sortBy, setSortBy] = useState('xp');

    const [topics, setTopics] = useState(null);
    const [topicsLoading, setTopicsLoading] = useState(true);
    const [topicsError, setTopicsError] = useState('');

    function toLogin() {
        clearSession();
        navigate('/login', { replace: true });
    }

    // Carga idempotente: si StrictMode ejecuta el efecto dos veces, solo cuenta la última respuesta.
    useEffect(() => {
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

    // Lista de estudiantes: carga independiente de la clase, con su propio estado de carga y error.
    useEffect(() => {
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

    // Temas difíciles: carga independiente; un fallo aquí no afecta a la clase ni a los estudiantes.
    useEffect(() => {
        let active = true;
        const session = getSession();
        if (!session) return undefined;
        getDifficultTopics(session.token, 5)
            .then((data) => {
                if (active) setTopics(data);
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 401) toLogin();
                else setTopicsError(err.message);
            })
            .finally(() => {
                if (active) setTopicsLoading(false);
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

    async function handleConfirm() {
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

    const locked = classData !== null && classData.classGrade !== null;

    // Datos derivados solo de los campos reales de GET /api/teacher/students.
    const list = students || [];
    const totalXp = list.reduce((sum, s) => sum + (Number(s.xp) || 0), 0);
    const totalActivities = list.reduce((sum, s) => sum + (Number(s.completedActivities) || 0), 0);

    // Promedio de la clase por módulo: media de los estudiantes que sí tienen intentos (null si ninguno).
    function averageOf(key) {
        const values = list.map((s) => s.averages?.[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
        return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    }
    const moduleAverages = MODULES.map((m) => ({ ...m, value: averageOf(m.key) }));

    const byXp = [...list].sort((a, b) => (Number(b.xp) || 0) - (Number(a.xp) || 0) || a.alias.localeCompare(b.alias));
    const byAlias = [...list].sort((a, b) => a.alias.localeCompare(b.alias));
    const shown = sortBy === 'xp' ? byXp : byAlias;
    const maxXp = Math.max(1, ...byXp.map((s) => Number(s.xp) || 0));

    const studentCount = students ? (students.length === 1 ? '1 estudiante' : `${students.length} estudiantes`) : null;

    return (
        <div className="relative min-h-screen font-sans">
            <WindBackdrop />

            <div className="relative z-10">
                <TopBar name={classData?.displayName || 'Docente'} />

                <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
                    <div>
                        <h1 className="text-3xl font-display tracking-wide text-white">Panel del docente</h1>
                        <p className="text-sm font-medium text-brand-100">Gestiona tu clase y revisa el progreso de tus estudiantes.</p>
                    </div>

                    <div
                        role="tablist"
                        aria-label="Secciones del panel docente"
                        className="flex gap-2 overflow-x-auto rounded-full bg-white p-2 shadow-[0_6px_24px_rgb(7,48,54,0.25)]"
                    >
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    id={`tab-${tab.id}`}
                                    aria-selected={isActive}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
                                        isActive ? 'bg-blue-600 font-medium text-white' : 'text-gray-600 hover:bg-blue-50'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* ===== Mi clase ===== */}
                    {activeTab === 'clase' && (
                        <div role="tabpanel" id="panel-clase" aria-labelledby="tab-clase" className="animate-fade-in space-y-6">
                            {loading && <p className="text-center text-sm text-brand-100">Cargando...</p>}
                            {loadError && <div className={ERROR_BOX}>{loadError}</div>}

                            {classData && (
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                    <section className={`${CARD} flex flex-col justify-center`}>
                                        <p className="mb-1 text-sm text-gray-500">Tu código de clase</p>
                                        <p className="break-all text-4xl font-bold tracking-widest text-blue-700">{classData.classCode}</p>
                                        <p className="mt-3 text-sm text-gray-600">Compártelo con tus estudiantes para que se registren.</p>
                                    </section>

                                    <section className={CARD}>
                                        <Title>Nivel de la clase</Title>

                                        {locked ? (
                                            <div className="mt-4 rounded-2xl border-2 border-blue-100 bg-blue-50 p-5">
                                                <p className="text-xl font-semibold text-gray-900">
                                                    <span aria-hidden="true">🔒 </span>
                                                    {gradeLabel(classData.classGrade, classData.classLevel)}
                                                </p>
                                                <p className="mt-3 text-sm text-gray-600">
                                                    Si fue un error, abre un ticket con el gestor de cuentas.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="mt-4 space-y-5">
                                                <p className="text-sm text-gray-600">Elige el grado de tu clase.</p>
                                                <div className="flex flex-wrap gap-3">
                                                    {classData.grades.map((option) => {
                                                        const isSelected = selected?.grade === option.grade;
                                                        return (
                                                            <button
                                                                key={option.grade}
                                                                type="button"
                                                                onClick={() => chooseGrade(option)}
                                                                aria-pressed={isSelected}
                                                                className={`px-4 py-3 rounded-lg border text-sm font-semibold transition-colors ${
                                                                    isSelected
                                                                        ? 'bg-blue-600 border-blue-600 text-white'
                                                                        : 'bg-white border-gray-200 text-gray-700 hover:border-blue-500'
                                                                }`}
                                                            >
                                                                {gradeLabel(option.grade, option.level)}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {selected && (
                                                    <div className="space-y-4">
                                                        <div role="alert" className="p-4 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
                                                            Este nivel no se puede cambiar durante todo el periodo escolar. Si te equivocas, deberás pedir ayuda al gestor de cuentas.
                                                        </div>
                                                        <label htmlFor="grade-understood" className="flex items-center gap-2 text-sm text-gray-700">
                                                            <input
                                                                id="grade-understood"
                                                                type="checkbox"
                                                                checked={understood}
                                                                onChange={(e) => setUnderstood(e.target.checked)}
                                                                className="w-4 h-4 accent-blue-600"
                                                            />
                                                            Entiendo que no podré cambiarlo
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={handleConfirm}
                                                            disabled={!understood || saving}
                                                            className="auth-button disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {saving ? 'Guardando...' : `Confirmar ${gradeLabel(selected.grade, selected.level)}`}
                                                        </button>
                                                    </div>
                                                )}

                                                {error && <div className={ERROR_BOX}>{error}</div>}
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ===== Estudiantes ===== */}
                    {activeTab === 'estudiantes' && (
                        <div role="tabpanel" id="panel-estudiantes" aria-labelledby="tab-estudiantes" className="animate-fade-in">
                            <section className={CARD}>
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <Title>Estudiantes de tu clase</Title>
                                    {studentCount && <p className="text-sm text-gray-500">{studentCount}</p>}
                                </div>

                                {studentsLoading && <p className="text-sm text-gray-500">Cargando estudiantes...</p>}
                                {studentsError && <div className={ERROR_BOX}>{studentsError}</div>}

                                {students && students.length === 0 && (
                                    <div className={EMPTY_BOX}>
                                        <p className="text-sm font-medium text-gray-600">Aún no hay estudiantes registrados con tu código de clase.</p>
                                        {!classData && <p className="mt-1 text-sm text-gray-600">Compártelo con tus estudiantes para que se registren.</p>}
                                    </div>
                                )}

                                {students && students.length > 0 && (
                                    <>
                                        <div className="mb-4 flex flex-wrap items-center gap-2">
                                            <span className="text-sm text-gray-500">Ordenar:</span>
                                            <button
                                                type="button"
                                                aria-pressed={sortBy === 'xp'}
                                                onClick={() => setSortBy('xp')}
                                                className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                                                    sortBy === 'xp' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                                }`}
                                            >
                                                Por XP
                                            </button>
                                            <button
                                                type="button"
                                                aria-pressed={sortBy === 'alias'}
                                                onClick={() => setSortBy('alias')}
                                                className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                                                    sortBy === 'alias' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                                }`}
                                            >
                                                Por alias (A-Z)
                                            </button>
                                        </div>

                                        <div className="overflow-x-auto rounded-2xl border-2 border-blue-100">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-blue-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                                    <tr>
                                                        {sortBy === 'xp' && <th scope="col" className="px-4 py-3">Puesto</th>}
                                                        <th scope="col" className="px-4 py-3">Alias</th>
                                                        <th scope="col" className="px-4 py-3">XP</th>
                                                        <th scope="col" className="px-4 py-3 whitespace-nowrap">Nivel de XP</th>
                                                        <th scope="col" className="px-4 py-3">Actividades</th>
                                                        <th scope="col" className="px-4 py-3 text-center">Vocabulario</th>
                                                        <th scope="col" className="px-4 py-3 text-center">Gramática</th>
                                                        <th scope="col" className="px-4 py-3 text-center">Lectura</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-blue-50">
                                                    {shown.map((student, index) => (
                                                        <tr key={student.userId} className="transition-colors hover:bg-blue-50/60">
                                                            {sortBy === 'xp' && (
                                                                <td className="px-4 py-3">
                                                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                                                        {index + 1}
                                                                    </span>
                                                                </td>
                                                            )}
                                                            <th scope="row" className="whitespace-nowrap px-4 py-3 font-bold text-brand-600">{student.alias}</th>
                                                            <td className="px-4 py-3 text-gray-700">{student.xp}</td>
                                                            <td className="px-4 py-3 text-gray-700">{student.level}</td>
                                                            <td className="px-4 py-3 text-gray-700">{student.completedActivities}</td>
                                                            {MODULES.map((m) => (
                                                                <td key={m.key} className="px-4 py-3 text-center">
                                                                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${averageChip(student.averages?.[m.key])}`}>
                                                                        {formatAverage(student.averages?.[m.key])}
                                                                    </span>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </section>
                        </div>
                    )}

                    {/* ===== Progreso ===== */}
                    {activeTab === 'progreso' && (
                        <div role="tabpanel" id="panel-progreso" aria-labelledby="tab-progreso" className="animate-fade-in space-y-6">
                            <section className={CARD}>
                                <Title>Resumen de la clase</Title>
                                {studentsLoading && <p className="mt-4 text-sm text-gray-500">Cargando estudiantes...</p>}
                                {studentsError && <div className={`${ERROR_BOX} mt-4`}>{studentsError}</div>}

                                {students && students.length === 0 && (
                                    <div className={`${EMPTY_BOX} mt-4`}>
                                        <p className="text-sm font-medium text-gray-600">Aún no hay estudiantes registrados con tu código de clase.</p>
                                    </div>
                                )}

                                {students && students.length > 0 && (
                                    <>
                                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                                            <StatCard label="Estudiantes registrados" value={students.length} />
                                            <StatCard label="XP total de la clase" value={totalXp} />
                                            <StatCard label="Actividades completadas (suma)" value={totalActivities} />
                                        </div>

                                        <h3 className="mt-6 text-sm font-bold text-gray-700">Promedio de la clase por módulo</h3>
                                        <div className="mt-4 flex h-48 items-end justify-around gap-4">
                                            {moduleAverages.map((m, i) => (
                                                <div key={m.key} className="flex h-full flex-1 flex-col items-center">
                                                    <div className="flex w-full flex-1 items-end justify-center">
                                                        <div
                                                            className={`w-full max-w-[56px] rounded-t-2xl ${BAR_COLORS[i]}`}
                                                            style={{ height: `${m.value ?? 2}%`, minHeight: 6 }}
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-sm font-bold text-gray-700">{formatAverage(m.value)}</p>
                                                    <p className="text-xs font-semibold text-gray-500">{m.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="mt-3 text-xs text-gray-500">
                                            Media de los estudiantes que ya tienen intentos en cada módulo, solo con actividades del nivel de la clase.
                                        </p>
                                    </>
                                )}
                            </section>

                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                <section className={CARD}>
                                    <Title>Más XP</Title>
                                    {studentsLoading && <p className="mt-4 text-sm text-gray-500">Cargando estudiantes...</p>}
                                    {studentsError && <div className={`${ERROR_BOX} mt-4`}>{studentsError}</div>}
                                    {students && students.length === 0 && (
                                        <p className="mt-4 text-sm text-gray-600">Aún no hay estudiantes registrados con tu código de clase.</p>
                                    )}
                                    {students && students.length > 0 && (
                                        <ul className="mt-5 space-y-4">
                                            {byXp.slice(0, 5).map((student) => {
                                                const xp = Number(student.xp) || 0;
                                                return (
                                                    <li key={student.userId}>
                                                        <div className="mb-1 flex items-baseline justify-between gap-2">
                                                            <span className="truncate text-sm font-bold text-brand-600">{student.alias}</span>
                                                            <span className="shrink-0 text-xs font-semibold text-gray-500">{xp} XP</span>
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

                                <section className={CARD}>
                                    <Title>Temas con más errores</Title>
                                    {topicsLoading && <p className="mt-4 text-sm text-gray-500">Cargando temas...</p>}
                                    {topicsError && <div className={`${ERROR_BOX} mt-4`}>{topicsError}</div>}
                                    {topics && topics.length === 0 && (
                                        <p className="mt-4 text-sm text-gray-600">
                                            Aún no hay respuestas suficientes para mostrar temas difíciles. Aparecerán cuando tu clase tenga un nivel declarado y tus estudiantes completen actividades.
                                        </p>
                                    )}
                                    {topics && topics.length > 0 && (
                                        <ul className="mt-5 space-y-4">
                                            {topics.map((item) => (
                                                <li key={item.topic}>
                                                    <div className="mb-1 flex items-baseline justify-between gap-2">
                                                        <span className="truncate text-sm font-bold text-brand-600">{item.topic}</span>
                                                        <span className="shrink-0 text-xs font-semibold text-gray-500">
                                                            {item.errorRate}% de error · {item.errors} de {item.attempts}
                                                        </span>
                                                    </div>
                                                    <div className="h-2.5 overflow-hidden rounded-full bg-red-50">
                                                        <div className="h-full rounded-full bg-amber-300" style={{ width: `${Math.min(100, Math.max(0, item.errorRate))}%` }} />
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
