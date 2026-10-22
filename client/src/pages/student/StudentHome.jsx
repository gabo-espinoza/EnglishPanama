import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    completeDailyChallenge,
    getActivities,
    getDailyChallenge,
    getProfile,
    getRanking,
    updateAvatar
} from '../../api/student';
import { clearSession, getSession } from '../../api/session';
import TopBar from '../../components/TopBar';
import WindBackdrop from '../../components/WindBackdrop';

const CARD = 'bg-white rounded-[1.75rem] shadow-[0_6px_24px_rgb(7,48,54,0.25)] p-5 sm:p-6';
const ERROR_BOX = 'p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center';
const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400';

// Avatares: el servidor guarda un identificador corto (^[a-z0-9_-]{1,50}$); el emoji solo se dibuja aquí.
const AVATARS = [
    { slug: 'default', emoji: '🙂', label: 'Sonrisa' },
    { slug: 'fox', emoji: '🦊', label: 'Zorro' },
    { slug: 'cat', emoji: '🐱', label: 'Gato' },
    { slug: 'panda', emoji: '🐼', label: 'Panda' },
    { slug: 'owl', emoji: '🦉', label: 'Búho' },
    { slug: 'robot', emoji: '🤖', label: 'Robot' },
    { slug: 'rocket', emoji: '🚀', label: 'Cohete' },
    { slug: 'star', emoji: '⭐', label: 'Estrella' }
];

function emojiFor(slug) {
    return AVATARS.find((item) => item.slug === slug)?.emoji || '🙂';
}

const MODULES = [
    { slug: 'vocabulary', title: 'Vocabulario', icon: '📝' },
    { slug: 'grammar', title: 'Gramática', icon: '🧩' },
    { slug: 'reading', title: 'Lectura', icon: '📖' }
];

const TABS = [
    { id: 'misiones', label: 'Mis misiones' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'perfil', label: 'Mi perfil' }
];

// Carga de datos segura en StrictMode: solo cuenta la respuesta del efecto vigente.
// Cada llamada es independiente; un 401 manda al login y el resto de errores quedan en `error`.
function useLoad(loader, onUnauthorized) {
    const [state, setState] = useState({ data: null, error: null, loading: true });
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let active = true;
        const session = getSession();
        if (!session) {
            onUnauthorized();
            return undefined;
        }
        // "Cargando" solo mientras no hay datos; en una recarga se conservan los anteriores.
        setState((prev) => ({ ...prev, error: null, loading: prev.data === null }));
        loader(session.token)
            .then((data) => {
                if (active) setState({ data, error: null, loading: false });
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 401) onUnauthorized();
                else setState((prev) => ({ ...prev, error: err, loading: false }));
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [version]);

    function setData(updater) {
        setState((prev) => ({ ...prev, data: typeof updater === 'function' ? updater(prev.data) : updater }));
    }

    return { ...state, reload: () => setVersion((v) => v + 1), setData };
}

function Title({ children }) {
    return <h2 className="inline-block border-b-[3px] border-blue-300 text-lg font-bold leading-tight text-brand-600">{children}</h2>;
}

function SectionHeader({ title, subtitle }) {
    return (
        <div>
            <h2 className="text-3xl font-display tracking-wide text-white">{title}</h2>
            <p className="text-sm font-medium text-brand-100">{subtitle}</p>
        </div>
    );
}

// Tarjeta de un módulo: pide sus actividades al montarse (solo se monta si la clase tiene nivel).
function ModuleCard({ slug, title, icon, onUnauthorized }) {
    const { data: activities, error, loading } = useLoad((token) => getActivities(token, slug), onUnauthorized);

    return (
        <section className={`${CARD} flex flex-col`} aria-labelledby={`module-${slug}`}>
            <div className="mb-4 flex items-center justify-between">
                <span className="text-4xl" aria-hidden="true">{icon}</span>
                {activities && (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
                        {activities.length} {activities.length === 1 ? 'actividad' : 'actividades'}
                    </span>
                )}
            </div>
            <h3 id={`module-${slug}`} className="text-xl font-display text-brand-600">{title}</h3>

            <div className="mt-4 flex-1">
                {loading && <p className="text-sm text-gray-500">Cargando...</p>}
                {error && <div className={ERROR_BOX} role="alert">{error.message}</div>}
                {activities && activities.length === 0 && (
                    <p className="text-sm text-gray-500">Aún no hay actividades en este módulo.</p>
                )}
                {activities && activities.length > 0 && (
                    <ul className="space-y-2">
                        {activities.map((activity) => (
                            <li key={activity.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                                <span className="min-w-0 break-words text-sm font-medium text-gray-800">{activity.title}</span>
                                {activity.isExample && (
                                    <span className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Ejemplo</span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <button
                type="button"
                disabled
                className="mt-5 w-full cursor-not-allowed rounded-2xl bg-gray-100 px-6 py-3 font-bold text-gray-400"
            >
                Próximamente
            </button>
        </section>
    );
}

function parseOptions(options) {
    if (Array.isArray(options)) return options;
    if (typeof options === 'string') {
        try {
            const parsed = JSON.parse(options);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

// Reto diario: el estudiante elige una opción y la envía; el servidor la califica y solo
// otorga XP si es correcta. Nunca se conoce ni se calcula la respuesta correcta en el cliente.
// Se monta solo si la clase tiene nivel. `onCompleted` recarga perfil y ranking (XP y posición).
function DailyChallengeCard({ onUnauthorized, onCompleted }) {
    const { data, error, loading, reload, setData } = useLoad(getDailyChallenge, onUnauthorized);
    const [selected, setSelected] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', text: '' });
    const submittingRef = useRef(false);

    const options = data ? parseOptions(data.question.options) : [];
    const completed = Boolean(data && data.completed);

    function choose(index) {
        setSelected(index);
        setFeedback({ type: '', text: '' });
    }

    async function handleSubmit(event) {
        event.preventDefault();
        // La referencia evita un doble envío antes de que React pinte el botón deshabilitado.
        if (submittingRef.current || selected === null || completed) return;
        const session = getSession();
        if (!session) {
            onUnauthorized();
            return;
        }
        submittingRef.current = true;
        setSubmitting(true);
        setFeedback({ type: '', text: '' });
        try {
            const result = await completeDailyChallenge(session.token, options[selected]);
            if (result.correct) {
                const xp = Number(result.xpEarned);
                setFeedback({
                    type: 'success',
                    text: Number.isFinite(xp) && xp > 0 ? `¡Correcto! Ganaste ${xp} XP` : '¡Correcto!'
                });
                setData((prev) => (prev ? { ...prev, completed: true } : prev));
                onCompleted();
            } else {
                setFeedback({ type: 'wrong', text: 'Esa no es la respuesta. Inténtalo de nuevo.' });
            }
        } catch (err) {
            if (err.status === 401) {
                onUnauthorized();
            } else if (err.status === 409) {
                // Ya estaba completado (otra pestaña o un envío simultáneo): se vuelve a leer el reto.
                reload();
                onCompleted();
            } else {
                setFeedback({ type: 'error', text: err.message });
            }
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }

    return (
        <section className={`${CARD} relative overflow-hidden bg-gradient-to-br from-blue-600 to-brand-600`} aria-labelledby="daily-title">
            <div className="relative z-10 text-white">
                <p id="daily-title" className="text-xs font-black uppercase tracking-wider text-blue-100">⭐ Reto del día</p>

                {loading && <p className="mt-2 text-sm text-blue-100">Cargando...</p>}
                {error && error.status === 404 && (
                    <p className="mt-2 text-sm text-blue-100">Hoy no hay un reto diario para tu clase.</p>
                )}
                {error && error.status !== 404 && (
                    <div className="mt-2 rounded-lg bg-white p-3 text-center text-sm text-red-600" role="alert">{error.message}</div>
                )}

                {data && (
                    <form onSubmit={handleSubmit}>
                        <h3 id="daily-prompt" className="mt-1 text-2xl font-display">{data.question.prompt}</h3>

                        {completed ? (
                            <div className="mt-4 space-y-2">
                                <p className="inline-block rounded-full bg-white/20 px-4 py-2 text-sm font-bold">Reto de hoy completado</p>
                                {feedback.type === 'success' && (
                                    <p className="text-sm font-bold text-blue-50" role="status">{feedback.text}</p>
                                )}
                            </div>
                        ) : (
                            <>
                                {options.length > 0 && (
                                    <div role="radiogroup" aria-labelledby="daily-prompt" className="mt-3 space-y-2">
                                        {options.map((option, index) => (
                                            <label key={index} className="block cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="daily-option"
                                                    className="peer sr-only"
                                                    checked={selected === index}
                                                    onChange={() => choose(index)}
                                                    disabled={submitting}
                                                />
                                                <span className="block rounded-lg bg-white/10 px-3 py-2.5 text-sm text-blue-50 transition peer-checked:bg-white peer-checked:font-bold peer-checked:text-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-white peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-blue-600">
                                                    {String(option)}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                    <button
                                        type="submit"
                                        disabled={selected === null || submitting}
                                        className="min-h-[44px] rounded-full bg-white px-6 py-2 text-sm font-bold text-blue-600 shadow transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {submitting ? 'Enviando...' : 'Responder'}
                                    </button>
                                </div>

                                {feedback.type === 'wrong' && (
                                    <p className="mt-3 rounded-lg bg-white/15 px-3 py-2 text-sm font-bold" role="status">{feedback.text}</p>
                                )}
                                {feedback.type === 'error' && (
                                    <div className="mt-3 rounded-lg bg-white p-3 text-center text-sm text-red-600" role="alert">{feedback.text}</div>
                                )}
                            </>
                        )}
                    </form>
                )}
            </div>
        </section>
    );
}

function XpBar({ profile }) {
    const percent = Math.min(100, Math.round((profile.xpIntoLevel / profile.xpForNextLevel) * 100));
    return (
        <div>
            <div
                className="h-3 w-full overflow-hidden rounded-full bg-blue-100"
                role="progressbar"
                aria-label="Progreso hacia el siguiente nivel"
                aria-valuemin={0}
                aria-valuemax={profile.xpForNextLevel}
                aria-valuenow={profile.xpIntoLevel}
            >
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 text-xs font-semibold text-gray-500">
                {profile.xpIntoLevel} / {profile.xpForNextLevel} XP para el nivel {profile.level + 1}
            </p>
        </div>
    );
}

function rankBadge(index) {
    if (index === 0) return 'bg-amber-400 text-amber-900';
    if (index === 1) return 'bg-gray-300 text-gray-800';
    if (index === 2) return 'bg-amber-700 text-white';
    return 'bg-blue-100 text-blue-700';
}

function AvatarPicker({ profile, onSaved, onUnauthorized }) {
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    async function choose(slug) {
        if (slug === profile.avatar || saving) return;
        const session = getSession();
        if (!session) {
            onUnauthorized();
            return;
        }
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            const updated = await updateAvatar(session.token, slug);
            onSaved(updated);
            setMessage({ type: 'ok', text: 'Avatar actualizado.' });
        } catch (err) {
            if (err.status === 401) onUnauthorized();
            else setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div>
            <p className={LABEL} id="avatar-label">Elige tu avatar</p>
            <div className="flex flex-wrap gap-3" role="group" aria-labelledby="avatar-label">
                {AVATARS.map((item) => {
                    const selected = profile.avatar === item.slug;
                    return (
                        <button
                            key={item.slug}
                            type="button"
                            onClick={() => choose(item.slug)}
                            disabled={saving}
                            aria-pressed={selected}
                            aria-label={item.label}
                            className={`h-14 w-14 rounded-2xl text-3xl transition-transform disabled:opacity-60 ${selected ? 'scale-110 border-4 border-blue-500 bg-blue-100' : 'border-2 border-gray-200 bg-gray-50 hover:scale-105 hover:bg-blue-50'}`}
                        >
                            <span aria-hidden="true">{item.emoji}</span>
                        </button>
                    );
                })}
            </div>
            {message.text && (
                <p
                    role={message.type === 'error' ? 'alert' : 'status'}
                    className={`mt-4 rounded-lg border p-3 text-center text-sm font-bold ${message.type === 'error' ? 'border-red-100 bg-red-50 text-red-600' : 'border-green-200 bg-green-50 text-green-700'}`}
                >
                    {message.text}
                </p>
            )}
        </div>
    );
}

// Panel del estudiante: nivel de la clase, reto diario, actividades por módulo, ranking y perfil.
export default function StudentHome() {
    const navigate = useNavigate();
    const [tab, setTab] = useState('misiones');

    function toLogin() {
        clearSession();
        navigate('/login', { replace: true });
    }

    const profileState = useLoad(getProfile, toLogin);
    const rankingState = useLoad(getRanking, toLogin);
    const { data: profile, setData: setProfile } = profileState;

    function handleAvatarSaved(updated) {
        setProfile((prev) => (prev ? { ...prev, avatar: updated.avatar } : prev));
        rankingState.reload();
    }

    // Completar el reto suma XP: se recargan el perfil (barra de XP) y el ranking (posición).
    function handleChallengeCompleted() {
        profileState.reload();
        rankingState.reload();
    }

    const ranking = rankingState.data ? [...rankingState.data].sort((a, b) => a.position - b.position) : null;
    const hasClassLevel = profile && profile.classLevel !== null;

    return (
        <div className="relative min-h-screen font-sans">
            <WindBackdrop />

            <div className="relative z-10">
                <TopBar name={profile ? `${profile.alias} ${emojiFor(profile.avatar)}` : 'Estudiante'} />

                <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
                    {profileState.loading && <p className="text-center text-sm font-medium text-white">Cargando...</p>}
                    {profileState.error && <div className={ERROR_BOX} role="alert">{profileState.error.message}</div>}

                    {profile && (
                        <>
                            {/* Identidad, nivel de la clase y progreso de XP */}
                            <section className={`${CARD} flex flex-col gap-5 sm:flex-row sm:items-center`} aria-label="Tu identidad">
                                <div className="relative mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-4xl shadow-md sm:mx-0">
                                    <span aria-hidden="true">{emojiFor(profile.avatar)}</span>
                                    <span className="absolute -bottom-2 -right-2 flex h-9 min-w-[2.25rem] items-center justify-center rounded-full border-2 border-white bg-amber-400 px-1 text-xs font-black text-amber-900">
                                        Nv. {profile.level}
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1 text-center sm:text-left">
                                    <h1 className="break-words text-2xl font-display text-brand-600">¡Hola, {profile.alias}!</h1>
                                    {hasClassLevel ? (
                                        <p className="text-sm font-bold text-blue-700">{profile.classGrade}.º grado · {profile.classLevel}</p>
                                    ) : (
                                        <p className="text-sm text-gray-600">Tu docente aún no ha elegido el nivel de la clase.</p>
                                    )}
                                    <p className="mt-1 text-sm font-bold text-amber-500">{profile.xp} XP · Nivel {profile.level}</p>
                                    <div className="mt-3">
                                        <XpBar profile={profile} />
                                    </div>
                                </div>
                            </section>

                            <div role="tablist" aria-label="Secciones del panel" className="flex gap-2 rounded-full bg-white p-2 shadow-[0_6px_24px_rgb(7,48,54,0.25)]">
                                {TABS.map(({ id, label }) => {
                                    const selected = tab === id;
                                    return (
                                        <button
                                            key={id}
                                            id={`tab-${id}`}
                                            type="button"
                                            role="tab"
                                            aria-selected={selected}
                                            aria-controls={`panel-${id}`}
                                            onClick={() => setTab(id)}
                                            className={`flex-1 rounded-full px-2 py-2 text-sm transition-colors sm:px-4 ${selected ? 'bg-blue-600 font-bold text-white' : 'font-medium text-gray-500 hover:bg-blue-50'}`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Los paneles quedan montados (solo ocultos) para no repetir peticiones al cambiar de pestaña. */}
                            <div id="panel-misiones" role="tabpanel" aria-labelledby="tab-misiones" hidden={tab !== 'misiones'} className="animate-fade-in space-y-6">
                                <SectionHeader title="Mis misiones" subtitle="Continúa tu aventura" />
                                {hasClassLevel ? (
                                    <>
                                        <DailyChallengeCard onUnauthorized={toLogin} onCompleted={handleChallengeCompleted} />
                                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                            {MODULES.map((module) => (
                                                <ModuleCard key={module.slug} {...module} onUnauthorized={toLogin} />
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <section className={CARD}>
                                        <p className="text-sm text-gray-600">Cuando tu docente elija el nivel de la clase verás aquí tus actividades y el reto del día.</p>
                                    </section>
                                )}
                            </div>

                            <div id="panel-ranking" role="tabpanel" aria-labelledby="tab-ranking" hidden={tab !== 'ranking'} className="animate-fade-in space-y-6">
                                <SectionHeader title="Mejores de tu clase" subtitle="Compite con tus compañeros" />
                                <section className={CARD}>
                                    <Title>🏆 Clasificación</Title>
                                    {rankingState.loading && !ranking && <p className="mt-4 text-sm text-gray-500">Cargando...</p>}
                                    {rankingState.error && <div className={`${ERROR_BOX} mt-4`} role="alert">{rankingState.error.message}</div>}
                                    {ranking && ranking.length === 0 && (
                                        <p className="mt-4 text-sm text-gray-500">Aún no hay compañeros en el ranking.</p>
                                    )}
                                    {ranking && ranking.length > 0 && (
                                        <ul className="mt-5 divide-y divide-blue-50 overflow-hidden rounded-2xl border-2 border-blue-100 bg-white">
                                            {ranking.map((student, index) => {
                                                const isMe = student.alias === profile.alias;
                                                return (
                                                    <li
                                                        key={student.alias}
                                                        aria-current={isMe ? 'true' : undefined}
                                                        className={`flex items-center justify-between gap-3 p-3 sm:p-4 ${isMe ? 'border-l-4 border-l-blue-600 bg-blue-50' : ''}`}
                                                    >
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${rankBadge(index)}`}>
                                                                {student.position}
                                                            </span>
                                                            <span className="text-2xl" aria-hidden="true">{emojiFor(student.avatar)}</span>
                                                            <div className="min-w-0">
                                                                <p className={`break-words text-base font-bold ${isMe ? 'text-blue-700' : 'text-brand-600'}`}>
                                                                    {student.alias}
                                                                    {isMe && <span className="ml-2 rounded-full bg-blue-200 px-2 py-0.5 text-xs text-blue-800">Tú</span>}
                                                                </p>
                                                                <p className="text-xs font-semibold text-gray-400">Nivel {student.level}</p>
                                                            </div>
                                                        </div>
                                                        <p className="shrink-0 text-lg font-black text-amber-500">{student.xp} XP</p>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </section>
                            </div>

                            <div id="panel-perfil" role="tabpanel" aria-labelledby="tab-perfil" hidden={tab !== 'perfil'} className="animate-fade-in space-y-6">
                                <SectionHeader title="Mi perfil" subtitle="Personaliza tu avatar" />
                                <section className={`${CARD} max-w-2xl space-y-6`}>
                                    <Title>Tus datos</Title>
                                    <div className="flex flex-col items-center gap-6 sm:flex-row">
                                        <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-blue-100 bg-brand-600 text-6xl shadow-md">
                                            <span aria-hidden="true">{emojiFor(profile.avatar)}</span>
                                        </div>
                                        <div className="min-w-0 space-y-3 text-center sm:text-left">
                                            <div>
                                                <p className={LABEL}>Usuario</p>
                                                <p className="break-words text-2xl font-bold text-brand-600">{profile.alias}</p>
                                                <p className="text-xs text-gray-500">Es el usuario con el que inicias sesión y no se puede cambiar.</p>
                                            </div>
                                            <div className="flex justify-center gap-6 sm:justify-start">
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
                                    <AvatarPicker profile={profile} onSaved={handleAvatarSaved} onUnauthorized={toLogin} />
                                </section>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
