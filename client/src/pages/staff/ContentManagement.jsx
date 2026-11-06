import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStaff } from '../../components/StaffRoute';
import { createContentActivity, listContentActivities } from '../../api/staff';
import {
    BTN_PRIMARY,
    BTN_SECONDARY,
    CARD,
    EmptyState,
    ErrorBanner,
    FIELD,
    Field,
    LoadingRows,
    Notice,
    PageHeader,
    StatusBadge,
    errorMessage,
    formatDate,
    useAsync,
    useMounted
} from './ui';
import ActivityDetail from './content/ActivityDetail';
import ActivityFields from './content/ActivityFields';
import EscalatedReports from './content/EscalatedReports';
import {
    GAME_LABELS,
    LEVELS,
    MODULE_LABELS,
    STATUS_MAP,
    activityFormErrors
} from './content/constants';

const EMPTY_FORM = { title: '', moduleSlug: 'vocabulary', gameType: 'memory', level: 'A1.1', passageText: '' };

function CreateActivity({ form, setForm, onCreated, onCancel }) {
    const { token, handleAuthError } = useStaff();
    const mounted = useMounted();
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const input = document.getElementById('create-title');
        if (input) input.focus();
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();
        if (busy) return;
        setServerError('');
        const found = activityFormErrors(form);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setBusy(true);
        try {
            const fields = {
                moduleSlug: form.moduleSlug,
                title: form.title.trim(),
                gameType: form.gameType,
                level: form.level
            };
            if (form.passageText.trim()) fields.passageText = form.passageText.trim();
            const created = await createContentActivity(token, fields);
            if (!mounted.current) return;
            onCreated(created.id);
        } catch (err) {
            if (handleAuthError(err)) return;
            if (!mounted.current) return;
            setServerError(errorMessage(err));
        } finally {
            if (mounted.current) setBusy(false);
        }
    }

    return (
        <section className={CARD} aria-labelledby="create-heading">
            <h2 id="create-heading" className="mb-1 text-lg font-display text-brand-600">Nueva actividad</h2>
            <p className="mb-4 text-sm text-gray-500">Se crea como borrador. Después podrás agregar las preguntas y enviarla a revisión.</p>
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <ActivityFields
                    idPrefix="create"
                    form={form}
                    errors={errors}
                    disabled={busy}
                    onChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
                />
                {serverError && <p role="alert" className="text-sm font-bold text-red-700">{serverError}</p>}
                <div className="flex flex-wrap gap-2">
                    <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? 'Creando...' : 'Crear borrador'}</button>
                    <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={onCancel}>Cancelar</button>
                </div>
            </form>
        </section>
    );
}

// Los filtros viven en la URL (?estado=&modulo=&nivel=): sobreviven a abrir una actividad y volver.
function ActivityList({
    flash, onFlashClose, onOpen, filters, onFilter, creating, setCreating, createForm, setCreateForm, onCreated
}) {
    const { token, id: myId } = useStaff();
    const { status, moduleSlug, level } = filters;
    const list = useAsync(
        () => listContentActivities(token, { status, module: moduleSlug, level }),
        [token, status, moduleSlug, level]
    );
    const activities = Array.isArray(list.data) ? list.data : [];
    const filtered = Boolean(status || moduleSlug || level);

    return (
        <div className="space-y-5">
            <Notice notice={flash} onClose={onFlashClose} />

            {creating ? (
                <CreateActivity
                    form={createForm}
                    setForm={setCreateForm}
                    onCreated={onCreated}
                    onCancel={() => {
                        setCreating(false);
                        setCreateForm(EMPTY_FORM);
                    }}
                />
            ) : (
                <div>
                    <button type="button" className={BTN_PRIMARY} onClick={() => setCreating(true)}>Nueva actividad</button>
                </div>
            )}

            <section className={CARD} aria-labelledby="activities-title">
                <h2 id="activities-title" className="mb-3 text-lg font-display text-brand-600">Actividades</h2>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <Field id="filter-status" label="Estado">
                        <select id="filter-status" className={FIELD} value={status} onChange={(e) => onFilter('estado', e.target.value)}>
                            <option value="">Todos</option>
                            {Object.entries(STATUS_MAP).map(([value, entry]) => (
                                <option key={value} value={value}>{entry.label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field id="filter-module" label="Módulo">
                        <select id="filter-module" className={FIELD} value={moduleSlug} onChange={(e) => onFilter('modulo', e.target.value)}>
                            <option value="">Todos</option>
                            {Object.entries(MODULE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field id="filter-level" label="Nivel">
                        <select id="filter-level" className={FIELD} value={level} onChange={(e) => onFilter('nivel', e.target.value)}>
                            <option value="">Todos</option>
                            {LEVELS.map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                <div aria-live="polite">
                    {list.status === 'loading' && !list.data && <LoadingRows label="Cargando actividades..." />}
                    {list.status === 'error' && <ErrorBanner message={list.error} onRetry={list.reload} />}
                    {list.status === 'ok' && activities.length === 0 && (
                        <EmptyState text={filtered ? 'Ninguna actividad coincide con los filtros.' : 'Todavía no hay actividades.'} />
                    )}
                </div>

                {activities.length > 0 && (
                    <ul className="space-y-3">
                        {activities.map((activity) => (
                            <li key={activity.id} className="rounded-2xl border-2 border-gray-100 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="break-words font-bold text-gray-800">{activity.title}</p>
                                        <p className="text-sm text-gray-500">
                                            Actividad n.º {activity.id} · {MODULE_LABELS[activity.moduleSlug] || activity.moduleSlug} · {GAME_LABELS[activity.gameType] || activity.gameType} · Nivel {activity.level}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            Autor: {Number(activity.authorId) === Number(myId) ? 'Tú' : `Cuenta de gestión n.º ${activity.authorId ?? '—'}`} · Actualizada: {formatDate(activity.updatedAt)}
                                            {activity.replacesId ? ` · Revisión de la actividad n.º ${activity.replacesId}` : ''}
                                        </p>
                                    </div>
                                    <StatusBadge value={activity.status} map={STATUS_MAP} />
                                </div>
                                {activity.status === 'draft' && activity.reviewNote && (
                                    <p className="mt-2 rounded-xl border-2 border-red-200 bg-red-50 p-2 text-sm text-red-800">
                                        <span className="font-bold">Devuelta por el revisor:</span> {activity.reviewNote}
                                    </p>
                                )}
                                <div className="mt-3">
                                    <button type="button" className={BTN_SECONDARY} onClick={() => onOpen(activity.id)} aria-label={`Abrir la actividad ${activity.title}`}>
                                        Abrir
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <EscalatedReports onOpenActivity={(activityId) => onOpen(activityId)} />
        </div>
    );
}

// Contenido (content_manager): lista, creación y edición de actividades, ciclo de vida y reportes
// escalados. La actividad abierta va en la URL (?actividad=n) para poder volver con el navegador.
export default function ContentManagement() {
    const [searchParams, setSearchParams] = useSearchParams();
    // Aviso de una acción: `forList` indica si debe verse en la lista (p. ej. tras borrar un borrador).
    const [flash, setFlash] = useState(null);
    // El formulario de creación vive aquí para no perderse al abrir una actividad y volver.
    const [creating, setCreating] = useState(false);
    const [createForm, setCreateForm] = useState(EMPTY_FORM);
    const rawId = searchParams.get('actividad');
    const activityId = rawId && /^\d+$/.test(rawId) ? rawId : null;
    // Solo se aceptan valores conocidos: una URL manipulada no filtra por algo inexistente.
    const pick = (key, allowed) => {
        const value = searchParams.get(key);
        return value && allowed.includes(value) ? value : '';
    };
    const filters = {
        status: pick('estado', Object.keys(STATUS_MAP)),
        moduleSlug: pick('modulo', Object.keys(MODULE_LABELS)),
        level: pick('nivel', LEVELS)
    };

    function open(id, message) {
        setFlash(message ? { type: 'ok', text: message, forList: false } : null);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('actividad', String(id));
            return next;
        });
    }

    function back(message) {
        setFlash(message ? { type: 'ok', text: message, forList: true } : null);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('actividad');
            return next;
        });
    }

    function setFilter(key, value) {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (value) next.set(key, value);
            else next.delete(key);
            return next;
        }, { replace: true });
    }

    function created(newId) {
        setCreating(false);
        setCreateForm(EMPTY_FORM);
        open(newId, 'Borrador creado. Agrega las preguntas y envíalo a revisión.');
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Contenido"
                subtitle="Crea y edita actividades, envíalas a revisión y atiende los reportes escalados."
            />
            {activityId ? (
                <ActivityDetail
                    key={activityId}
                    id={activityId}
                    initialNotice={flash && !flash.forList ? flash : null}
                    onBack={back}
                    onOpen={open}
                />
            ) : (
                <ActivityList
                    flash={flash && flash.forList ? flash : null}
                    onFlashClose={() => setFlash(null)}
                    onOpen={open}
                    filters={filters}
                    onFilter={setFilter}
                    creating={creating}
                    setCreating={setCreating}
                    createForm={createForm}
                    setCreateForm={setCreateForm}
                    onCreated={created}
                />
            )}
        </div>
    );
}
