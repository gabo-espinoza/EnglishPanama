import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaff } from '../../components/StaffRoute';

// Piezas compartidas de las pantallas de gestión (/staff/*). Salen de lo que ya repiten
// IdentityAccess.jsx y Audit.jsx (mismas clases y mismos textos); esas páginas NO se tocaron.
// Las páginas nuevas deben usar estas piezas para verse y comportarse igual.
//
//   import { CARD, BTN_PRIMARY, PageHeader, ErrorBanner, EmptyState, LoadingRows, Notice,
//            StatusBadge, ConfirmPanel, Field, FIELD, useAsync, useMounted, formatDate,
//            formatDateTime, errorMessage } from './ui';
//
// Esquema típico de una página:
//   const { token } = useStaff();
//   const list = useAsync(() => listReports(token, { status }), [token, status]);
//   <PageHeader title="Soporte" subtitle="..." />
//   {list.status === 'loading' && !list.data && <LoadingRows label="Cargando reportes..." />}
//   {list.status === 'error' && <ErrorBanner message={list.error} onRetry={list.reload} />}
//   {list.status === 'ok' && list.data.length === 0 && <EmptyState text="No hay reportes." />}
//   ...tras una acción exitosa: list.reload();
// Las acciones (POST/PUT/DELETE) se hacen en el manejador del botón con try/catch:
//   catch (err) { if (!handleAuthError(err)) setNotice({ type: 'error', text: errorMessage(err, { 409: '...' }) }); }
// y se protegen con useMounted() antes de tocar el estado después de un await.

export const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-4 sm:p-6';
export const BTN_PRIMARY = 'rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_SECONDARY = 'rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_DANGER = 'rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed';
export const FIELD = 'w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-brand-500 focus:bg-white transition-colors';
export const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400';

export const NO_PERMISSION = 'No tienes permiso para esta acción, o tu cuenta de gestión no está activa.';

export function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Fecha y hora en UTC, igual que la auditoría.
export function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleString('es-PA', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC`;
}

// Mensaje para mostrar de un error de la API. `byStatus` permite textos propios por estado
// ({ 409: 'La actividad ya cambió de estado.' }); el 403 sin texto propio usa NO_PERMISSION.
// Los mensajes del servidor vienen sin tildes: preferir `byStatus`/`byCode` para los casos esperados.
export function errorMessage(err, byStatus = {}, byCode = {}) {
    if (err && err.code && byCode[err.code]) return byCode[err.code];
    if (err && byStatus[err.status]) return byStatus[err.status];
    if (err && err.status === 403) return NO_PERMISSION;
    return (err && err.message) || 'Ocurrió un error inesperado.';
}

// true mientras la página siga montada. Úsalo tras un await en manejadores de acciones:
//   const mounted = useMounted();  ...  await x(); if (!mounted.current) return;
export function useMounted() {
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    return mounted;
}

// Carga de datos segura en StrictMode (bandera `active`, igual que las páginas existentes).
// `load` es una función sin argumentos que devuelve la promesa (se vuelve a ejecutar cuando
// cambia algo de `deps` o se llama a reload()). Ante un 401 cierra la sesión de staff.
// Devuelve { status: 'loading' | 'ok' | 'error', data, error, reload }. Mientras recarga conserva
// `data` anterior, así la tabla no parpadea; muestra el esqueleto solo si `data` es null.
export function useAsync(load, deps = []) {
    const { handleAuthError } = useStaff();
    const [state, setState] = useState({ status: 'loading', data: null, error: '' });
    const [reloadKey, setReloadKey] = useState(0);
    const loadRef = useRef(load);
    loadRef.current = load;

    useEffect(() => {
        let active = true;
        setState((prev) => ({ ...prev, status: 'loading', error: '' }));
        loadRef.current()
            .then((data) => {
                if (active) setState({ status: 'ok', data, error: '' });
            })
            .catch((err) => {
                if (!active) return;
                if (handleAuthError(err)) return;
                setState({ status: 'error', data: null, error: errorMessage(err) });
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reloadKey, handleAuthError, ...deps]);

    const reload = useCallback(() => setReloadKey((n) => n + 1), []);
    return { ...state, reload };
}

// Encabezado de página: título h1 y subtítulo. `actions` (opcional) va a la derecha.
export function PageHeader({ title, subtitle, actions }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-gray-100 pb-4">
            <div className="min-w-0">
                <h1 className="text-2xl font-display text-brand-600 sm:text-3xl">{title}</h1>
                {subtitle && <p className="text-sm font-medium text-gray-500">{subtitle}</p>}
            </div>
            {actions}
        </div>
    );
}

// Error de carga con botón "Reintentar" (onRetry opcional).
export function ErrorBanner({ message, onRetry }) {
    return (
        <div role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center">
            <p className="mb-3 text-sm font-bold text-red-700">{message}</p>
            {onRetry && <button type="button" onClick={onRetry} className={BTN_SECONDARY}>Reintentar</button>}
        </div>
    );
}

// Estado vacío (sin datos reales). `children` admite un llamado a la acción.
export function EmptyState({ text, children }) {
    return (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
            <p className="font-bold text-gray-400">{text}</p>
            {children}
        </div>
    );
}

// Estado de carga anunciado a lector de pantalla.
export function LoadingRows({ label = 'Cargando...' }) {
    return <p role="status" className="py-6 text-center text-sm text-gray-500">{label}</p>;
}

// Aviso de resultado de una acción: { type: 'ok' | 'error', text } o null. Con onClose muestra "Cerrar".
export function Notice({ notice, onClose }) {
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
            {onClose && (
                <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="shrink-0 text-xs underline">
                    Cerrar
                </button>
            )}
        </div>
    );
}

const BADGE_TONES = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-100 text-gray-600'
};

// Etiqueta de estado. `map` = { valorDelServidor: { label, tone } } con tone en
// blue | green | amber | red | gray. Un valor desconocido se muestra tal cual, en gris.
//   <StatusBadge value={report.status} map={REPORT_STATUS} />
export function StatusBadge({ value, map = {} }) {
    const entry = map[value] || { label: value, tone: 'gray' };
    return (
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${BADGE_TONES[entry.tone] || BADGE_TONES.gray}`}>
            {entry.label}
        </span>
    );
}

// Confirmación en línea para acciones que cambian datos (mismo patrón que IdentityAccess):
// se muestra al pulsar el botón de la acción y se cierra con onCancel o tras onConfirm.
//   {pending && <ConfirmPanel label="Confirmar rechazo" busy={busy} onConfirm={run} onCancel={() => setPending(null)}>
//       ¿Rechazar la actividad "X"?</ConfirmPanel>}
export function ConfirmPanel({ label = 'Confirmar acción', confirmText = 'Sí, confirmar', danger = false, busy = false, onConfirm, onCancel, children }) {
    return (
        <div role="alertdialog" aria-label={label} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <div className="text-sm font-bold text-amber-900">{children}</div>
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={onConfirm} disabled={busy} className={danger ? BTN_DANGER : BTN_PRIMARY}>
                    {busy ? 'Procesando...' : confirmText}
                </button>
                <button type="button" onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>Cancelar</button>
            </div>
        </div>
    );
}

// Campo de formulario con etiqueta asociada (htmlFor) y ayuda opcional enlazada con aria-describedby.
// El control hijo debe llevar id={id} y, si hay `hint`, aria-describedby={`${id}-help`}.
//   <Field id="titulo" label="Título" hint="Hasta 100 caracteres.">
//       <input id="titulo" className={FIELD} aria-describedby="titulo-help" ... />
//   </Field>
export function Field({ id, label, hint, children }) {
    return (
        <div>
            <label htmlFor={id} className={LABEL}>{label}</label>
            {children}
            {hint && <p id={`${id}-help`} className="mt-1 text-xs text-gray-400">{hint}</p>}
        </div>
    );
}
