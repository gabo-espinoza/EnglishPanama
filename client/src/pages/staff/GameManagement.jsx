import { useEffect, useMemo, useRef, useState } from 'react';
import { useStaff } from '../../components/StaffRoute';
import {
    addDailyChallenge,
    getGameRules,
    listDailyChallenges,
    listGameAliases,
    listGameQuestions,
    removeDailyChallenge,
    setAliasHidden,
    updateGameRules
} from '../../api/staff';
import {
    BTN_PRIMARY,
    BTN_SECONDARY,
    CARD,
    ConfirmPanel,
    EmptyState,
    ErrorBanner,
    FIELD,
    Field,
    LABEL,
    LoadingRows,
    Notice,
    PageHeader,
    StatusBadge,
    errorMessage,
    useAsync,
    useMounted
} from './ui';

// Mismos límites y valores por defecto que server/src/services/game.service.js.
const RULE_FIELDS = [
    { key: 'xpPerCorrect', label: 'XP por respuesta correcta', min: 1, max: 50, fallback: 5 },
    { key: 'xpPerLevel', label: 'XP necesarios por nivel', min: 10, max: 1000, fallback: 100 },
    { key: 'dailyChallengeXp', label: 'XP del reto diario', min: 1, max: 100, fallback: 10 }
];

const ALIAS_PAGE = 100;

const MODULE_LABELS = { vocabulary: 'Vocabulario', grammar: 'Gramática', reading: 'Lectura' };
const GAME_TYPE_LABELS = {
    memory: 'Memoria',
    multiple_choice: 'Opción múltiple',
    sentence_order: 'Ordenar oraciones',
    fill_blank: 'Completar espacios'
};
const LEVELS = ['A1.1', 'A1.2', 'A1.3'];
const ACTIVITY_STATUS = {
    published: { label: 'Publicada', tone: 'green' },
    draft: { label: 'Borrador', tone: 'amber' },
    in_review: { label: 'En revisión', tone: 'amber' },
    archived: { label: 'Archivada', tone: 'gray' }
};
const VISIBILITY = {
    hidden: { label: 'Oculto', tone: 'amber' },
    visible: { label: 'Visible', tone: 'blue' }
};

const SEARCH_MAX = 100;
const RESULTS_LIMIT = 50;

const ADD_ERRORS_BY_STATUS = {
    404: 'La pregunta ya no existe. Se actualizó la búsqueda.'
};
const ADD_ERRORS_BY_CODE = {
    QUESTION_NOT_PUBLISHED: 'Solo se pueden agregar preguntas de actividades publicadas.',
    QUESTION_ALREADY_IN_POOL: 'Esa pregunta ya está en la lista de retos diarios.',
    QUESTION_TYPE_NOT_SUPPORTED: 'Las preguntas de ordenar oraciones no sirven como reto diario: el estudiante responde eligiendo una sola opción.'
};
const REMOVE_ERRORS_BY_CODE = {
    CHALLENGE_COMPLETED_TODAY:
        'No se puede quitar: el reto de hoy ya tiene estudiantes que lo completaron. Podrás quitarlo mañana (el día cambia a medianoche, hora de Panamá).'
};

function ruleError(value, field) {
    const text = String(value).trim();
    if (!/^\d+$/.test(text) || Number(text) < field.min || Number(text) > field.max) {
        return `Escribe un número entero entre ${field.min} y ${field.max}.`;
    }
    return '';
}

function rulesToForm(rules) {
    return {
        xpPerCorrect: String(rules.xpPerCorrect),
        xpPerLevel: String(rules.xpPerLevel),
        dailyChallengeXp: String(rules.dailyChallengeXp)
    };
}

// Al abrir una confirmación lleva el foco a "Cancelar" (la opción segura) y, al cerrarse,
// devuelve el foco al botón que la abrió si sigue en pantalla.
function ConfirmFocus({ children }) {
    const ref = useRef(null);
    useEffect(() => {
        const opener = document.activeElement;
        const buttons = ref.current ? ref.current.querySelectorAll('button') : [];
        if (buttons.length > 0) buttons[buttons.length - 1].focus();
        return () => {
            if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
        };
    }, []);
    return <div ref={ref}>{children}</div>;
}

function SectionTitle({ id, title, children }) {
    return (
        <div>
            <h2 id={id} className="text-xl font-display text-brand-600">{title}</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">{children}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 1. Reglas de XP
// ---------------------------------------------------------------------------
function RulesSection({ token, handleAuthError }) {
    const mounted = useMounted();
    const rules = useAsync(() => getGameRules(token), [token]);
    const [form, setForm] = useState({ xpPerCorrect: '', xpPerLevel: '', dailyChallengeXp: '' });
    const [submitted, setSubmitted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    // Reglas devueltas por el último guardado: si la recarga posterior falla se siguen mostrando.
    const [savedRules, setSavedRules] = useState(null);

    useEffect(() => {
        if (rules.data) {
            setSavedRules(null);
            setForm(rulesToForm(rules.data));
        }
    }, [rules.data]);

    const stored = savedRules || rules.data;
    const errors = {};
    RULE_FIELDS.forEach((f) => {
        errors[f.key] = ruleError(form[f.key], f);
    });
    const dirty = Boolean(stored) && RULE_FIELDS.some((f) => String(form[f.key]).trim() !== String(stored[f.key]));

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (busy) return;
        setNotice(null);
        setSubmitted(true);
        const firstInvalid = RULE_FIELDS.find((f) => errors[f.key]);
        if (firstInvalid) {
            const el = document.getElementById(`rule-${firstInvalid.key}`);
            if (el) el.focus();
            return;
        }
        setBusy(true);
        setNotice(null);
        try {
            // El servidor acepta cuerpos parciales, pero se envían siempre las tres reglas.
            const saved = await updateGameRules(token, {
                xpPerCorrect: Number(form.xpPerCorrect),
                xpPerLevel: Number(form.xpPerLevel),
                dailyChallengeXp: Number(form.dailyChallengeXp)
            });
            if (!mounted.current) return;
            setSavedRules(saved);
            setForm(rulesToForm(saved));
            setSubmitted(false);
            setNotice({ type: 'ok', text: 'Guardado. Las reglas nuevas ya están en vigor.' });
            rules.reload();
        } catch (err) {
            if (handleAuthError(err)) return;
            if (mounted.current) setNotice({ type: 'error', text: errorMessage(err) });
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    return (
        <section aria-labelledby="game-rules-title" className={`${CARD} space-y-4`}>
            <SectionTitle id="game-rules-title" title="Reglas de XP">
                Define cuántos puntos de experiencia (XP) se ganan y cada cuántos se sube de nivel.
            </SectionTitle>

            {rules.status === 'loading' && !rules.data && <LoadingRows label="Cargando reglas..." />}
            {rules.status === 'error' && <ErrorBanner message={rules.error} onRetry={rules.reload} />}

            {stored && (
                <>
                    <p className="text-sm text-gray-500">
                        Valores guardados:{' '}
                        <strong>{stored.xpPerCorrect}</strong> XP por respuesta correcta,{' '}
                        <strong>{stored.xpPerLevel}</strong> XP por nivel y{' '}
                        <strong>{stored.dailyChallengeXp}</strong> XP por el reto diario.
                    </p>
                    <form onSubmit={handleSubmit} noValidate className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            {RULE_FIELDS.map((f) => {
                                const id = `rule-${f.key}`;
                                const showError = submitted && errors[f.key];
                                return (
                                    <div key={f.key}>
                                        <Field id={id} label={f.label} hint={`Entre ${f.min} y ${f.max}. Valor inicial: ${f.fallback}.`}>
                                            <input
                                                id={id}
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                className={FIELD}
                                                value={form[f.key]}
                                                onChange={(e) => {
                                                    setNotice(null);
                                                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }));
                                                }}
                                                disabled={busy}
                                                aria-invalid={showError ? 'true' : 'false'}
                                                aria-describedby={showError ? `${id}-help ${id}-error` : `${id}-help`}
                                            />
                                        </Field>
                                        {showError && (
                                            <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-bold text-red-600">{errors[f.key]}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="submit" disabled={busy || !dirty} className={BTN_PRIMARY}>
                                {busy ? 'Guardando...' : 'Guardar reglas'}
                            </button>
                            {dirty && !busy && (
                                <button
                                    type="button"
                                    className={BTN_SECONDARY}
                                    onClick={() => {
                                        setNotice(null);
                                        setForm(rulesToForm(stored));
                                        setSubmitted(false);
                                    }}
                                >
                                    Descartar cambios
                                </button>
                            )}
                        </div>
                    </form>
                </>
            )}
            <Notice notice={notice} onClose={() => setNotice(null)} />
        </section>
    );
}

// ---------------------------------------------------------------------------
// 2. Alias de estudiantes
// ---------------------------------------------------------------------------
function AliasesSection({ token, handleAuthError }) {
    const mounted = useMounted();
    const aliases = useAsync(() => listGameAliases(token), [token]);
    const [filter, setFilter] = useState('');
    const [pending, setPending] = useState(null); // { studentId, alias }
    const [busyId, setBusyId] = useState(null);
    const [notice, setNotice] = useState(null);

    const rows = useMemo(() => (Array.isArray(aliases.data) ? aliases.data : []), [aliases.data]);
    const filtered = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        return needle ? rows.filter((r) => r.alias.toLowerCase().includes(needle)) : rows;
    }, [rows, filter]);
    const shown = filtered.slice(0, ALIAS_PAGE);

    const change = async (row, hidden) => {
        if (busyId !== null) return;
        setBusyId(row.studentId);
        setNotice(null);
        try {
            const result = await setAliasHidden(token, row.studentId, hidden);
            if (!mounted.current) return;
            setPending(null);
            setNotice({
                type: 'ok',
                text: result.aliasHidden
                    ? `El alias "${row.alias}" ahora aparece como "Jugador oculto" en el ranking.`
                    : `El alias "${row.alias}" vuelve a mostrarse en el ranking.`
            });
            aliases.reload();
        } catch (err) {
            if (handleAuthError(err)) return;
            if (!mounted.current) return;
            setPending(null);
            setNotice({ type: 'error', text: errorMessage(err, { 404: 'El estudiante ya no existe. Se actualizó la lista.' }) });
            if (err && err.status === 404) aliases.reload();
        } finally {
            if (mounted.current) setBusyId(null);
        }
    };

    return (
        <section aria-labelledby="game-aliases-title" className={`${CARD} space-y-4`}>
            <SectionTitle id="game-aliases-title" title="Alias de estudiantes">
                Si un alias es inapropiado, ocúltalo: en el ranking se mostrará como "Jugador oculto" y conservará su posición.
                Aquí solo se ve el alias y su XP, nunca el nombre real.
            </SectionTitle>

            <Notice notice={notice} onClose={() => setNotice(null)} />
            {pending && (
                <ConfirmFocus>
                    <ConfirmPanel
                        label="Confirmar ocultar alias"
                        confirmText="Sí, ocultar alias"
                        danger
                        busy={busyId === pending.studentId}
                        onConfirm={() => change(pending, true)}
                        onCancel={() => setPending(null)}
                    >
                        ¿Ocultar el alias "{pending.alias}"? En el ranking aparecerá como "Jugador oculto" hasta que lo vuelvas a mostrar.
                    </ConfirmPanel>
                </ConfirmFocus>
            )}

            {aliases.status === 'loading' && !aliases.data && <LoadingRows label="Cargando alias..." />}
            {aliases.status === 'error' && <ErrorBanner message={aliases.error} onRetry={aliases.reload} />}
            {aliases.status === 'ok' && rows.length === 0 && <EmptyState text="Todavía no hay estudiantes registrados." />}

            {rows.length > 0 && (
                <>
                    <div className="max-w-sm">
                        <Field id="alias-filter" label="Buscar alias" hint="Filtra la lista cargada por parte del alias.">
                            <input
                                id="alias-filter"
                                type="search"
                                className={FIELD}
                                value={filter}
                                maxLength={50}
                                autoComplete="off"
                                onChange={(e) => setFilter(e.target.value)}
                                aria-describedby="alias-filter-help"
                            />
                        </Field>
                    </div>
                    <p role="status" className="text-xs text-gray-400">
                        {filtered.length === 0
                            ? 'Ningún alias coincide con la búsqueda.'
                            : `Mostrando ${shown.length} de ${filtered.length} alias, de mayor a menor XP.${filtered.length > shown.length ? ' Usa la búsqueda para encontrar otros.' : ''}`}
                    </p>
                    {shown.length > 0 && (
                        <div className="relative overflow-x-auto">
                            <table className="w-full min-w-[30rem] text-left text-sm">
                                <caption className="sr-only">Alias de estudiantes ordenados por XP</caption>
                                <thead>
                                    <tr className="border-b-2 border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                                        <th scope="col" className="py-2 pr-3">Alias</th>
                                        <th scope="col" className="py-2 pr-3">XP</th>
                                        <th scope="col" className="py-2 pr-3">En el ranking</th>
                                        <th scope="col" className="py-2"><span className="sr-only">Acción</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.map((row) => (
                                        <tr key={row.studentId} className="border-b border-gray-100">
                                            <td className="max-w-[12rem] break-words py-2 pr-3 font-bold text-gray-700">{row.alias}</td>
                                            <td className="py-2 pr-3 text-gray-600">{row.xp}</td>
                                            <td className="py-2 pr-3">
                                                <StatusBadge value={row.aliasHidden ? 'hidden' : 'visible'} map={VISIBILITY} />
                                            </td>
                                            <td className="py-2 text-right">
                                                {row.aliasHidden ? (
                                                    <button
                                                        type="button"
                                                        className={BTN_SECONDARY}
                                                        disabled={busyId !== null}
                                                        aria-label={`Mostrar el alias ${row.alias}`}
                                                        onClick={() => change(row, false)}
                                                    >
                                                        {busyId === row.studentId ? 'Mostrando...' : 'Mostrar'}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className={BTN_SECONDARY}
                                                        disabled={busyId !== null}
                                                        aria-label={`Ocultar el alias ${row.alias}`}
                                                        onClick={() => { setNotice(null); setPending({ studentId: row.studentId, alias: row.alias }); }}
                                                    >
                                                        Ocultar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// 3. Retos diarios
// ---------------------------------------------------------------------------
function ChallengesSection({ token, handleAuthError }) {
    const mounted = useMounted();
    const pool = useAsync(() => listDailyChallenges(token), [token]);
    const [draft, setDraft] = useState({ module: '', level: '', q: '' });
    const [applied, setApplied] = useState({ module: '', level: '', q: '' });
    const questions = useAsync(() => listGameQuestions(token, {
        module: applied.module || undefined,
        level: applied.level || undefined,
        q: applied.q || undefined,
        limit: RESULTS_LIMIT
    }), [token, applied]);
    const [pending, setPending] = useState(null); // { id, prompt } del reto a quitar
    const [busyKey, setBusyKey] = useState(null);
    const [notice, setNotice] = useState(null);

    const poolRows = useMemo(() => (Array.isArray(pool.data) ? pool.data : []), [pool.data]);
    const inPool = useMemo(() => new Set(poolRows.map((c) => c.questionId)), [poolRows]);
    const results = Array.isArray(questions.data) ? questions.data : [];

    const runSearch = (event) => {
        event.preventDefault();
        setNotice(null);
        setApplied({ module: draft.module, level: draft.level, q: draft.q.trim() });
    };

    const add = async (question) => {
        if (busyKey !== null) return;
        setBusyKey(`add-${question.id}`);
        setNotice(null);
        try {
            await addDailyChallenge(token, question.id);
            if (!mounted.current) return;
            setNotice({ type: 'ok', text: `Pregunta n.º ${question.id} agregada a la lista de retos diarios.` });
            pool.reload();
        } catch (err) {
            if (handleAuthError(err)) return;
            if (!mounted.current) return;
            setNotice({ type: 'error', text: errorMessage(err, ADD_ERRORS_BY_STATUS, ADD_ERRORS_BY_CODE) });
            if (err && (err.status === 404 || err.status === 409)) {
                pool.reload();
                questions.reload();
            }
        } finally {
            if (mounted.current) setBusyKey(null);
        }
    };

    const remove = async (challenge) => {
        if (busyKey !== null) return;
        setBusyKey(`remove-${challenge.id}`);
        setNotice(null);
        try {
            await removeDailyChallenge(token, challenge.id);
            if (!mounted.current) return;
            setPending(null);
            setNotice({ type: 'ok', text: `Reto n.º ${challenge.id} quitado de la lista de retos.` });
            pool.reload();
        } catch (err) {
            if (handleAuthError(err)) return;
            if (!mounted.current) return;
            setPending(null);
            setNotice({
                type: 'error',
                text: errorMessage(err, { 404: 'El reto ya no existe. Se actualizó la lista de retos.' }, REMOVE_ERRORS_BY_CODE)
            });
            if (err && err.status === 404) pool.reload();
        } finally {
            if (mounted.current) setBusyKey(null);
        }
    };

    return (
        <section aria-labelledby="game-challenges-title" className={`${CARD} space-y-6`}>
            <SectionTitle id="game-challenges-title" title="Retos diarios">
                Cada día los estudiantes reciben una pregunta de esta lista según el nivel de su clase. Solo llegan a los estudiantes
                las preguntas de actividades publicadas. Sirven las preguntas de Memoria, Opción múltiple y Completar espacios
                (el estudiante responde eligiendo una opción); las de Ordenar oraciones no se pueden usar.
            </SectionTitle>

            <Notice notice={notice} onClose={() => setNotice(null)} />
            {pending && (
                <ConfirmFocus>
                    <ConfirmPanel
                        label="Confirmar quitar reto"
                        confirmText="Sí, quitar de la lista"
                        danger
                        busy={busyKey === `remove-${pending.id}`}
                        onConfirm={() => remove(pending)}
                        onCancel={() => setPending(null)}
                    >
                        ¿Quitar de la lista de retos el reto n.º {pending.id} ("{pending.prompt}")? Si hoy ya lo completó algún estudiante,
                        el servidor no lo permitirá hasta mañana.
                    </ConfirmPanel>
                </ConfirmFocus>
            )}

            <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Retos actuales</h3>
                {pool.status === 'loading' && !pool.data && <LoadingRows label="Cargando la lista de retos..." />}
                {pool.status === 'error' && <ErrorBanner message={pool.error} onRetry={pool.reload} />}
                {pool.status === 'ok' && poolRows.length === 0 && (
                    <EmptyState text="La lista de retos está vacía. Agrega preguntas con el buscador de abajo." />
                )}
                {poolRows.length > 0 && (
                    <div className="relative overflow-x-auto">
                        <table className="w-full min-w-[34rem] text-left text-sm">
                            <caption className="sr-only">Preguntas de la lista de retos diarios</caption>
                            <thead>
                                <tr className="border-b-2 border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                                    <th scope="col" className="py-2 pr-3">Pos.</th>
                                    <th scope="col" className="py-2 pr-3">Pregunta</th>
                                    <th scope="col" className="py-2 pr-3">Actividad</th>
                                    <th scope="col" className="py-2 pr-3">Estado</th>
                                    <th scope="col" className="py-2"><span className="sr-only">Acción</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {poolRows.map((c) => (
                                    <tr key={c.id} className="border-b border-gray-100 align-top">
                                        <td className="py-2 pr-3 text-gray-600">{c.position}</td>
                                        <td className="max-w-[18rem] break-words py-2 pr-3 text-gray-700">
                                            {c.prompt}
                                            <span className="block text-xs text-gray-400">Pregunta n.º {c.questionId}</span>
                                        </td>
                                        <td className="max-w-[12rem] break-words py-2 pr-3 text-gray-600">{c.activityTitle}</td>
                                        <td className="py-2 pr-3"><StatusBadge value={c.activityStatus} map={ACTIVITY_STATUS} /></td>
                                        <td className="py-2 text-right">
                                            <button
                                                type="button"
                                                className={BTN_SECONDARY}
                                                disabled={busyKey !== null}
                                                aria-label={`Quitar de la lista el reto n.º ${c.id}`}
                                                onClick={() => { setNotice(null); setPending({ id: c.id, prompt: c.prompt }); }}
                                            >
                                                Quitar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {poolRows.some((c) => c.activityStatus !== 'published') && (
                    <p className="mt-2 text-xs font-medium text-amber-800">
                        Los retos cuya actividad no está publicada no llegan a los estudiantes.
                    </p>
                )}
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">Agregar una pregunta</h3>
                <form onSubmit={runSearch} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div>
                        <label htmlFor="q-module" className={LABEL}>Módulo</label>
                        <select id="q-module" className={FIELD} value={draft.module} onChange={(e) => setDraft((p) => ({ ...p, module: e.target.value }))}>
                            <option value="">Todos</option>
                            {Object.entries(MODULE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="q-level" className={LABEL}>Nivel</label>
                        <select id="q-level" className={FIELD} value={draft.level} onChange={(e) => setDraft((p) => ({ ...p, level: e.target.value }))}>
                            <option value="">Todos</option>
                            {LEVELS.map((level) => (
                                <option key={level} value={level}>{level}</option>
                            ))}
                        </select>
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="q-text" className={LABEL}>Texto de la pregunta</label>
                        <input
                            id="q-text"
                            type="search"
                            className={FIELD}
                            value={draft.q}
                            maxLength={SEARCH_MAX}
                            autoComplete="off"
                            onChange={(e) => setDraft((p) => ({ ...p, q: e.target.value }))}
                        />
                    </div>
                    <div className="sm:col-span-4">
                        <button type="submit" className={BTN_PRIMARY} disabled={questions.status === 'loading'}>
                            {questions.status === 'loading' ? 'Buscando...' : 'Buscar preguntas'}
                        </button>
                    </div>
                </form>

                {questions.status === 'loading' && !questions.data && <LoadingRows label="Buscando preguntas..." />}
                {questions.status === 'error' && <ErrorBanner message={questions.error} onRetry={questions.reload} />}
                {questions.status === 'ok' && results.length === 0 && (
                    <EmptyState text="No hay preguntas publicadas y compatibles que coincidan con la búsqueda." />
                )}
                {results.length > 0 && (
                    <>
                        <p role="status" className="text-xs text-gray-400">
                            {results.length >= RESULTS_LIMIT
                                ? `Mostrando las primeras ${RESULTS_LIMIT} preguntas publicadas. Afina la búsqueda para ver otras.`
                                : `${results.length} ${results.length === 1 ? 'pregunta publicada' : 'preguntas publicadas'}.`}
                        </p>
                        <ul className="space-y-2">
                            {results.map((question) => {
                                const already = inPool.has(question.id);
                                return (
                                    <li key={question.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border-2 border-gray-100 p-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-bold text-gray-700">{question.text}</p>
                                            <p className="mt-1 break-words text-xs text-gray-400">
                                                Pregunta n.º {question.id} · {question.activityTitle} · {MODULE_LABELS[question.module] || question.module} ·{' '}
                                                {question.level} · {GAME_TYPE_LABELS[question.gameType] || question.gameType}
                                            </p>
                                        </div>
                                        {already ? (
                                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">Ya está en la lista</span>
                                        ) : (
                                            <button
                                                type="button"
                                                className={BTN_PRIMARY}
                                                disabled={busyKey !== null}
                                                aria-label={`Agregar a la lista de retos la pregunta n.º ${question.id}`}
                                                onClick={() => add(question)}
                                            >
                                                {busyKey === `add-${question.id}` ? 'Agregando...' : 'Agregar'}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>
        </section>
    );
}

export default function GameManagement() {
    const { token, handleAuthError } = useStaff();
    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader title="Gestión del juego" subtitle="Reglas de XP, alias del ranking y reto diario." />
            <RulesSection token={token} handleAuthError={handleAuthError} />
            <AliasesSection token={token} handleAuthError={handleAuthError} />
            <ChallengesSection token={token} handleAuthError={handleAuthError} />
        </div>
    );
}
