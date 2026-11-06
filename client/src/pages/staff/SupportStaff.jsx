import { useEffect, useRef, useState } from 'react';
import { useStaff } from '../../components/StaffRoute';
import { decideReport, listReports } from '../../api/staff';
import {
    BTN_DANGER,
    BTN_PRIMARY,
    BTN_SECONDARY,
    CARD,
    EmptyState,
    ErrorBanner,
    LoadingRows,
    Notice,
    PageHeader,
    StatusBadge,
    errorMessage,
    formatDateTime,
    useAsync,
    useMounted
} from './ui';
import FocusedConfirm from './FocusedConfirm';

const STATUS_FILTERS = [
    { value: 'open', label: 'Abiertos' },
    { value: 'escalated', label: 'Escalados' },
    { value: 'resolved', label: 'Resueltos' },
    { value: 'dismissed', label: 'Descartados' }
];

const REPORT_STATUS = {
    open: { label: 'Abierto', tone: 'blue' },
    escalated: { label: 'Escalado al gestor de contenido', tone: 'amber' },
    resolved: { label: 'Resuelto', tone: 'green' },
    dismissed: { label: 'Descartado', tone: 'gray' }
};

const REPORTER_ROLES = { student: 'Estudiante', teacher: 'Docente' };

const EMPTY_TEXT = {
    open: 'No hay reportes de soporte pendientes.',
    escalated: 'No hay reportes de soporte escalados.',
    resolved: 'No hay reportes de soporte resueltos.',
    dismissed: 'No hay reportes de soporte descartados.'
};

// Cada decisión dice qué pasa con el reporte; desde esta bandeja no se puede deshacer.
const DECISIONS = {
    escalate: {
        button: 'Escalar',
        confirmText: 'Sí, escalar',
        danger: false,
        consequence: 'El reporte pasará al gestor de contenido para que corrija la actividad y saldrá de tu bandeja de pendientes. No podrás deshacerlo.',
        done: 'El reporte se escaló al gestor de contenido.'
    },
    resolve: {
        button: 'Resolver',
        confirmText: 'Sí, resolver',
        danger: false,
        consequence: 'El reporte quedará cerrado como resuelto: el problema ya está atendido. No podrás reabrirlo.',
        done: 'El reporte se marcó como resuelto.'
    },
    dismiss: {
        button: 'Descartar',
        confirmText: 'Sí, descartar',
        danger: true,
        consequence: 'El reporte quedará cerrado sin acción, porque no hay un error que corregir. No podrás reabrirlo.',
        done: 'El reporte se descartó.'
    }
};

const DECISION_ORDER = ['escalate', 'resolve', 'dismiss'];

const ALREADY_HANDLED = 'Otra persona ya atendió este reporte. Se actualizó la lista.';
const DECIDE_ERRORS_BY_STATUS = {
    403: 'No puedes realizar esa decisión sobre este reporte, o tu cuenta de gestión no está activa.',
    404: 'Ese reporte ya no está en tu bandeja de pendientes. Se actualizó la lista.',
    409: ALREADY_HANDLED
};
const DECIDE_ERRORS_BY_CODE = { REPORT_CLOSED: ALREADY_HANDLED };

function activityLabel(report) {
    return report.activityTitle
        ? `«${report.activityTitle}» (n.º ${report.activityId})`
        : `n.º ${report.activityId} (ya no disponible)`;
}

function buttonClass(decision) {
    if (decision === 'escalate') return BTN_PRIMARY;
    if (decision === 'dismiss') return BTN_DANGER;
    return BTN_SECONDARY;
}

function ReportCard({ report, pending, busy, onAsk, onCancel, onConfirm }) {
    // El servidor solo deja decidir sobre reportes abiertos de la bandeja de soporte.
    const canDecide = report.status === 'open';
    const ask = pending && pending.id === report.id ? DECISIONS[pending.decision] : null;
    const titleId = `reporte-${report.id}-titulo`;

    return (
        <li>
            <article aria-labelledby={titleId} className={`${CARD} space-y-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                        Reporte n.º {report.id} · Error en el contenido
                    </p>
                    <StatusBadge value={report.status} map={REPORT_STATUS} />
                </div>

                <h3 id={titleId} className="break-words text-sm font-bold text-gray-700">
                    {report.questionId ? `Pregunta n.º ${report.questionId} de la actividad` : 'Actividad'} {activityLabel(report)}
                </h3>
                <p className="text-xs text-gray-500">
                    Reportado por: {REPORTER_ROLES[report.reporterRole] || report.reporterRole}{report.reporterAlias ? ` · ${report.reporterAlias}` : ''} · {formatDateTime(report.createdAt)}
                </p>

                <figure>
                    <figcaption className="text-xs font-bold uppercase tracking-wide text-gray-400">
                        Nota escrita por quien reportó
                    </figcaption>
                    {report.note ? (
                        <blockquote className="mt-1 whitespace-pre-wrap break-words rounded-xl border-l-4 border-brand-500 bg-gray-50 px-4 py-3 text-sm italic text-gray-700">
                            {report.note}
                        </blockquote>
                    ) : (
                        <p className="mt-1 text-sm text-gray-400">Sin nota</p>
                    )}
                </figure>

                {canDecide && !ask && (
                    <div className="flex flex-wrap gap-2">
                        {DECISION_ORDER.map((decision) => (
                            <button
                                key={decision}
                                type="button"
                                id={`soporte-${report.id}-${decision}`}
                                aria-label={`${DECISIONS[decision].button} el reporte n.º ${report.id}`}
                                disabled={busy}
                                onClick={() => onAsk(report.id, decision)}
                                className={buttonClass(decision)}
                            >
                                {DECISIONS[decision].button}
                            </button>
                        ))}
                    </div>
                )}

                {ask && (
                    <FocusedConfirm
                        label={ask.button}
                        confirmText={ask.confirmText}
                        danger={ask.danger}
                        busy={busy}
                        onConfirm={onConfirm}
                        onCancel={onCancel}
                    >
                        <p>{`${ask.button} el reporte n.º ${report.id} de la actividad ${activityLabel(report)}.`}</p>
                        <p className="mt-1 font-medium">{ask.consequence}</p>
                    </FocusedConfirm>
                )}
            </article>
        </li>
    );
}

export default function SupportStaff() {
    const { token, handleAuthError } = useStaff();
    const mounted = useMounted();
    const [status, setStatus] = useState('open');
    const [pending, setPending] = useState(null); // { id, decision }
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const noticeRef = useRef(null);
    const restoreRef = useRef(null); // botón que abrió la confirmación cancelada

    const list = useAsync(() => listReports(token, { kind: 'error', status }), [token, status]);

    // Al abrir la confirmación el foco pasa a "Cancelar" (FocusedConfirm); al mostrar un resultado, al aviso.
    useEffect(() => {
        if (notice && noticeRef.current) noticeRef.current.focus();
    }, [notice]);

    // Al cancelar una confirmación el foco vuelve al botón que la abrió.
    useEffect(() => {
        if (pending || !restoreRef.current) return;
        const opener = document.getElementById(restoreRef.current);
        restoreRef.current = null;
        if (opener) opener.focus();
    }, [pending]);

    function cancel() {
        if (pending) restoreRef.current = `soporte-${pending.id}-${pending.decision}`;
        setPending(null);
    }

    function changeStatus(next) {
        if (busy || next === status) return;
        setPending(null);
        setNotice(null);
        setStatus(next);
    }

    async function confirm() {
        if (!pending || busy) return;
        const { id, decision } = pending;
        setBusy(true);
        let result;
        let refresh = true;
        try {
            await decideReport(token, id, decision);
            result = { type: 'ok', text: DECISIONS[decision].done };
        } catch (err) {
            if (handleAuthError(err)) {
                // Si la pantalla sigue montada no debe quedar bloqueada.
                if (mounted.current) setBusy(false);
                return;
            }
            result = { type: 'error', text: errorMessage(err, DECIDE_ERRORS_BY_STATUS, DECIDE_ERRORS_BY_CODE) };
            // Solo 404 y 409 indican que el reporte ya cambió; en otros errores la lista sigue igual.
            refresh = Boolean(err) && (err.status === 404 || err.status === 409);
        }
        if (!mounted.current) return;
        setPending(null);
        setBusy(false);
        setNotice(result);
        if (refresh) list.reload();
    }

    const reports = Array.isArray(list.data) ? list.data : [];

    return (
        <div className="space-y-5">
            <PageHeader title="Soporte" subtitle="Reportes de errores en las actividades y preguntas." />

            <p className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
                Las notas pueden contener texto escrito por menores de edad. No las copies ni las compartas fuera de la plataforma.
            </p>

            <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((filter) => (
                    <button
                        key={filter.value}
                        type="button"
                        aria-pressed={status === filter.value}
                        disabled={busy}
                        onClick={() => changeStatus(filter.value)}
                        className={status === filter.value ? BTN_PRIMARY : BTN_SECONDARY}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {notice && (
                <div ref={noticeRef} tabIndex={-1} className="outline-none">
                    <Notice notice={notice} onClose={() => setNotice(null)} />
                </div>
            )}

            {list.status === 'loading' && !list.data && <LoadingRows label="Cargando reportes..." />}
            {list.status === 'error' && <ErrorBanner message={list.error} onRetry={list.reload} />}
            {list.status === 'ok' && reports.length === 0 && <EmptyState text={EMPTY_TEXT[status]} />}

            {reports.length > 0 && (
                <>
                    {reports.length >= 200 && (
                        <p className="text-sm text-gray-500">Se muestran los 200 reportes más recientes.</p>
                    )}
                    <ul aria-busy={list.status === 'loading'} className="space-y-4">
                        {reports.map((report) => (
                            <ReportCard
                                key={report.id}
                                report={report}
                                pending={pending}
                                busy={busy}
                                onAsk={(id, decision) => setPending({ id, decision })}
                                onCancel={cancel}
                                onConfirm={confirm}
                            />
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
