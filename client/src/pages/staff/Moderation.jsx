import { useEffect, useRef, useState } from 'react';
import { useStaff } from '../../components/StaffRoute';
import { decideReport, listReports } from '../../api/staff';
import {
    BTN_PRIMARY,
    BTN_SECONDARY,
    CARD,
    ConfirmPanel,
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

const STATUS_FILTERS = [
    { value: 'open', label: 'Abiertos' },
    { value: 'escalated', label: 'Escalados' },
    { value: 'resolved', label: 'Resueltos' },
    { value: 'dismissed', label: 'Descartados' }
];

const REPORT_STATUS = {
    open: { label: 'Abierto', tone: 'amber' },
    escalated: { label: 'Escalado', tone: 'blue' },
    resolved: { label: 'Resuelto', tone: 'green' },
    dismissed: { label: 'Descartado', tone: 'gray' }
};

const REPORTER_ROLES = { student: 'Estudiante', teacher: 'Docente' };

const DECISIONS = {
    escalate: {
        button: 'Escalar',
        confirmText: 'Sí, escalar',
        danger: false,
        question: 'Vas a escalar este reporte. Pasará al gestor de contenido y saldrá de tu bandeja de abiertos; ya no podrás decidir sobre él.',
        done: 'Reporte escalado al gestor de contenido.'
    },
    resolve: {
        button: 'Resolver',
        confirmText: 'Sí, resolver',
        danger: false,
        question: 'Vas a marcar este reporte como resuelto: el contenido ya fue revisado y se atendió el problema. El reporte se cierra y esta decisión no se puede deshacer.',
        done: 'Reporte marcado como resuelto.'
    },
    dismiss: {
        button: 'Descartar',
        confirmText: 'Sí, descartar',
        danger: true,
        question: 'Vas a descartar este reporte porque no corresponde a contenido inadecuado. El reporte se cierra y esta decisión no se puede deshacer.',
        done: 'Reporte descartado.'
    }
};

const DECISION_ORDER = ['escalate', 'resolve', 'dismiss'];

const DECISION_ERRORS_BY_STATUS = {
    403: 'No puedes realizar esa decisión sobre este reporte.',
    404: 'Ese reporte ya no está en tu bandeja de abiertos. Se actualizó la lista.',
    409: 'Ese reporte ya fue atendido. Se actualizó la lista.'
};
const DECISION_ERRORS_BY_CODE = {
    REPORT_CLOSED: 'Ese reporte ya fue atendido. Se actualizó la lista.'
};

function ReportCard({ report, pending, busy, disabled, onChoose, onConfirm, onCancel }) {
    const panelRef = useRef(null);

    // Al abrir la confirmación el foco pasa al recuadro para que se anuncie y se pueda operar con teclado.
    useEffect(() => {
        if (pending && panelRef.current) panelRef.current.focus();
    }, [pending]);

    const reporterRole = REPORTER_ROLES[report.reporterRole] || report.reporterRole;
    const target = report.questionId
        ? `Pregunta n.º ${report.questionId} de la actividad`
        : 'Actividad';
    const activityName = report.activityTitle
        ? `«${report.activityTitle}» (n.º ${report.activityId})`
        : `n.º ${report.activityId} (ya no disponible)`;
    const decisionLabel = pending ? DECISIONS[pending] : null;

    return (
        <li className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Reporte n.º {report.id} · Contenido inadecuado
                </p>
                <StatusBadge value={report.status} map={REPORT_STATUS} />
            </div>

            <p className="mt-3 break-words text-sm font-bold text-gray-700">
                {target} {activityName}
            </p>
            <p className="mt-1 text-xs text-gray-500">
                Reportado por: {reporterRole} · {formatDateTime(report.createdAt)}
            </p>

            <figure className="mt-3">
                <figcaption className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Nota escrita por quien reportó
                </figcaption>
                {report.note ? (
                    <blockquote className="mt-1 break-words whitespace-pre-wrap rounded-xl border-l-4 border-brand-500 bg-gray-50 px-4 py-3 text-sm italic text-gray-700">
                        {report.note}
                    </blockquote>
                ) : (
                    <p className="mt-1 text-sm text-gray-400">Sin nota</p>
                )}
            </figure>

            {report.status === 'open' && !pending && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {DECISION_ORDER.map((decision) => (
                        <button
                            key={decision}
                            type="button"
                            id={`moderacion-${report.id}-${decision}`}
                            aria-label={`${DECISIONS[decision].button} el reporte n.º ${report.id}`}
                            disabled={disabled}
                            onClick={() => onChoose(report.id, decision)}
                            className={decision === 'resolve' ? BTN_PRIMARY : BTN_SECONDARY}
                        >
                            {DECISIONS[decision].button}
                        </button>
                    ))}
                </div>
            )}

            {report.status === 'escalated' && (
                <p className="mt-4 text-xs font-bold text-gray-500">
                    Este reporte está en manos del gestor de contenido; ya no puedes decidir sobre él.
                </p>
            )}

            {decisionLabel && (
                <div ref={panelRef} tabIndex={-1} className="mt-4 outline-none">
                    <ConfirmPanel
                        label={`Confirmar: ${decisionLabel.button}`}
                        confirmText={decisionLabel.confirmText}
                        danger={decisionLabel.danger}
                        busy={busy}
                        onConfirm={onConfirm}
                        onCancel={onCancel}
                    >
                        {decisionLabel.question}
                    </ConfirmPanel>
                </div>
            )}
        </li>
    );
}

export default function Moderation() {
    const { token, handleAuthError } = useStaff();
    const mounted = useMounted();
    const [status, setStatus] = useState('open');
    const [pending, setPending] = useState(null); // { id, decision }
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const noticeRef = useRef(null);
    const restoreRef = useRef(null); // botón que abrió la confirmación cancelada

    const list = useAsync(() => listReports(token, { status }), [token, status]);

    // Al mostrar un resultado el foco pasa al aviso; al cancelar, vuelve al botón que abrió la confirmación.
    useEffect(() => {
        if (notice && noticeRef.current) noticeRef.current.focus();
    }, [notice]);
    useEffect(() => {
        if (pending || !restoreRef.current) return;
        const opener = document.getElementById(restoreRef.current);
        restoreRef.current = null;
        if (opener) opener.focus();
    }, [pending]);

    function cancel() {
        if (pending) restoreRef.current = `moderacion-${pending.id}-${pending.decision}`;
        setPending(null);
    }

    function changeStatus(next) {
        if (busy || next === status) return;
        setPending(null);
        setNotice(null);
        setStatus(next);
    }

    function choose(id, decision) {
        setNotice(null);
        setPending({ id, decision });
    }

    async function confirm() {
        if (!pending || busy) return;
        const { id, decision } = pending;
        setBusy(true);
        try {
            await decideReport(token, id, decision);
            if (!mounted.current) return;
            setNotice({ type: 'ok', text: `${DECISIONS[decision].done} (Reporte n.º ${id}.)` });
            setPending(null);
            list.reload();
        } catch (err) {
            if (!mounted.current) return;
            if (handleAuthError(err)) return;
            setNotice({ type: 'error', text: errorMessage(err, DECISION_ERRORS_BY_STATUS, DECISION_ERRORS_BY_CODE) });
            setPending(null);
            // Si el reporte cambió o salió de la bandeja, la lista debe reflejarlo.
            if (err && (err.status === 404 || err.status === 409)) list.reload();
        } finally {
            if (mounted.current) setBusy(false);
        }
    }

    const reports = Array.isArray(list.data) ? list.data : [];

    return (
        <div className="space-y-4">
            <PageHeader
                title="Moderación"
                subtitle="Reportes de contenido inadecuado. Decide si se escalan, se resuelven o se descartan."
            />

            <p className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                Privacidad: las notas pueden contener texto escrito por menores de edad. No las copies ni las compartas fuera de la plataforma.
            </p>

            {notice && (
                <div ref={noticeRef} tabIndex={-1} className="outline-none">
                    <Notice notice={notice} onClose={() => setNotice(null)} />
                </div>
            )}

            <div role="group" aria-label="Filtrar reportes por estado" className="flex flex-wrap gap-2">
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

            {list.status === 'loading' && !list.data && <LoadingRows label="Cargando reportes..." />}
            {list.status === 'error' && <ErrorBanner message={list.error} onRetry={list.reload} />}

            {list.status === 'ok' && reports.length === 0 && (
                <EmptyState
                    text={status === 'open'
                        ? 'No hay reportes de moderación pendientes.'
                        : `No hay reportes ${STATUS_FILTERS.find((f) => f.value === status).label.toLowerCase()}.`}
                />
            )}

            {list.data && reports.length > 0 && (
                <>
                    <p role="status" className="text-sm font-bold text-gray-500">
                        {reports.length === 1 ? '1 reporte' : `${reports.length} reportes`}
                        {reports.length >= 200 ? ' (se muestran los 200 más recientes)' : ''}
                    </p>
                    <ul className="space-y-4" aria-busy={list.status === 'loading'}>
                        {reports.map((report) => (
                            <ReportCard
                                key={report.id}
                                report={report}
                                pending={pending && pending.id === report.id ? pending.decision : null}
                                busy={busy}
                                disabled={busy || pending !== null}
                                onChoose={choose}
                                onConfirm={confirm}
                                onCancel={cancel}
                            />
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
