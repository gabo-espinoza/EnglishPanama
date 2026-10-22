import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaff } from '../../components/StaffRoute';
import { ROLE_LABELS } from './StaffLayout';
import {
    createChangeRequest,
    createTeacher,
    listAccounts,
    resetTeacherGrade,
    resetTeacherMfa
} from '../../api/staff';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-4 sm:p-6';
const BTN_PRIMARY = 'rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_SECONDARY = 'rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_DANGER = 'rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed';
const FIELD = 'w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-brand-500 focus:bg-white transition-colors';
const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400';

const MIN_REASON = 5;
const MAX_REASON = 40;
// Mismo criterio que el servidor: sin "|", caracteres de control ni de formato.
const REASON_INVALID = /[|\p{Cc}\p{Cf}\u2028\u2029]/u;

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;
const MAX_DISPLAY_NAME = 100;
const NO_PERMISSION = 'No tienes permiso para esta acción, o tu cuenta de gestión no está activa.';

const STATUS_LABELS = { active: 'Activa', suspended: 'Suspendida' };

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
    const active = status === 'active';
    return (
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-blue-100 text-blue-600' : 'bg-red-50 text-red-600'}`}>
            {STATUS_LABELS[status] || status}
        </span>
    );
}

function Notice({ notice, onClose }) {
    if (!notice) return null;
    const ok = notice.type === 'ok';
    return (
        <div
            role={ok ? 'status' : 'alert'}
            className={`flex items-start justify-between gap-3 rounded-xl border-2 p-3 text-sm font-bold ${
                ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
            }`}
        >
            <span>{notice.text}</span>
            <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="shrink-0 text-xs underline">
                Cerrar
            </button>
        </div>
    );
}

export default function IdentityAccess() {
    const { token, role, id: myId, handleAuthError } = useStaff();
    const canManage = role === 'access_manager';

    // --- Cuentas de gestión ---
    const [accounts, setAccounts] = useState([]);
    const [accountsState, setAccountsState] = useState('loading'); // loading | ok | error
    const [accountsError, setAccountsError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;
        setAccountsState('loading');
        listAccounts(token)
            .then((data) => {
                if (!active) return;
                setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
                setAccountsState('ok');
            })
            .catch((err) => {
                if (!active) return;
                if (handleAuthError(err)) return;
                setAccountsError(err.status === 403 ? NO_PERMISSION : err.message);
                setAccountsState('error');
            });
        return () => {
            active = false;
        };
    }, [token, reloadKey, handleAuthError]);

    // --- Crear docente ---
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    // La contraseña temporal solo vive en este estado mientras la persona no cierre el recuadro.
    const [created, setCreated] = useState(null);
    const [copyMessage, setCopyMessage] = useState('');

    // --- Acciones sobre docentes ---
    const [teacherId, setTeacherId] = useState('');
    const [reason, setReason] = useState('');
    const [pending, setPending] = useState(null); // { kind: 'mfa' | 'grade', id, reason? }
    const [teacherBusy, setTeacherBusy] = useState(false);
    const [teacherFormError, setTeacherFormError] = useState('');
    const [teacherNotice, setTeacherNotice] = useState(null);

    // --- Solicitudes de cambio ---
    const [pendingRequest, setPendingRequest] = useState(null); // { id, username, action }
    const [requestBusy, setRequestBusy] = useState(false);
    const [requestNotice, setRequestNotice] = useState(null);

    // Evita actualizar estado si la persona sale de la página con una petición en curso.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const dismissCreated = useCallback(() => {
        setCreated(null);
        setCopyMessage('');
    }, []);

    async function handleCreate(event) {
        event.preventDefault();
        if (creating) return;
        setCreateError('');
        dismissCreated();
        if (!USERNAME_PATTERN.test(username.trim())) {
            setCreateError('El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo, sin espacios.');
            return;
        }
        const cleanName = displayName.trim();
        if (cleanName.length < 1 || cleanName.length > MAX_DISPLAY_NAME) {
            setCreateError(`El nombre debe tener entre 1 y ${MAX_DISPLAY_NAME} caracteres.`);
            return;
        }
        setCreating(true);
        try {
            const result = await createTeacher(token, username.trim(), cleanName);
            if (!mounted.current) return;
            setCreated({
                id: result.id,
                username: result.username,
                displayName: result.displayName,
                classCode: result.classCode,
                temporaryPassword: result.temporaryPassword
            });
            setUsername('');
            setDisplayName('');
        } catch (err) {
            if (!mounted.current) return;
            if (handleAuthError(err)) return;
            setCreateError(err.status === 403 ? NO_PERMISSION : err.message);
        } finally {
            if (mounted.current) setCreating(false);
        }
    }

    async function handleCopy() {
        if (!created) return;
        try {
            await navigator.clipboard.writeText(created.temporaryPassword);
            setCopyMessage('Contraseña copiada.');
        } catch {
            setCopyMessage('No se pudo copiar. Selecciónala y cópiala a mano.');
        }
    }

    function askTeacherAction(kind) {
        setTeacherNotice(null);
        setTeacherFormError('');
        if (!/^[1-9]\d{0,9}$/.test(teacherId.trim())) {
            setTeacherFormError('Escribe el número de identificación del docente (un número entero positivo).');
            return;
        }
        if (kind === 'grade') {
            const clean = reason.trim();
            if (clean.length < MIN_REASON || clean.length > MAX_REASON) {
                setTeacherFormError(`El motivo debe tener entre ${MIN_REASON} y ${MAX_REASON} caracteres.`);
                return;
            }
            if (REASON_INVALID.test(clean)) {
                setTeacherFormError('El motivo no puede incluir el carácter "|" ni caracteres de control.');
                return;
            }
            setPending({ kind, id: teacherId.trim(), reason: clean });
            return;
        }
        setPending({ kind, id: teacherId.trim() });
    }

    async function confirmTeacherAction() {
        if (!pending || teacherBusy) return;
        const action = pending;
        setTeacherBusy(true);
        setTeacherNotice(null);
        try {
            if (action.kind === 'mfa') {
                const result = await resetTeacherMfa(token, action.id);
                if (!mounted.current) return;
                setTeacherNotice({
                    type: 'ok',
                    text: `Se reinició el MFA de ${result.username}. En su próximo inicio de sesión deberá vincular un autenticador nuevo.`
                });
            } else {
                const result = await resetTeacherGrade(token, action.id, action.reason);
                if (!mounted.current) return;
                setTeacherNotice({
                    type: 'ok',
                    text: `Se reinició el grado de la clase de ${result.username}. El docente podrá declararlo de nuevo.`
                });
                setReason('');
            }
        } catch (err) {
            if (!mounted.current) return;
            if (handleAuthError(err)) return;
            let text = err.message;
            if (err.status === 403) text = NO_PERMISSION;
            else if (err.code === 'GRADE_NOT_SET') text = 'Esta clase aún no tiene un grado declarado, así que no hay nada que reiniciar.';
            else if (err.status === 404) text = 'No existe un docente con ese número de identificación.';
            setTeacherNotice({ type: 'error', text });
        } finally {
            if (mounted.current) {
                setPending(null);
                setTeacherBusy(false);
            }
        }
    }

    async function confirmChangeRequest() {
        if (!pendingRequest || requestBusy) return;
        const target = pendingRequest;
        setRequestBusy(true);
        setRequestNotice(null);
        try {
            const result = await createChangeRequest(token, target.id, target.action);
            if (!mounted.current) return;
            setRequestNotice({
                type: 'ok',
                text: `Solicitud n.º ${result.id} creada para ${target.username}. Queda pendiente de la decisión del auditor.`
            });
        } catch (err) {
            if (!mounted.current) return;
            if (handleAuthError(err)) return;
            setRequestNotice({
                type: 'error',
                text: err.status === 403 ? NO_PERMISSION : err.message
            });
        } finally {
            if (mounted.current) {
                setPendingRequest(null);
                setRequestBusy(false);
            }
        }
    }

    return (
        <div className="animate-fade-in space-y-6 pb-10">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-2xl font-display text-brand-600 sm:text-3xl">Identidad y accesos</h1>
                <p className="text-sm font-medium text-gray-500">
                    {canManage
                        ? 'Gestión de cuentas de docentes y control de accesos del personal.'
                        : 'Consulta de las cuentas del personal (solo lectura).'}
                </p>
            </div>

            {canManage && (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    {/* Crear docente */}
                    <section className={`${CARD} h-fit`} aria-labelledby="crear-docente">
                        <h2 id="crear-docente" className="mb-4 text-lg font-bold text-gray-800">Crear cuenta de docente</h2>
                        <form onSubmit={handleCreate} className="space-y-4" noValidate>
                            <div>
                                <label htmlFor="teacher-username" className={LABEL}>Usuario</label>
                                <input
                                    id="teacher-username"
                                    type="text"
                                    className={FIELD}
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    maxLength={30}
                                    autoComplete="off"
                                    aria-describedby="teacher-username-help"
                                    required
                                />
                                <p id="teacher-username-help" className="mt-1 text-xs text-gray-400">
                                    De 3 a 30 caracteres: letras, números, punto, guion o guion bajo.
                                </p>
                            </div>
                            <div>
                                <label htmlFor="teacher-name" className={LABEL}>Nombre completo</label>
                                <input
                                    id="teacher-name"
                                    type="text"
                                    className={FIELD}
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    maxLength={100}
                                    autoComplete="off"
                                    required
                                />
                            </div>
                            {createError && (
                                <p role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                                    {createError}
                                </p>
                            )}
                            <button type="submit" disabled={creating} className={`${BTN_PRIMARY} w-full`}>
                                {creating ? 'Creando...' : 'Crear cuenta y generar contraseña temporal'}
                            </button>
                        </form>

                        {created && (
                            <div className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                                <p role="alert" className="text-sm font-bold text-amber-800">
                                    Cuenta creada. Esta contraseña temporal no se volverá a mostrar: entrégala al docente ahora.
                                </p>
                                <dl className="mt-3 space-y-2 text-sm">
                                    <div>
                                        <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">Usuario</dt>
                                        <dd className="break-all font-bold text-gray-800">{created.username}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">Código de clase</dt>
                                        <dd className="font-mono font-bold text-gray-800">{created.classCode}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">Contraseña temporal</dt>
                                        <dd className="select-all break-all rounded-lg bg-white px-3 py-2 font-mono font-bold text-gray-900">
                                            {created.temporaryPassword}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-bold uppercase tracking-wide text-gray-500">Número de identificación</dt>
                                        <dd className="font-bold text-gray-800">{created.id}</dd>
                                    </div>
                                </dl>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button type="button" onClick={handleCopy} className={BTN_PRIMARY}>Copiar</button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTeacherId(String(created.id));
                                            setPending(null);
                                        }}
                                        className={BTN_SECONDARY}
                                    >
                                        Usar este docente en las acciones
                                    </button>
                                    <button type="button" onClick={dismissCreated} className={BTN_SECONDARY}>
                                        Ya la anoté, cerrar
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-amber-800">
                                    Al copiarla, el portapapeles conserva la contraseña hasta que copies otra cosa.
                                </p>
                                {copyMessage && (
                                    <p role="status" className="mt-2 text-xs font-bold text-amber-800">{copyMessage}</p>
                                )}
                            </div>
                        )}
                    </section>

                    {/* Acciones sobre un docente */}
                    <section className={`${CARD} h-fit`} aria-labelledby="acciones-docente">
                        <h2 id="acciones-docente" className="mb-1 text-lg font-bold text-gray-800">Acciones sobre un docente</h2>
                        <p className="mb-4 text-xs text-gray-500">
                            No existe un listado de docentes: escribe el número de identificación del docente. Se muestra
                            al crear su cuenta, así que anótalo en ese momento.
                        </p>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="teacher-id" className={LABEL}>Número de identificación del docente</label>
                                <input
                                    id="teacher-id"
                                    type="text"
                                    inputMode="numeric"
                                    className={FIELD}
                                    value={teacherId}
                                    onChange={(e) => {
                                        setTeacherId(e.target.value.replace(/\D/g, ''));
                                        setPending(null);
                                    }}
                                    maxLength={10}
                                    autoComplete="off"
                                />
                            </div>
                            <div>
                                <label htmlFor="grade-reason" className={LABEL}>Motivo (solo para reiniciar el grado)</label>
                                <input
                                    id="grade-reason"
                                    type="text"
                                    className={FIELD}
                                    value={reason}
                                    onChange={(e) => {
                                        setReason(e.target.value);
                                        setPending(null);
                                    }}
                                    maxLength={MAX_REASON}
                                    autoComplete="off"
                                    aria-describedby="grade-reason-help"
                                />
                                <p id="grade-reason-help" className="mt-1 text-xs text-gray-400">
                                    De {MIN_REASON} a {MAX_REASON} caracteres, sin el carácter "|". Queda en el registro de auditoría.
                                    ({reason.trim().length}/{MAX_REASON})
                                </p>
                            </div>

                            {teacherFormError && (
                                <p role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                                    {teacherFormError}
                                </p>
                            )}

                            {!pending && (
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => askTeacherAction('mfa')} className={BTN_SECONDARY}>
                                        Reiniciar MFA
                                    </button>
                                    <button type="button" onClick={() => askTeacherAction('grade')} className={BTN_SECONDARY}>
                                        Reiniciar grado de la clase
                                    </button>
                                </div>
                            )}

                            {pending && (
                                <div role="alertdialog" aria-label="Confirmar acción" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                                    <p className="text-sm font-bold text-amber-900">
                                        {pending.kind === 'mfa'
                                            ? `¿Reiniciar el MFA del docente n.º ${pending.id}? Se cerrarán sus sesiones y deberá vincular un autenticador nuevo. Verifica antes su identidad por un medio ajeno a la aplicación.`
                                            : `¿Reiniciar el grado de la clase del docente n.º ${pending.id}? El docente podrá declararlo de nuevo. Motivo: ${pending.reason}`}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button type="button" onClick={confirmTeacherAction} disabled={teacherBusy} className={BTN_DANGER}>
                                            {teacherBusy ? 'Procesando...' : 'Sí, confirmar'}
                                        </button>
                                        <button type="button" onClick={() => setPending(null)} disabled={teacherBusy} className={BTN_SECONDARY}>
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}

                            <Notice notice={teacherNotice} onClose={() => setTeacherNotice(null)} />
                        </div>
                    </section>
                </div>
            )}

            {/* Directorio de cuentas */}
            <section className={CARD} aria-labelledby="directorio">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 id="directorio" className="text-lg font-bold text-gray-800">Cuentas del personal</h2>
                    {accountsState === 'ok' && (
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-600">{accounts.length}</span>
                    )}
                </div>

                {canManage && (
                    <p className="mb-3 text-xs text-gray-500">
                        Suspender o activar una cuenta requiere la aprobación del auditor: aquí solo se crea la solicitud.
                    </p>
                )}

                <div className="mb-3">
                    <Notice notice={requestNotice} onClose={() => setRequestNotice(null)} />
                </div>

                {pendingRequest && (
                    <div role="alertdialog" aria-label="Confirmar solicitud" className="mb-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm font-bold text-amber-900">
                            {`¿Solicitar ${pendingRequest.action === 'suspend' ? 'la suspensión' : 'la activación'} de la cuenta ${pendingRequest.username}? El auditor deberá aprobarla.`}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={confirmChangeRequest} disabled={requestBusy} className={BTN_PRIMARY}>
                                {requestBusy ? 'Enviando...' : 'Sí, crear solicitud'}
                            </button>
                            <button type="button" onClick={() => setPendingRequest(null)} disabled={requestBusy} className={BTN_SECONDARY}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {accountsState === 'loading' && (
                    <p role="status" className="py-6 text-center text-sm text-gray-500">Cargando cuentas...</p>
                )}

                {accountsState === 'error' && (
                    <div role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center">
                        <p className="mb-3 text-sm font-bold text-red-700">{accountsError}</p>
                        <button type="button" onClick={() => setReloadKey((n) => n + 1)} className={BTN_SECONDARY}>Reintentar</button>
                    </div>
                )}

                {accountsState === 'ok' && accounts.length === 0 && (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                        <p className="font-bold text-gray-400">No hay cuentas de personal registradas.</p>
                    </div>
                )}

                {accountsState === 'ok' && accounts.length > 0 && (
                    <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
                        <table className="w-full whitespace-nowrap text-left text-sm">
                            <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th scope="col" className="px-4 py-3">Usuario</th>
                                    <th scope="col" className="px-4 py-3">Rol</th>
                                    <th scope="col" className="px-4 py-3 text-center">Estado</th>
                                    <th scope="col" className="px-4 py-3">Creada</th>
                                    {canManage && <th scope="col" className="px-4 py-3 text-right">Acciones</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {accounts.map((account) => {
                                    const isMe = account.id === myId;
                                    const nextAction = account.status === 'active' ? 'suspend' : account.status === 'suspended' ? 'activate' : null;
                                    return (
                                        <tr key={account.id} className="transition-colors hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-gray-800">{account.username}{isMe ? ' (tú)' : ''}</p>
                                                <p className="text-xs text-gray-400">N.º {account.id}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                                    {ROLE_LABELS[account.role] || account.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center"><StatusBadge status={account.status} /></td>
                                            <td className="px-4 py-3 text-gray-500">{formatDate(account.createdAt)}</td>
                                            {canManage && (
                                                <td className="px-4 py-3 text-right">
                                                    {!isMe && nextAction ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setRequestNotice(null);
                                                                setPendingRequest({ id: account.id, username: account.username, action: nextAction });
                                                            }}
                                                            className={`text-xs font-bold ${nextAction === 'suspend' ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                                                        >
                                                            {nextAction === 'suspend' ? 'Solicitar suspensión' : 'Solicitar activación'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-gray-300">—</span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
