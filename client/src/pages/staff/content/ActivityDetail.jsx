import { useEffect, useRef, useState } from 'react';
import { useStaff } from '../../../components/StaffRoute';
import {
    addContentQuestion,
    archiveContentActivity,
    createContentRevision,
    deleteContentActivity,
    deleteContentQuestion,
    getContentActivity,
    submitContentActivity,
    updateContentActivity,
    updateContentQuestion,
    withdrawContentActivity
} from '../../../api/staff';
import {
    BTN_DANGER,
    BTN_PRIMARY,
    BTN_SECONDARY,
    CARD,
    ErrorBanner,
    LoadingRows,
    Notice,
    StatusBadge,
    errorMessage,
    formatDateTime,
    useAsync,
    useMounted
} from '../ui';
import ActivityFields from './ActivityFields';
import FocusedConfirm from './FocusedConfirm';
import QuestionForm from './QuestionForm';
import {
    GAME_LABELS,
    MODULE_LABELS,
    STATUS_MAP,
    activityFormErrors,
    answerParts,
    asArray,
    normalizeText
} from './constants';

const LIFECYCLE_ERRORS = [
    { 404: 'La actividad o la pregunta ya no existe. Vuelve a la lista para ver el estado actual.' },
    {
        INVALID_STATE: 'La actividad cambió de estado mientras la editabas. Ya cargamos los datos actuales; revisa y vuelve a intentarlo.',
        NO_QUESTIONS: 'Agrega al menos una pregunta antes de enviar la actividad a revisión.'
    }
];

const STATUS_EXPLANATION = {
    in_review: 'Está en revisión, así que no se puede editar. Si necesitas cambiarla, retírala de revisión: vuelve a ser borrador.',
    published: 'Está publicada y es de solo lectura. Para cambiarla crea una revisión (un borrador nuevo): la versión publicada sigue visible para los estudiantes hasta que se apruebe la nueva.',
    archived: 'Está archivada: es de solo lectura y no tiene acciones disponibles.'
};

function authorLabel(authorId, myId) {
    if (authorId === null || authorId === undefined) return 'Sin autor';
    return Number(authorId) === Number(myId) ? 'Tú' : `Cuenta de gestión n.º ${authorId}`;
}

function formFromActivity(activity) {
    return {
        title: activity.title || '',
        moduleSlug: activity.moduleSlug,
        gameType: activity.gameType,
        level: activity.level,
        passageText: activity.passageText || ''
    };
}

function sameFields(form, activity) {
    const saved = formFromActivity(activity);
    const current = { ...form, title: form.title.trim(), passageText: form.passageText.trim() };
    return Object.keys(saved).every((key) => saved[key] === current[key]);
}

function QuestionItem({ question, index, gameType, editable, busy, onEdit, onDelete }) {
    const options = asArray(question.options).map(String);
    const parts = answerParts(question.correctAnswer);
    const isOrder = gameType === 'sentence_order';
    // Mismo criterio que el servidor al calificar: sin tildes NO se igualan ("café" y "cafe" son distintas).
    const hasSingleAnswer = typeof question.correctAnswer === 'string' || typeof question.correctAnswer === 'number';
    const correctText = hasSingleAnswer ? normalizeText(question.correctAnswer) : null;
    return (
        <>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Pregunta {index + 1} · {question.topic}</p>
                    <p className="break-words font-bold text-gray-800">{question.prompt}</p>
                </div>
                {editable && (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={onEdit} aria-label={`Editar la pregunta ${index + 1}`}>Editar</button>
                        <button type="button" className={BTN_DANGER} disabled={busy} onClick={onDelete} aria-label={`Borrar la pregunta ${index + 1}`}>Borrar</button>
                    </div>
                )}
            </div>
            {isOrder ? (
                <p className="mt-2 break-words text-sm text-gray-600">
                    <span className="font-bold">Orden correcto:</span> {(parts.length ? parts : options).join(' → ')}
                </p>
            ) : (
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                    {options.map((option, i) => (
                        <li key={`${i}-${option}`} className="break-words">
                            {option}
                            {correctText !== null && normalizeText(option) === correctText && <span className="ml-2 font-bold text-green-700">(respuesta correcta)</span>}
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

// Detalle de una actividad: datos, preguntas y acciones del ciclo de vida. Solo los borradores se
// editan; en los demás estados se explica por qué y se ofrecen únicamente las acciones válidas.
export default function ActivityDetail({ id, initialNotice = null, onBack, onOpen }) {
    const { token, id: myId, handleAuthError } = useStaff();
    const mounted = useMounted();
    const detail = useAsync(() => getContentActivity(token, id), [token, id]);
    // Si la carga falla se muestra el error (no un detalle viejo sobre el que las acciones ya no valen).
    const activity = detail.status !== 'error' && detail.data && String(detail.data.id) === String(id) ? detail.data : null;

    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(initialNotice);
    const [pending, setPending] = useState(null); // 'submit' | 'withdraw' | 'revision' | 'archive' | 'delete' | 'saveDetails'
    const [editing, setEditing] = useState(null); // null | 'new' | id de pregunta
    const [deletingQuestion, setDeletingQuestion] = useState(null);
    const [form, setForm] = useState(null);
    const [formErrors, setFormErrors] = useState({});
    const headingRef = useRef(null);
    const questionsHeadingRef = useRef(null);
    const prevStatusRef = useRef(null);

    // Los datos del formulario se sincronizan cuando cambia la fila de la actividad (cargar, guardar),
    // no cuando solo se recargan las preguntas: así no se pierden cambios sin guardar.
    const syncKey = activity ? `${activity.id}|${activity.updatedAt}` : '';
    useEffect(() => {
        if (activity) setForm(formFromActivity(activity));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncKey]);

    const loadedId = activity ? activity.id : null;
    useEffect(() => {
        if (loadedId !== null && headingRef.current) headingRef.current.focus();
    }, [loadedId]);

    // Si la actividad deja de ser borrador (enviada, retirada, recargada con otro estado) se cierra la
    // edición de preguntas, y si el botón que se usó desapareció, el foco pasa al título.
    const currentStatus = activity ? activity.status : null;
    useEffect(() => {
        const previous = prevStatusRef.current;
        prevStatusRef.current = currentStatus;
        if (currentStatus === null || currentStatus === previous) return;
        if (currentStatus !== 'draft') {
            setEditing(null);
            setDeletingQuestion(null);
        }
        if (previous !== null && headingRef.current) headingRef.current.focus();
    }, [currentStatus]);

    function focusQuestions() {
        if (mounted.current && questionsHeadingRef.current) questionsHeadingRef.current.focus();
    }

    // Ejecuta una acción del servidor: un solo envío a la vez, aviso con el resultado real y
    // recarga de datos. Devuelve el mensaje de error ('' si salió bien o si venció la sesión).
    async function perform(fn, { okText, after } = {}) {
        setBusy(true);
        setNotice(null);
        try {
            const result = await fn();
            if (!mounted.current) return '';
            setPending(null);
            setDeletingQuestion(null);
            if (okText) setNotice({ type: 'ok', text: okText });
            if (after) after(result);
            else detail.reload();
            return '';
        } catch (err) {
            if (handleAuthError(err)) return '';
            if (!mounted.current) return '';
            const message = errorMessage(err, LIFECYCLE_ERRORS[0], LIFECYCLE_ERRORS[1]);
            setPending(null);
            setDeletingQuestion(null);
            setNotice({ type: 'error', text: message });
            if (err.status === 404 || err.code === 'INVALID_STATE') detail.reload();
            return message;
        } finally {
            if (mounted.current) setBusy(false);
        }
    }

    function saveDetails() {
        const errors = activityFormErrors(form);
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) {
            setPending(null);
            return;
        }
        perform(
            () => updateContentActivity(token, id, {
                title: form.title.trim(),
                moduleSlug: form.moduleSlug,
                gameType: form.gameType,
                level: form.level,
                passageText: form.passageText.trim()
            }),
            { okText: 'Datos guardados.' }
        );
    }

    function requestSaveDetails() {
        const errors = activityFormErrors(form);
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;
        if (form.gameType !== activity.gameType && activity.questions.length > 0) setPending('saveDetails');
        else saveDetails();
    }

    // Devuelve '' si guardó o el mensaje del servidor para mostrarlo junto al campo.
    async function saveQuestion(payload) {
        const message = await perform(
            () => (editing === 'new'
                ? addContentQuestion(token, id, payload)
                : updateContentQuestion(token, id, editing, payload)),
            { okText: editing === 'new' ? 'Pregunta agregada.' : 'Pregunta guardada.' }
        );
        if (!message && mounted.current) {
            setEditing(null);
            focusQuestions();
        }
        return message;
    }

    function runPending() {
        const kinds = {
            submit: () => perform(() => submitContentActivity(token, id), { okText: 'Actividad enviada a revisión.' }),
            withdraw: () => perform(() => withdrawContentActivity(token, id), { okText: 'Actividad retirada de revisión: volvió a borrador.' }),
            archive: () => perform(() => archiveContentActivity(token, id), { okText: 'Actividad archivada.' }),
            revision: () => perform(() => createContentRevision(token, id), {
                after: (created) => onOpen(created.id, 'Se creó el borrador de la revisión. Ya puedes editarlo.')
            }),
            delete: () => perform(() => deleteContentActivity(token, id), { after: () => onBack('Borrador borrado.') }),
            saveDetails,
            leave: () => onBack()
        };
        kinds[pending]();
    }

    const pendingText = {
        submit: '¿Enviar esta actividad a revisión? Mientras esté en revisión no podrás editarla.',
        withdraw: '¿Retirar la actividad de revisión? Volverá a borrador.',
        archive: '¿Archivar esta actividad publicada? Dejará de verse para los estudiantes.',
        revision: '¿Crear una revisión? Se copiará la actividad y sus preguntas a un borrador nuevo; la publicada no cambia.',
        delete: '¿Borrar este borrador con todas sus preguntas? No se puede deshacer.',
        leave: 'Tienes cambios sin guardar en los datos de la actividad. Si vuelves a la lista se perderán.',
        saveDetails: 'Cambiar el tipo de juego puede dejar inválidas las preguntas ya creadas (por ejemplo, el orden de una oración). Revísalas después de guardar. ¿Guardar de todos modos?'
    };
    const pendingLabel = {
        submit: 'Enviar a revisión', withdraw: 'Retirar de revisión', archive: 'Archivar',
        revision: 'Crear revisión', delete: 'Borrar borrador', saveDetails: 'Cambiar tipo de juego',
        leave: 'Salir sin guardar'
    };

    const backButton = <button type="button" className={BTN_SECONDARY} onClick={() => onBack()}>← Volver a la lista</button>;

    if (!activity) {
        return (
            <div className="space-y-4">
                {backButton}
                {detail.status === 'error' ? (
                    <ErrorBanner message={detail.error} onRetry={detail.reload} />
                ) : (
                    <LoadingRows label="Cargando actividad..." />
                )}
            </div>
        );
    }

    const isDraft = activity.status === 'draft';
    const dirty = isDraft && form ? !sameFields(form, activity) : false;
    const questions = Array.isArray(activity.questions) ? activity.questions : [];
    const submitBlocked = questions.length === 0 || dirty;
    // Con cambios sin guardar en los datos, "Volver" pide confirmación en línea.
    const guardedBack = (
        <button type="button" className={BTN_SECONDARY} onClick={() => (dirty ? setPending('leave') : onBack())}>
            ← Volver a la lista
        </button>
    );

    return (
        <div className="space-y-5">
            {guardedBack}
            {pending === 'leave' && (
                <FocusedConfirm
                    label={pendingLabel.leave}
                    confirmText="Sí, salir sin guardar"
                    danger
                    busy={busy}
                    onConfirm={runPending}
                    onCancel={() => setPending(null)}
                >
                    {pendingText.leave}
                </FocusedConfirm>
            )}

            <section className={CARD} aria-labelledby="activity-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="activity-title" ref={headingRef} tabIndex={-1} className="break-words text-xl font-display text-brand-600 outline-none">
                            {activity.title}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Actividad n.º {activity.id} · {MODULE_LABELS[activity.moduleSlug] || activity.moduleSlug} · {GAME_LABELS[activity.gameType] || activity.gameType} · Nivel {activity.level}
                        </p>
                        <p className="text-sm text-gray-500">
                            Autor: {authorLabel(activity.authorId, myId)} · Última actualización: {formatDateTime(activity.updatedAt)}
                        </p>
                    </div>
                    <StatusBadge value={activity.status} map={STATUS_MAP} />
                </div>

                {activity.replacesId !== null && activity.replacesId !== undefined && (
                    <p className="mt-3 text-sm text-gray-600">
                        Es una revisión de la actividad n.º {activity.replacesId}.{' '}
                        <button type="button" className="font-bold text-brand-600 underline" onClick={() => onOpen(activity.replacesId)}>Abrir la original</button>
                    </p>
                )}

                {isDraft && activity.reviewNote && (
                    <div role="note" className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 p-4">
                        <p className="text-sm font-bold text-red-700">El revisor devolvió esta actividad con esta nota:</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-800">{activity.reviewNote}</p>
                        <p className="mt-2 text-xs text-red-700">Corrige lo indicado y vuelve a enviarla a revisión.</p>
                    </div>
                )}

                {!isDraft && STATUS_EXPLANATION[activity.status] && (
                    <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">{STATUS_EXPLANATION[activity.status]}</p>
                )}
            </section>

            <Notice notice={notice} onClose={() => setNotice(null)} />

            <section className={CARD} aria-labelledby="actions-title">
                <h3 id="actions-title" className="mb-3 text-lg font-display text-brand-600">Acciones</h3>
                <div className="flex flex-wrap gap-2">
                    {isDraft && (
                        <>
                            <button type="button" className={BTN_PRIMARY} disabled={busy || submitBlocked} onClick={() => setPending('submit')}>Enviar a revisión</button>
                            <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => setPending('delete')}>Borrar borrador</button>
                        </>
                    )}
                    {activity.status === 'in_review' && (
                        <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setPending('withdraw')}>Retirar de revisión</button>
                    )}
                    {activity.status === 'published' && (
                        <>
                            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => setPending('revision')}>Crear revisión</button>
                            <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => setPending('archive')}>Archivar</button>
                        </>
                    )}
                    {activity.status === 'archived' && <p className="text-sm text-gray-500">No hay acciones disponibles.</p>}
                </div>
                {isDraft && submitBlocked && (
                    <p className="mt-2 text-xs text-gray-500">
                        {dirty ? 'Guarda los cambios de los datos antes de enviar a revisión.' : 'Agrega al menos una pregunta para poder enviar a revisión.'}
                    </p>
                )}
                {pending && pending !== 'leave' && (
                    <div className="mt-3">
                        <FocusedConfirm
                            label={pendingLabel[pending]}
                            danger={pending === 'delete' || pending === 'archive'}
                            busy={busy}
                            onConfirm={runPending}
                            onCancel={() => setPending(null)}
                        >
                            {pendingText[pending]}
                        </FocusedConfirm>
                    </div>
                )}
            </section>

            <section className={CARD} aria-labelledby="data-title">
                <h3 id="data-title" className="mb-3 text-lg font-display text-brand-600">Datos de la actividad</h3>
                {isDraft && form ? (
                    <form
                        noValidate
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!busy) requestSaveDetails();
                        }}
                        className="space-y-4"
                    >
                        <ActivityFields
                            idPrefix="edit"
                            form={form}
                            errors={formErrors}
                            disabled={busy}
                            onChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
                        />
                        <button type="submit" className={BTN_PRIMARY} disabled={busy || !dirty}>
                            Guardar datos
                        </button>
                    </form>
                ) : (
                    <>
                        {activity.passageText ? (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Texto de lectura</p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{activity.passageText}</p>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">Esta actividad no tiene texto de lectura.</p>
                        )}
                    </>
                )}
            </section>

            <section className={CARD} aria-labelledby="questions-title">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 id="questions-title" ref={questionsHeadingRef} tabIndex={-1} className="text-lg font-display text-brand-600 outline-none">Preguntas ({questions.length})</h3>
                    {isDraft && editing === null && (
                        <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => setEditing('new')}>Agregar pregunta</button>
                    )}
                </div>

                {isDraft && editing === 'new' && (
                    <div className="mb-4">
                        <QuestionForm
                            idPrefix="question-new"
                            gameType={activity.gameType}
                            question={null}
                            busy={busy}
                            onSave={saveQuestion}
                            onCancel={() => setEditing(null)}
                        />
                    </div>
                )}

                {questions.length === 0 && editing !== 'new' && (
                    <p className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center font-bold text-gray-400">
                        Esta actividad todavía no tiene preguntas.
                    </p>
                )}

                <ol className="space-y-3">
                    {questions.map((question, index) => (
                        <li key={question.id} className="rounded-2xl border-2 border-gray-100 p-4">
                            {isDraft && editing === question.id ? (
                                <QuestionForm
                                    idPrefix={`question-${question.id}`}
                                    gameType={activity.gameType}
                                    question={question}
                                    busy={busy}
                                    onSave={saveQuestion}
                                    onCancel={() => setEditing(null)}
                                />
                            ) : (
                                <QuestionItem
                                    question={question}
                                    index={index}
                                    gameType={activity.gameType}
                                    editable={isDraft}
                                    busy={busy}
                                    onEdit={() => setEditing(question.id)}
                                    onDelete={() => setDeletingQuestion(question.id)}
                                />
                            )}
                            {isDraft && deletingQuestion === question.id && (
                                <div className="mt-3">
                                    <FocusedConfirm
                                        label="Borrar pregunta"
                                        confirmText="Sí, borrar"
                                        danger
                                        busy={busy}
                                        onConfirm={async () => {
                                            const message = await perform(
                                                () => deleteContentQuestion(token, id, question.id),
                                                { okText: 'Pregunta borrada.' }
                                            );
                                            // El botón "Borrar" desaparece con la pregunta: el foco pasa al encabezado.
                                            if (!message) focusQuestions();
                                        }}
                                        onCancel={() => setDeletingQuestion(null)}
                                    >
                                        ¿Borrar la pregunta {index + 1}? No se puede deshacer.
                                    </FocusedConfirm>
                                </div>
                            )}
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    );
}
