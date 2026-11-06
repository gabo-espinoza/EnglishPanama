import { useState } from 'react';
import { useStaff } from '../../../components/StaffRoute';
import { decideReport, listReports } from '../../../api/staff';
import {
    BTN_DANGER,
    BTN_PRIMARY,
    BTN_SECONDARY,
    CARD,
    EmptyState,
    ErrorBanner,
    LoadingRows,
    Notice,
    errorMessage,
    formatDateTime,
    useAsync,
    useMounted
} from '../ui';
import FocusedConfirm from './FocusedConfirm';
import { REPORTER_ROLE_LABELS, REPORT_KIND_LABELS } from './constants';

const DECISION_LABELS = { resolve: 'Resolver', dismiss: 'Descartar' };
const DECISION_DONE = { resolve: 'Reporte resuelto.', dismiss: 'Reporte descartado.' };
const DECISION_QUESTION = {
    resolve: '¿Marcar este reporte como resuelto? Indica que ya atendiste el problema señalado.',
    dismiss: '¿Descartar este reporte? Indica que no requiere ninguna acción.'
};
const CLOSED_MESSAGE = 'Este reporte ya fue atendido o ya no está en tu bandeja. Actualizamos la lista.';

// Bloque "Reportes escalados a ti": lo que moderación y soporte enviaron al gestor de contenido.
// El servidor solo devuelve los escalados; aquí solo se puede resolver o descartar.
// Privacidad: reporterAlias es el usuario de acceso de un menor; llega en la respuesta pero NO se muestra.
export default function EscalatedReports({ onOpenActivity }) {
    const { token, handleAuthError } = useStaff();
    const mounted = useMounted();
    const list = useAsync(() => listReports(token), [token]);
    const [pending, setPending] = useState(null); // { id, decision }
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);

    async function confirm() {
        if (!pending || busy) return;
        const { id, decision } = pending;
        setBusy(true);
        setNotice(null);
        try {
            await decideReport(token, id, decision);
            if (!mounted.current) return;
            setPending(null);
            setNotice({ type: 'ok', text: DECISION_DONE[decision] });
            list.reload();
        } catch (err) {
            if (handleAuthError(err)) return;
            if (!mounted.current) return;
            setPending(null);
            setNotice({ type: 'error', text: errorMessage(err, { 404: CLOSED_MESSAGE }, { REPORT_CLOSED: CLOSED_MESSAGE }) });
            if (err.status === 404 || err.code === 'REPORT_CLOSED') list.reload();
        } finally {
            if (mounted.current) setBusy(false);
        }
    }

    const reports = Array.isArray(list.data) ? list.data : [];

    return (
        <section className={CARD} aria-labelledby="escalated-title">
            <h2 id="escalated-title" className="text-lg font-display text-brand-600">Reportes escalados a ti</h2>
            <p className="mb-4 text-sm text-gray-500">
                Reportes que moderación o soporte enviaron al gestor de contenido. Si el problema está en una actividad publicada, abre la actividad y crea una revisión para corregirla.
            </p>

            <div className="space-y-3">
                <Notice notice={notice} onClose={() => setNotice(null)} />
                {list.status === 'loading' && !list.data && <LoadingRows label="Cargando reportes escalados..." />}
                {list.status === 'error' && <ErrorBanner message={list.error} onRetry={list.reload} />}
                {list.status === 'ok' && reports.length === 0 && <EmptyState text="No tienes reportes escalados." />}

                {reports.length > 0 && (
                    <ul className="space-y-3">
                        {reports.map((report) => (
                            <li key={report.id} className="rounded-2xl border-2 border-gray-100 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                                            Reporte n.º {report.id} · {REPORT_KIND_LABELS[report.kind] || report.kind} · {formatDateTime(report.createdAt)}
                                        </p>
                                        <p className="break-words font-bold text-gray-800">
                                            {report.activityTitle || `Actividad n.º ${report.activityId}`}
                                            {report.questionId ? ` · pregunta n.º ${report.questionId}` : ''}
                                        </p>
                                    </div>
                                    {report.activityId && report.activityTitle && (
                                        <button type="button" className={BTN_SECONDARY} aria-label={`Abrir la actividad del reporte n.º ${report.id}`} onClick={() => onOpenActivity(report.activityId)}>
                                            Abrir actividad
                                        </button>
                                    )}
                                </div>
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{report.note || 'Sin nota'}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                    Reportado por: {REPORTER_ROLE_LABELS[report.reporterRole] || report.reporterRole}
                                </p>

                                {pending && pending.id === report.id ? (
                                    <div className="mt-3">
                                        <FocusedConfirm
                                            label={`${DECISION_LABELS[pending.decision]} reporte`}
                                            confirmText={`Sí, ${DECISION_LABELS[pending.decision].toLowerCase()}`}
                                            danger={pending.decision === 'dismiss'}
                                            busy={busy}
                                            onConfirm={confirm}
                                            onCancel={() => setPending(null)}
                                        >
                                            {DECISION_QUESTION[pending.decision]}
                                        </FocusedConfirm>
                                    </div>
                                ) : (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button type="button" className={BTN_PRIMARY} disabled={busy} aria-label={`Resolver el reporte n.º ${report.id}`} onClick={() => { setNotice(null); setPending({ id: report.id, decision: 'resolve' }); }}>
                                            Resolver
                                        </button>
                                        <button type="button" className={BTN_DANGER} disabled={busy} aria-label={`Descartar el reporte n.º ${report.id}`} onClick={() => { setNotice(null); setPending({ id: report.id, decision: 'dismiss' }); }}>
                                            Descartar
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
