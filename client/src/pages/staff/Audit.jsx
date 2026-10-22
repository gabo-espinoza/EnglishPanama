import { useEffect, useRef, useState } from 'react';
import { useStaff } from '../../components/StaffRoute';
import { ROLE_LABELS } from './StaffLayout';
import { decideChangeRequest, listAudit, listChangeRequests, verifyAudit } from '../../api/staff';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-4 sm:p-6';
const BTN_PRIMARY = 'rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_SECONDARY = 'rounded-xl border-2 border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';
const FIELD = 'w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand-500 focus:bg-white transition-colors';
const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400';

const PAGE_SIZE = 25;
const NO_PERMISSION = 'No tienes permiso para esta acción, o tu cuenta de gestión no está activa.';

// Valores reales de audit_log.actor_type (staff, y user.role: student o teacher).
const ACTOR_TYPE_LABELS = { staff: 'Gestión', student: 'Estudiante', teacher: 'Docente' };
const ACTOR_ROLE_LABELS = { ...ROLE_LABELS, student: 'Estudiante', teacher: 'Docente' };

const ACTION_LABELS = { suspend: 'Suspensión de cuenta', activate: 'Activación de cuenta' };
const DECISION_VERBS = { approved: 'aprobar', rejected: 'rechazar' };
const REQUEST_STATUS = {
    pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800' },
    approved: { label: 'Aprobada', className: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rechazada', className: 'bg-red-50 text-red-600' }
};

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleString('es-PA', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC`;
}

// Traduce los errores de separación de funciones del servidor (llegan sin tildes).
function decisionErrorMessage(err) {
    const text = String(err.message || '');
    if (err.status === 409) return 'La solicitud ya fue resuelta. Se actualizó la lista.';
    if (err.status === 404) return 'La solicitud ya no existe.';
    if (err.status === 403) {
        if (text.includes('creaste')) return 'No puedes decidir una solicitud que tú mismo creaste.';
        if (text.includes('propia cuenta')) return 'No puedes decidir un cambio sobre tu propia cuenta.';
        return NO_PERMISSION;
    }
    return text || 'No se pudo registrar la decisión.';
}

export default function Audit() {
    const { token, role, id: myId, handleAuthError } = useStaff();
    const canDecide = role === 'auditor';

    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // --- Verificación de integridad ---
    const [verifying, setVerifying] = useState(false);
    const [verifyResult, setVerifyResult] = useState(null); // { ok, checked } | { ok:false, brokenAtId, reason } | { error }

    async function handleVerify() {
        if (verifying) return;
        setVerifying(true);
        setVerifyResult(null);
        try {
            const result = await verifyAudit(token);
            if (!mounted.current) return;
            setVerifyResult(result);
        } catch (err) {
            if (!mounted.current) return;
            if (handleAuthError(err)) return;
            setVerifyResult({ error: err.status === 403 ? NO_PERMISSION : err.message });
        } finally {
            if (mounted.current) setVerifying(false);
        }
    }

    // --- Solicitudes de cambio ---
    const [statusFilter, setStatusFilter] = useState('pending');
    const [requests, setRequests] = useState([]);
    const [requestsState, setRequestsState] = useState('loading');
    const [requestsError, setRequestsError] = useState('');
    const [requestsKey, setRequestsKey] = useState(0);
    const [decision, setDecision] = useState(null); // { id, username, decision }
    const [decisionBusy, setDecisionBusy] = useState(false);
    const [decisionNotice, setDecisionNotice] = useState(null);

    useEffect(() => {
        let active = true;
        setRequestsState('loading');
        listChangeRequests(token, statusFilter)
            .then((data) => {
                if (!active) return;
                setRequests(Array.isArray(data.requests) ? data.requests : []);
                setRequestsState('ok');
            })
            .catch((err) => {
                if (!active) return;
                if (handleAuthError(err)) return;
                setRequestsError(err.status === 403 ? NO_PERMISSION : err.message);
                setRequestsState('error');
            });
        return () => {
            active = false;
        };
    }, [token, statusFilter, requestsKey, handleAuthError]);

    async function confirmDecision() {
        if (!decision || decisionBusy) return;
        const current = decision;
        setDecisionBusy(true);
        setDecisionNotice(null);
        try {
            const result = await decideChangeRequest(token, current.id, current.decision);
            if (!mounted.current) return;
            setDecisionNotice({
                type: 'ok',
                text: `Solicitud n.º ${result.id ?? current.id} ${result.status === 'approved' ? 'aprobada' : 'rechazada'}.`
            });
            setRequestsKey((n) => n + 1);
        } catch (err) {
            if (!mounted.current) return;
            if (handleAuthError(err)) return;
            setDecisionNotice({ type: 'error', text: decisionErrorMessage(err) });
            if (err.status === 409 || err.status === 404) setRequestsKey((n) => n + 1);
        } finally {
            if (mounted.current) {
                setDecision(null);
                setDecisionBusy(false);
            }
        }
    }

    // --- Registro de auditoría ---
    const emptyFilters = { actorType: '', actorRole: '', action: '', from: '', to: '' };
    const [form, setForm] = useState(emptyFilters);
    const [applied, setApplied] = useState(emptyFilters);
    const [offset, setOffset] = useState(0);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [auditState, setAuditState] = useState('loading');
    const [auditError, setAuditError] = useState('');
    const [auditKey, setAuditKey] = useState(0);
    const [filterError, setFilterError] = useState('');

    useEffect(() => {
        let active = true;
        setAuditState('loading');
        // Las fechas se envían como texto UTC, que es como se guarda occurred_at.
        listAudit(token, {
            actorType: applied.actorType,
            actorRole: applied.actorRole,
            action: applied.action.trim(),
            from: applied.from ? `${applied.from} 00:00:00.000` : '',
            to: applied.to ? `${applied.to} 23:59:59.999` : '',
            limit: PAGE_SIZE,
            offset
        })
            .then((data) => {
                if (!active) return;
                setRows(Array.isArray(data.rows) ? data.rows : []);
                setTotal(Number(data.total) || 0);
                setAuditState('ok');
            })
            .catch((err) => {
                if (!active) return;
                if (handleAuthError(err)) return;
                setAuditError(err.status === 403 ? NO_PERMISSION : err.message);
                setAuditState('error');
            });
        return () => {
            active = false;
        };
    }, [token, applied, offset, auditKey, handleAuthError]);

    function applyFilters(event) {
        event.preventDefault();
        if (form.from && form.to && form.from > form.to) {
            setFilterError('La fecha «Desde» no puede ser posterior a «Hasta».');
            return;
        }
        setFilterError('');
        setOffset(0);
        setApplied(form);
    }

    function clearFilters() {
        setFilterError('');
        setForm(emptyFilters);
        setOffset(0);
        setApplied(emptyFilters);
    }

    function setField(name) {
        return (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));
    }

    const from = total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + PAGE_SIZE, total);

    return (
        <div className="animate-fade-in space-y-6 pb-10">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-2xl font-display text-brand-600 sm:text-3xl">Auditoría y cumplimiento</h1>
                <p className="text-sm font-medium text-gray-500">
                    Consulta el registro inmutable del sistema y decide las solicitudes de cambio de cuentas.
                </p>
            </div>

            {/* Solicitudes de cambio */}
            <section className={CARD} aria-labelledby="solicitudes">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <h2 id="solicitudes" className="text-lg font-bold text-gray-800">Solicitudes de cambio</h2>
                    <div>
                        <label htmlFor="request-status" className={LABEL}>Estado</label>
                        <select
                            id="request-status"
                            className={FIELD}
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setDecision(null);
                            }}
                        >
                            <option value="pending">Pendientes</option>
                            <option value="approved">Aprobadas</option>
                            <option value="rejected">Rechazadas</option>
                            <option value="">Todas</option>
                        </select>
                    </div>
                </div>

                {decisionNotice && (
                    <div
                        role={decisionNotice.type === 'ok' ? 'status' : 'alert'}
                        className={`mb-3 flex items-start justify-between gap-3 rounded-xl border-2 p-3 text-sm font-bold ${
                            decisionNotice.type === 'ok' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                    >
                        <span>{decisionNotice.text}</span>
                        <button type="button" onClick={() => setDecisionNotice(null)} aria-label="Cerrar aviso" className="shrink-0 text-xs underline">
                            Cerrar
                        </button>
                    </div>
                )}

                {decision && (
                    <div role="alertdialog" aria-label="Confirmar decisión" className="mb-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm font-bold text-amber-900">
                            {`¿Seguro que quieres ${DECISION_VERBS[decision.decision]} la solicitud n.º ${decision.id} sobre la cuenta ${decision.username}?${
                                decision.decision === 'approved' ? ' El cambio se aplicará de inmediato y se cerrarán las sesiones de esa cuenta.' : ''
                            }`}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={confirmDecision} disabled={decisionBusy} className={BTN_PRIMARY}>
                                {decisionBusy ? 'Registrando...' : 'Sí, confirmar'}
                            </button>
                            <button type="button" onClick={() => setDecision(null)} disabled={decisionBusy} className={BTN_SECONDARY}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {requestsState === 'loading' && (
                    <p role="status" className="py-6 text-center text-sm text-gray-500">Cargando solicitudes...</p>
                )}

                {requestsState === 'error' && (
                    <div role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center">
                        <p className="mb-3 text-sm font-bold text-red-700">{requestsError}</p>
                        <button type="button" onClick={() => setRequestsKey((n) => n + 1)} className={BTN_SECONDARY}>Reintentar</button>
                    </div>
                )}

                {requestsState === 'ok' && requests.length === 0 && (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                        <p className="font-bold text-gray-400">No hay solicitudes de cambio con este filtro.</p>
                    </div>
                )}

                {requestsState === 'ok' && requests.length > 0 && (
                    <ul className="space-y-3">
                        {requests.map((req) => {
                            const status = REQUEST_STATUS[req.status] || { label: req.status, className: 'bg-gray-100 text-gray-600' };
                            const isPending = req.status === 'pending';
                            const ownRequest = req.requestedBy === myId;
                            const ownTarget = req.targetId === myId;
                            const blocked = ownRequest || ownTarget;
                            return (
                                <li
                                    key={req.id}
                                    className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 p-4 ${
                                        isPending ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-white'
                                    }`}
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                                N.º {req.id} • {ACTION_LABELS[req.action] || req.action}
                                            </span>
                                            <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${status.className}`}>{status.label}</span>
                                        </div>
                                        <p className="break-all text-lg font-bold text-gray-800">Cuenta objetivo: {req.targetUsername}</p>
                                        <p className="text-xs font-medium text-gray-500">
                                            Solicitada por la cuenta n.º {req.requestedBy} el {formatDateTime(req.createdAt)}
                                            {req.decidedAt ? `. Decidida por la cuenta n.º ${req.decidedBy} el ${formatDateTime(req.decidedAt)}` : ''}
                                        </p>
                                        {isPending && canDecide && blocked && (
                                            <p className="mt-1 text-xs font-bold text-amber-700">
                                                {ownRequest
                                                    ? 'No puedes decidir una solicitud que tú mismo creaste.'
                                                    : 'No puedes decidir un cambio sobre tu propia cuenta.'}
                                            </p>
                                        )}
                                    </div>
                                    {isPending && canDecide && !blocked && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setDecision({ id: req.id, username: req.targetUsername, decision: 'rejected' })}
                                                disabled={decisionBusy}
                                                className="rounded-xl bg-red-100 px-5 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50"
                                            >
                                                Rechazar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDecision({ id: req.id, username: req.targetUsername, decision: 'approved' })}
                                                disabled={decisionBusy}
                                                className="rounded-xl bg-green-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-green-600 disabled:opacity-50"
                                            >
                                                Aprobar
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* Registro de auditoría */}
            <section className={CARD} aria-labelledby="registro">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 id="registro" className="text-lg font-bold text-gray-800">Registro de auditoría (solo lectura)</h2>
                    <button type="button" onClick={handleVerify} disabled={verifying} className={BTN_PRIMARY}>
                        {verifying ? 'Verificando...' : 'Verificar integridad'}
                    </button>
                </div>

                {verifyResult && verifyResult.error && (
                    <div role="alert" className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                        No se pudo verificar el registro: {verifyResult.error}
                    </div>
                )}
                {verifyResult && !verifyResult.error && verifyResult.ok === true && (
                    <div role="status" className="mb-4 rounded-xl border-2 border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">
                        La cadena está íntegra: se comprobaron {verifyResult.checked} registros.
                    </div>
                )}
                {verifyResult && !verifyResult.error && verifyResult.ok !== true && (
                    <div role="alert" className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">
                        Se detectó una alteración en el registro: la cadena se rompe en el registro n.º {verifyResult.brokenAtId}
                        {verifyResult.reason === 'prev_hash'
                            ? ' (no coincide con el registro anterior, puede haberse borrado o insertado uno).'
                            : verifyResult.reason === 'row_hash'
                                ? ' (su contenido fue modificado).'
                                : '.'}
                    </div>
                )}

                <form onSubmit={applyFilters} className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                        <label htmlFor="f-actor-type" className={LABEL}>Tipo de actor</label>
                        <select id="f-actor-type" className={FIELD} value={form.actorType} onChange={setField('actorType')}>
                            <option value="">Todos</option>
                            <option value="staff">Gestión</option>
                            <option value="teacher">Docente</option>
                            <option value="student">Estudiante</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="f-actor-role" className={LABEL}>Rol del actor</label>
                        <select id="f-actor-role" className={FIELD} value={form.actorRole} onChange={setField('actorRole')}>
                            <option value="">Todos</option>
                            {Object.entries(ROLE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="f-action" className={LABEL}>Acción contiene</label>
                        <input id="f-action" type="text" className={FIELD} value={form.action} onChange={setField('action')} maxLength={60} autoComplete="off" />
                    </div>
                    <div>
                        <label htmlFor="f-from" className={LABEL}>Desde (UTC)</label>
                        <input id="f-from" type="date" className={FIELD} value={form.from} onChange={setField('from')} />
                    </div>
                    <div>
                        <label htmlFor="f-to" className={LABEL}>Hasta (UTC)</label>
                        <input id="f-to" type="date" className={FIELD} value={form.to} onChange={setField('to')} />
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
                        <button type="submit" className={BTN_PRIMARY}>Filtrar</button>
                        <button type="button" onClick={clearFilters} className={BTN_SECONDARY}>Limpiar filtros</button>
                    </div>
                </form>

                {filterError && (
                    <p role="alert" className="mb-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{filterError}</p>
                )}

                {auditState === 'loading' && (
                    <p role="status" className="py-6 text-center text-sm text-gray-500">Cargando registro...</p>
                )}

                {auditState === 'error' && (
                    <div role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center">
                        <p className="mb-3 text-sm font-bold text-red-700">{auditError}</p>
                        <button type="button" onClick={() => setAuditKey((n) => n + 1)} className={BTN_SECONDARY}>Reintentar</button>
                    </div>
                )}

                {auditState === 'ok' && rows.length === 0 && (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                        <p className="font-bold text-gray-400">No hay registros que coincidan con el filtro.</p>
                    </div>
                )}

                {auditState === 'ok' && rows.length > 0 && (
                    <>
                        <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
                            <table className="w-full whitespace-nowrap text-left text-sm">
                                <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th scope="col" className="px-4 py-3">N.º</th>
                                        <th scope="col" className="px-4 py-3">Fecha (UTC)</th>
                                        <th scope="col" className="px-4 py-3">Actor</th>
                                        <th scope="col" className="px-4 py-3">Acción</th>
                                        <th scope="col" className="px-4 py-3">Objetivo</th>
                                        <th scope="col" className="px-4 py-3 text-center">Resultado</th>
                                        <th scope="col" className="px-4 py-3">IP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {rows.map((row) => (
                                        <tr key={row.id} className="transition-colors hover:bg-gray-50">
                                            <td className="px-4 py-3 text-gray-500">{row.id}</td>
                                            <td className="px-4 py-3 text-gray-600">{formatDateTime(row.occurred_at)}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-gray-800">{ACTOR_ROLE_LABELS[row.actor_role] || row.actor_role || ACTOR_TYPE_LABELS[row.actor_type] || row.actor_type}</p>
                                                <p className="text-xs text-gray-400">
                                                    {row.actor_id !== null && row.actor_id !== undefined ? `Cuenta n.º ${row.actor_id}` : 'Sin cuenta'}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.action}</td>
                                            <td className="min-w-[12rem] whitespace-normal break-all px-4 py-3 font-mono text-xs text-gray-500">
                                                {row.target || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span
                                                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                                                        row.outcome === 'ok' ? 'bg-blue-100 text-blue-600' : 'bg-red-50 text-red-600'
                                                    }`}
                                                >
                                                    {row.outcome === 'ok' ? 'Correcto' : row.outcome === 'denied' ? 'Denegado' : row.outcome}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">{row.ip || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs font-bold text-gray-500" aria-live="polite">
                                Mostrando {from} a {to} de {total} registros
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
                                    disabled={offset === 0}
                                    className={BTN_SECONDARY}
                                >
                                    Anterior
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOffset((value) => value + PAGE_SIZE)}
                                    disabled={offset + PAGE_SIZE >= total}
                                    className={BTN_SECONDARY}
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
