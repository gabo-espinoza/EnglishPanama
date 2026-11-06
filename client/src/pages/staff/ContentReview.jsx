import { useEffect, useMemo, useRef, useState } from 'react';
import { useStaff } from '../../components/StaffRoute';
import {
    approveContentActivity,
    getContentActivity,
    listContentActivities,
    rejectContentActivity
} from '../../api/staff';
import {
    BTN_DANGER,
    BTN_PRIMARY,
    BTN_SECONDARY,
    CARD,
    ConfirmPanel,
    EmptyState,
    ErrorBanner,
    FIELD,
    Field,
    LoadingRows,
    Notice,
    PageHeader,
    StatusBadge,
    errorMessage,
    formatDateTime,
    useAsync,
    useMounted
} from './ui';
import { authorLabel, normalizeText } from './content/constants';

const MODULE_LABELS = { vocabulary: 'Vocabulario', grammar: 'Gramática', reading: 'Lectura' };
const GAME_LABELS = {
    memory: 'Memoria',
    multiple_choice: 'Opción múltiple',
    sentence_order: 'Ordenar oraciones',
    fill_blank: 'Completar espacios'
};
const LEVELS = ['A1.1', 'A1.2', 'A1.3'];
const STATUS_MAP = {
    draft: { label: 'Borrador', tone: 'gray' },
    in_review: { label: 'En revisión', tone: 'amber' },
    published: { label: 'Publicada', tone: 'green' },
    archived: { label: 'Archivada', tone: 'gray' }
};

const MAX_NOTE = 500;
// Mismo criterio que el servidor: sin caracteres de control (incluye saltos de línea), "<" ni ">".
// eslint-disable-next-line no-control-regex
const NOTE_INVALID = /[\x00-\x1f\x7f<>]/;

const STALE_MESSAGE = 'La actividad ya no está en revisión (otra persona la atendió o su autor la retiró). Se actualizó la cola.';
const MISSING_MESSAGE = 'La actividad ya no existe. Se actualizó la cola.';

function label(map, key) {
    return map[key] || key;
}

// ---------------------------------------------------------------------------
// Vista de solo lectura del contenido completo
// ---------------------------------------------------------------------------

function Question({ question, index, gameType }) {
    const options = Array.isArray(question.options) ? question.options : [];
    const ordered = gameType === 'sentence_order' && Array.isArray(question.correctAnswer);
    // Mismo criterio que el servidor al calificar (normalizeAnswer): sin tildes NO se igualan.
    const correctKey = ordered ? null : normalizeText(question.correctAnswer);
    const correctText = ordered
        ? question.correctAnswer.join(' ')
        : String(question.correctAnswer ?? '');

    return (
        <li className="rounded-2xl border-2 border-gray-100 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                Pregunta {index + 1} · Tema: {question.topic}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words font-bold text-gray-800">{question.prompt}</p>

            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                {ordered ? 'Palabras o partes disponibles' : 'Opciones'}
            </p>
            <ul className="mt-1 space-y-1">
                {options.map((option, i) => {
                    const isCorrect = !ordered && normalizeText(option) === correctKey;
                    return (
                        <li
                            key={`${i}-${option}`}
                            className={`flex flex-wrap items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm break-words ${
                                isCorrect ? 'border-green-300 bg-green-50 font-bold text-green-800' : 'border-gray-100 text-gray-700'
                            }`}
                        >
                            <span className="min-w-0 break-words">{String(option)}</span>
                            {isCorrect && (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                    ✓ Respuesta correcta
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>

            {ordered && (
                <div className="mt-3 rounded-xl border-2 border-green-300 bg-green-50 p-3 text-sm text-green-800">
                    <p className="font-bold">✓ Orden correcto</p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                        {question.correctAnswer.map((part, i) => (
                            <li key={`${i}-${part}`} className="break-words">{String(part)}</li>
                        ))}
                    </ol>
                </div>
            )}
            {!ordered && correctText && (
                <p className="mt-2 text-sm text-gray-600">
                    Respuesta correcta guardada: <span className="font-bold break-words">{correctText}</span>
                </p>
            )}
        </li>
    );
}

function ActivityContent({ activity }) {
    const questions = Array.isArray(activity.questions) ? activity.questions : [];
    return (
        <div className="space-y-4">
            {activity.passageText ? (
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Texto de lectura</p>
                    <p className="mt-1 whitespace-pre-wrap break-words rounded-2xl border-2 border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
                        {activity.passageText}
                    </p>
                </div>
            ) : (
                <p className="text-sm text-gray-400">Esta actividad no tiene texto de lectura.</p>
            )}
            <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Preguntas ({questions.length})
                </p>
                {questions.length === 0 ? (
                    <p className="mt-1 text-sm font-bold text-red-600">Esta actividad no tiene preguntas.</p>
                ) : (
                    <ol className="mt-2 space-y-3">
                        {questions.map((q, i) => (
                            <Question key={q.id} question={q} index={i} gameType={activity.gameType} />
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
}

function Meta({ term, children }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">{term}</dt>
            <dd className="break-words text-sm font-bold text-gray-700">{children}</dd>
        </div>
    );
}

// Resumen de la actividad que esta revisión reemplaza (si el servidor deja leerla).
function ReplacesSummary({ replacesId, token }) {
    const original = useAsync(() => getContentActivity(token, replacesId), [token, replacesId]);
    const [open, setOpen] = useState(false);
    const data = original.data;

    return (
        <section aria-label="Actividad que reemplaza" className="rounded-2xl border-2 border-blue-100 bg-blue-100/40 p-4">
            <p className="text-sm font-bold text-brand-600">
                Esta es una revisión de la actividad n.º {replacesId}. Si la apruebas, la original quedará archivada.
            </p>
            {original.status === 'loading' && !data && <LoadingRows label="Cargando la actividad original..." />}
            {original.status === 'error' && (
                <p className="mt-1 text-sm text-gray-600">
                    No se pudo cargar la original para compararla ({original.error}).{' '}
                    <button type="button" onClick={original.reload} className="font-bold underline">Reintentar</button>
                </p>
            )}
            {data && (
                <div className="mt-2 space-y-2">
                    <p className="text-sm text-gray-700">
                        Original: <span className="font-bold break-words">{data.title}</span> ·{' '}
                        <StatusBadge value={data.status} map={STATUS_MAP} /> · {Array.isArray(data.questions) ? data.questions.length : 0} preguntas
                    </p>
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        className={BTN_SECONDARY}
                    >
                        {open ? 'Ocultar contenido original' : 'Ver contenido original para comparar'}
                    </button>
                    {open && (
                        <div className="rounded-2xl bg-white p-3">
                            <ActivityContent activity={data} />
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Detalle con acciones de aprobar y rechazar
// ---------------------------------------------------------------------------

function ReviewDetail({ activityId, onBack, onDone }) {
    const { token, id: myId, handleAuthError } = useStaff();
    const mounted = useMounted();
    const detail = useAsync(() => getContentActivity(token, activityId), [token, activityId]);
    const activity = detail.data;

    const [mode, setMode] = useState(null); // null | 'approve' | 'reject'
    const [note, setNote] = useState('');
    const [noteError, setNoteError] = useState('');
    const [rejectReady, setRejectReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');

    const headingRef = useRef(null);
    const approveBtnRef = useRef(null);
    const rejectBtnRef = useRef(null);
    const noteRef = useRef(null);
    const askRejectRef = useRef(null);
    const approvePanelRef = useRef(null);
    const rejectPanelRef = useRef(null);

    // El foco va al título cuando el detalle ya se pintó (al montar todavía no hay actividad).
    const loadedId = activity ? activity.id : null;
    useEffect(() => {
        if (loadedId !== null && headingRef.current) headingRef.current.focus();
    }, [loadedId]);

    // Foco al abrir cada panel de acción.
    useEffect(() => {
        // Foco en "Cancelar" (último botón): un Enter accidental no confirma la acción.
        if (mode === 'approve' && approvePanelRef.current) {
            const buttons = approvePanelRef.current.querySelectorAll('button');
            if (buttons.length > 0) buttons[buttons.length - 1].focus();
        }
        if (mode === 'reject' && noteRef.current) noteRef.current.focus();
    }, [mode]);

    useEffect(() => {
        if (rejectReady && rejectPanelRef.current) {
            const buttons = rejectPanelRef.current.querySelectorAll('button');
            if (buttons.length > 0) buttons[buttons.length - 1].focus();
        }
    }, [rejectReady]);

    // Los botones que abren los paneles no se deshabilitan mientras el panel está abierto: así el
    // foco puede volver a ellos de inmediato al cancelar.
    function closePanels(returnTo) {
        setMode(null);
        setRejectReady(false);
        setNoteError('');
        setActionError('');
        if (returnTo && returnTo.current) returnTo.current.focus();
    }

    function cancelRejectConfirm() {
        setRejectReady(false);
        if (askRejectRef.current) askRejectRef.current.focus();
    }

    function openMode(next) {
        setActionError('');
        setNoteError('');
        setRejectReady(false);
        setMode(next);
    }

    function validateNote() {
        const clean = note.trim();
        if (!clean) return 'Escribe una nota con el motivo del rechazo: el gestor la verá para corregir la actividad.';
        if (clean.length > MAX_NOTE) return `La nota no puede superar ${MAX_NOTE} caracteres.`;
        if (NOTE_INVALID.test(clean)) return 'La nota no puede tener saltos de línea, los signos "<" o ">" ni caracteres de control.';
        return '';
    }

    function askReject() {
        const problem = validateNote();
        setNoteError(problem);
        setRejectReady(!problem);
    }

    async function decide(kind) {
        if (busy) return;
        setBusy(true);
        setActionError('');
        try {
            if (kind === 'approve') await approveContentActivity(token, activityId);
            else await rejectContentActivity(token, activityId, note.trim());
            if (!mounted.current) return;
            onDone({
                type: 'ok',
                text: kind === 'approve'
                    ? `La actividad n.º ${activityId} fue aprobada y ya está publicada.`
                    : `La actividad n.º ${activityId} fue rechazada y volvió a borrador con tu nota.`
            });
        } catch (err) {
            if (!mounted.current) return;
            if (handleAuthError(err)) return;
            if (err.status === 409 || err.status === 404) {
                onDone({ type: 'error', text: err.status === 404 ? MISSING_MESSAGE : STALE_MESSAGE });
                return;
            }
            setActionError(
                errorMessage(
                    err,
                    {},
                    {
                        SAME_AUTHOR: 'No puedes aprobar contenido que tú mismo escribiste: debe aprobarlo otra cuenta de revisión.'
                    }
                )
            );
            setRejectReady(false);
        } finally {
            if (mounted.current) setBusy(false);
        }
    }

    const isInReview = activity && activity.status === 'in_review';
    const ownActivity = activity && activity.authorId !== null && activity.authorId !== undefined && Number(activity.authorId) === Number(myId);
    const hasQuestions = activity && Array.isArray(activity.questions) && activity.questions.length > 0;

    return (
        <section className={`${CARD} space-y-5`} aria-label="Detalle de la actividad en revisión">
            <button type="button" onClick={onBack} className={`${BTN_SECONDARY} lg:hidden`}>
                ← Volver a la cola
            </button>

            {detail.status === 'loading' && !activity && <LoadingRows label="Cargando la actividad..." />}
            {detail.status === 'error' && <ErrorBanner message={detail.error} onRetry={detail.reload} />}

            {activity && (
                <>
                    <div className="space-y-2">
                        <h2 ref={headingRef} tabIndex={-1} className="break-words text-xl font-display text-brand-600 outline-none">
                            {activity.title}
                        </h2>
                        <StatusBadge value={activity.status} map={STATUS_MAP} />
                    </div>

                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Meta term="N.º">{activity.id}</Meta>
                        <Meta term="Módulo">{label(MODULE_LABELS, activity.moduleSlug)}</Meta>
                        <Meta term="Tipo de juego">{label(GAME_LABELS, activity.gameType)}</Meta>
                        <Meta term="Nivel">{activity.level}</Meta>
                        <Meta term="Autor">
                            {authorLabel(activity.authorId, myId)}
                        </Meta>
                        <Meta term="Última actualización">{formatDateTime(activity.updatedAt)}</Meta>
                    </dl>

                    {activity.replacesId !== null && activity.replacesId !== undefined && (
                        <ReplacesSummary replacesId={activity.replacesId} token={token} />
                    )}

                    <ActivityContent activity={activity} />

                    <div className="space-y-3 border-t-2 border-gray-100 pt-4">
                        {!isInReview && (
                            <p role="status" className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                                Esta actividad está en estado «{label(STATUS_MAP, activity.status).label || activity.status}»: ya no se puede aprobar ni rechazar.
                            </p>
                        )}
                        {isInReview && ownActivity && (
                            <p className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                                Tú escribiste esta actividad, así que no puedes aprobarla: debe hacerlo otra cuenta de revisión.
                            </p>
                        )}
                        {isInReview && !hasQuestions && (
                            <p className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                                No tiene preguntas. Lo recomendable es rechazarla con una nota.
                            </p>
                        )}

                        {actionError && (
                            <div role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                                {actionError}
                            </div>
                        )}

                        {isInReview && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    ref={approveBtnRef}
                                    type="button"
                                    onClick={() => openMode('approve')}
                                    disabled={busy || ownActivity}
                                    className={BTN_PRIMARY}
                                >
                                    Aprobar y publicar
                                </button>
                                <button
                                    ref={rejectBtnRef}
                                    type="button"
                                    onClick={() => openMode('reject')}
                                    disabled={busy}
                                    className={BTN_DANGER}
                                >
                                    Rechazar con nota
                                </button>
                            </div>
                        )}

                        {isInReview && mode === 'approve' && (
                            <div ref={approvePanelRef}>
                                <ConfirmPanel
                                    label="Confirmar aprobación"
                                    confirmText="Sí, aprobar y publicar"
                                    busy={busy}
                                    onConfirm={() => decide('approve')}
                                    onCancel={() => closePanels(approveBtnRef)}
                                >
                                    ¿Aprobar la actividad n.º {activity.id} «{activity.title}»? Se publicará para los estudiantes
                                    {activity.replacesId ? ` y la actividad n.º ${activity.replacesId} quedará archivada` : ''}.
                                    Esta acción no se puede deshacer desde esta pantalla.
                                </ConfirmPanel>
                            </div>
                        )}

                        {isInReview && mode === 'reject' && (
                            <div className="space-y-3 rounded-2xl border-2 border-gray-100 p-4">
                                <Field
                                    id="review-note"
                                    label="Motivo del rechazo (obligatorio)"
                                    hint={`Hasta ${MAX_NOTE} caracteres, en una sola línea y sin los signos < ni >. El gestor verá esta nota.`}
                                >
                                    <textarea
                                        id="review-note"
                                        ref={noteRef}
                                        rows={3}
                                        value={note}
                                        disabled={busy}
                                        onChange={(e) => {
                                            setNote(e.target.value);
                                            setNoteError('');
                                            setRejectReady(false);
                                        }}
                                        aria-describedby="review-note-help review-note-count"
                                        aria-invalid={noteError ? 'true' : 'false'}
                                        className={FIELD}
                                    />
                                </Field>
                                <p
                                    id="review-note-count"
                                    className={`text-xs font-bold ${note.trim().length > MAX_NOTE ? 'text-red-600' : 'text-gray-500'}`}
                                >
                                    {note.trim().length} / {MAX_NOTE} caracteres
                                </p>
                                {noteError && <p role="alert" className="text-sm font-bold text-red-600">{noteError}</p>}
                                <div className="flex flex-wrap gap-2">
                                    <button ref={askRejectRef} type="button" onClick={askReject} disabled={busy} className={BTN_DANGER}>
                                        Rechazar actividad
                                    </button>
                                    <button type="button" onClick={() => closePanels(rejectBtnRef)} disabled={busy} className={BTN_SECONDARY}>
                                        Cancelar
                                    </button>
                                </div>
                                {rejectReady && (
                                    <div ref={rejectPanelRef}>
                                        <ConfirmPanel
                                            label="Confirmar rechazo"
                                            confirmText="Sí, rechazar"
                                            danger
                                            busy={busy}
                                            onConfirm={() => decide('reject')}
                                            onCancel={cancelRejectConfirm}
                                        >
                                            ¿Rechazar la actividad n.º {activity.id} «{activity.title}»? Volverá a borrador y el gestor verá
                                            tu nota: «{note.trim()}».
                                        </ConfirmPanel>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Cola de revisión
// ---------------------------------------------------------------------------

function QueueItem({ item, selected, onSelect, myId }) {
    return (
        <li>
            <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={selected ? 'true' : undefined}
                className={`w-full rounded-2xl border-2 p-4 text-left transition-colors ${
                    selected ? 'border-brand-500 bg-blue-100/40' : 'border-gray-100 bg-white hover:bg-gray-50'
                }`}
            >
                <span className="block break-words font-bold text-gray-800">{item.title}</span>
                <span className="mt-1 block text-xs text-gray-500">
                    N.º {item.id} · {label(MODULE_LABELS, item.moduleSlug)} · {label(GAME_LABELS, item.gameType)} · Nivel {item.level}
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                    Autor: {authorLabel(item.authorId, myId)} · Enviada: {formatDateTime(item.updatedAt)}
                </span>
                {item.replacesId !== null && item.replacesId !== undefined && (
                    <span className="mt-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-600">
                        Revisión de la actividad n.º {item.replacesId}
                    </span>
                )}
            </button>
        </li>
    );
}

export default function ContentReview() {
    const { token, id: myId } = useStaff();
    const [moduleFilter, setModuleFilter] = useState('');
    const [levelFilter, setLevelFilter] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [notice, setNotice] = useState(null);
    const noticeRef = useRef(null);

    // Tras una decisión el detalle se desmonta: el foco pasa al aviso con el resultado.
    useEffect(() => {
        if (notice && noticeRef.current) noticeRef.current.focus();
    }, [notice]);

    const queue = useAsync(
        () => listContentActivities(token, { status: 'in_review', module: moduleFilter, level: levelFilter }),
        [token, moduleFilter, levelFilter]
    );

    // Las más antiguas primero: es la que lleva más tiempo esperando.
    const items = useMemo(() => {
        const rows = Array.isArray(queue.data) ? queue.data : [];
        return [...rows].sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt) || a.id - b.id);
    }, [queue.data]);

    const filtered = moduleFilter !== '' || levelFilter !== '';

    function handleDone(result) {
        setNotice(result);
        setSelectedId(null);
        queue.reload();
    }

    function select(id) {
        setNotice(null);
        setSelectedId(id);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Revisión de contenido"
                subtitle="Actividades enviadas por el gestor de contenido. Revisa todo el contenido antes de decidir."
                actions={
                    <button type="button" onClick={queue.reload} disabled={queue.status === 'loading'} className={BTN_SECONDARY}>
                        Actualizar cola
                    </button>
                }
            />

            <div ref={noticeRef} tabIndex={-1} className="outline-none">
                <Notice notice={notice} onClose={() => setNotice(null)} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <section aria-label="Cola de revisión" className={`${CARD} space-y-4 ${selectedId !== null ? 'hidden lg:block' : ''}`}>
                    <div className="grid grid-cols-2 gap-3">
                        <Field id="review-module" label="Módulo">
                            <select
                                id="review-module"
                                className={FIELD}
                                value={moduleFilter}
                                onChange={(e) => setModuleFilter(e.target.value)}
                            >
                                <option value="">Todos</option>
                                {Object.entries(MODULE_LABELS).map(([value, text]) => (
                                    <option key={value} value={value}>{text}</option>
                                ))}
                            </select>
                        </Field>
                        <Field id="review-level" label="Nivel">
                            <select
                                id="review-level"
                                className={FIELD}
                                value={levelFilter}
                                onChange={(e) => setLevelFilter(e.target.value)}
                            >
                                <option value="">Todos</option>
                                {LEVELS.map((value) => (
                                    <option key={value} value={value}>{value}</option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    {queue.status === 'loading' && !queue.data && <LoadingRows label="Cargando la cola de revisión..." />}
                    {queue.status === 'error' && <ErrorBanner message={queue.error} onRetry={queue.reload} />}
                    {queue.status === 'ok' && items.length === 0 && (
                        <EmptyState
                            text={filtered ? 'No hay actividades pendientes con esos filtros.' : 'No hay actividades pendientes de revisión.'}
                        />
                    )}
                    {items.length > 0 && (
                        <>
                            <p className="text-xs font-bold text-gray-500" aria-live="polite">
                                {items.length} {items.length === 1 ? 'actividad pendiente' : 'actividades pendientes'}, las más antiguas primero.
                            </p>
                            <ul className="space-y-2">
                                {items.map((item) => (
                                    <QueueItem key={item.id} item={item} selected={item.id === selectedId} onSelect={select} myId={myId} />
                                ))}
                            </ul>
                        </>
                    )}
                </section>

                {selectedId !== null ? (
                    <ReviewDetail
                        key={selectedId}
                        activityId={selectedId}
                        onBack={() => setSelectedId(null)}
                        onDone={handleDone}
                    />
                ) : (
                    <div className="hidden lg:block">
                        <EmptyState text="Elige una actividad de la cola para ver su contenido completo." />
                    </div>
                )}
            </div>
        </div>
    );
}
