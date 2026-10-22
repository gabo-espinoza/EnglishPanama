import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-6';
const FIELD = 'w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 focus:bg-white';
const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400';
const BTN_PRIMARY = 'rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_0_#1A5955] transition-all hover:translate-y-1 hover:shadow-[0_2px_0_0_#1A5955] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none';
const BTN_SECONDARY = 'rounded-xl border-2 border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:border-blue-500 hover:bg-blue-50';

// Según la matriz, Soporte solo escala a estos dos roles.
const DESTINOS = [
    { value: 'access_manager', label: 'Gestor de accesos' },
    { value: 'content_manager', label: 'Gestor de contenido' },
];
const DESTINO_LABEL = Object.fromEntries(DESTINOS.map((d) => [d.value, d.label]));

// Destino sugerido según el tipo de caso.
const SUGERIDO = {
    'Pregunta con error': 'content_manager',
    'Problema de acceso': 'access_manager',
};

const STATUS_CHIP = {
    Abierto: 'bg-amber-100 text-amber-800',
    'En revisión': 'bg-blue-100 text-blue-700',
    Escalado: 'bg-brand-100 text-brand-600',
    Atendido: 'bg-green-100 text-green-800',
    Resuelto: 'bg-gray-100 text-gray-600',
};

const REQUEST_LABEL = { suspend: 'Suspender cuenta', activate: 'Activar cuenta' };

const CASOS_INICIALES = [
    { id: 'C-1042', alias: 'LunaBlue', category: 'Pregunta con error', status: 'Abierto', date: '21/10/2026', text: 'La pregunta de la lección 2 tiene la opción correcta repetida.', replies: [], escalatedTo: null, note: '', handledNote: '', request: null },
    { id: 'C-1045', alias: 'ShadowK', category: 'Problema técnico', status: 'En revisión', date: '20/10/2026', text: 'No puedo avanzar al nivel A1.2, se queda cargando.', replies: [], escalatedTo: null, note: '', handledNote: '', request: null },
    { id: 'C-1047', alias: 'NovaStar', category: 'Problema de acceso', status: 'Escalado', date: '19/10/2026', text: 'No puedo entrar, mi docente dice que mi cuenta está bloqueada.', replies: [], escalatedTo: 'access_manager', note: 'Verificar con el docente antes de cualquier cambio.', handledNote: '', request: null },
    { id: 'C-1049', alias: 'PixelFox', category: 'Pregunta con error', status: 'Escalado', date: '18/10/2026', text: 'En el reto diario aparece una palabra mal escrita en la opción B.', replies: [], escalatedTo: 'content_manager', note: 'Revisar la ortografía del banco de preguntas.', handledNote: '', request: null },
];

function Logo() {
    return (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-display text-xl text-white">
            E
        </div>
    );
}

function Title({ children }) {
    return (
        <h2 className="inline-block border-b-[3px] border-blue-300 text-lg font-bold leading-tight text-brand-600">
            {children}
        </h2>
    );
}

export default function SupportStaff() {
    const { currentRole } = useOutletContext();
    const [casos, setCasos] = useState(CASOS_INICIALES);
    const [filtro, setFiltro] = useState('pendientes');
    // Panel abierto en un caso:
    // { id, mode: 'reply' | 'escalate' | 'request' | 'attend', text, destino, note, kind, reason }
    const [panel, setPanel] = useState(null);
    const [notice, setNotice] = useState(null);

    const isSupport = currentRole === 'support';
    const isAccessManager = currentRole === 'access_manager';
    // Roles que reciben casos escalados.
    const isReceiver = Object.keys(DESTINO_LABEL).includes(currentRole);

    if (!isSupport && !isReceiver) {
        return (
            <div className={`${CARD} text-center`}>
                <h1 className="text-2xl font-display text-brand-600">Sin acceso</h1>
                <p className="mt-2 text-sm font-medium text-gray-500">Tu rol no tiene permiso para ver este módulo.</p>
            </div>
        );
    }

    const isPending = (c) => c.status === 'Abierto' || c.status === 'En revisión';

    // Los roles que reciben casos solo ven los que Soporte les escaló a ellos.
    const base = isSupport ? casos : casos.filter((c) => c.escalatedTo === currentRole);

    const FILTROS = [
        { id: 'pendientes', label: 'Pendientes', test: isPending },
        { id: 'escalados', label: 'Escalados', test: (c) => c.status === 'Escalado' || c.status === 'Atendido' },
        { id: 'resueltos', label: 'Resueltos', test: (c) => c.status === 'Resuelto' },
        { id: 'todos', label: 'Todos', test: () => true },
    ];

    const visibles = isSupport ? base.filter(FILTROS.find((f) => f.id === filtro).test) : base;
    const pendientes = isSupport ? base.filter(isPending).length : base.filter((c) => c.status === 'Escalado').length;

    function openPanel(caso, mode, extra = {}) {
        setPanel({ id: caso.id, mode, text: '', destino: SUGERIDO[caso.category] || '', note: '', kind: '', reason: '', ...extra });
        setNotice(null);
    }

    function updateCaso(id, changes) {
        setCasos((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
    }

    function sendReply(e, caso) {
        e.preventDefault();
        const text = panel.text.trim();
        if (!text) return;
        // TODO: conectar con la API de soporte para enviar la respuesta al usuario.
        updateCaso(caso.id, {
            status: 'En revisión',
            replies: [...caso.replies, { text, date: new Date().toLocaleDateString('es-PA') }],
        });
        setPanel(null);
        setNotice({ type: 'ok', text: `Respuesta enviada en el caso ${caso.id}.` });
    }

    function escalate(e, caso) {
        e.preventDefault();
        if (!panel.destino) return;
        // TODO: conectar con la API de soporte para escalar el caso al área elegida.
        updateCaso(caso.id, { status: 'Escalado', escalatedTo: panel.destino, note: panel.note.trim() });
        setPanel(null);
        setNotice({ type: 'ok', text: `Caso ${caso.id} escalado a ${DESTINO_LABEL[panel.destino]}.` });
    }

    function resolve(caso) {
        // TODO: conectar con la API de soporte para cerrar el caso.
        updateCaso(caso.id, { status: 'Resuelto' });
        setNotice({ type: 'ok', text: `Caso ${caso.id} marcado como resuelto.` });
    }

    // Gestor de accesos: pide suspender o activar la cuenta. Lo decide el Auditor.
    function sendRequest(e, caso) {
        e.preventDefault();
        const reason = panel.reason.trim();
        if (!reason || !panel.kind) return;
        // TODO: POST /api/staff/change-requests con { type: panel.kind, caseId: caso.id, reason }
        updateCaso(caso.id, { request: { kind: panel.kind, reason, date: new Date().toLocaleDateString('es-PA') } });
        setPanel(null);
        setNotice({ type: 'ok', text: `Solicitud enviada al Auditor: ${REQUEST_LABEL[panel.kind].toLowerCase()} (caso ${caso.id}).` });
    }

    // Área receptora: avisa a Soporte que ya atendió el caso.
    function attend(e, caso) {
        e.preventDefault();
        // TODO: conectar con la API de soporte para marcar el caso como atendido por el área.
        updateCaso(caso.id, { status: 'Atendido', handledNote: panel.note.trim() });
        setPanel(null);
        setNotice({ type: 'ok', text: `Caso ${caso.id} marcado como atendido. Soporte podrá cerrarlo.` });
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-4 border-b-2 border-gray-100 pb-4">
                <Logo />
                <div>
                    <h1 className="text-3xl font-display text-brand-600">
                        {isSupport ? 'Soporte Técnico' : 'Casos escalados'}
                    </h1>
                    <p className="text-sm font-medium text-gray-500">
                        {isSupport && 'Atiende los reportes de los usuarios y escala lo que no te toca resolver.'}
                        {isAccessManager && 'Casos de acceso que Soporte te escaló. Puedes solicitar cambios de cuenta (los decide el Auditor) y avisar cuando termines.'}
                        {currentRole === 'content_manager' && 'Casos de contenido que Soporte te escaló. Avisa cuando termines.'}
                    </p>
                </div>
            </div>

            {isSupport && (
                <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-medium text-blue-800">
                    Solo ves los datos mínimos del caso (alias y mensaje). No tienes acceso a contraseñas, progreso, accesos, contenido ni auditoría.
                </p>
            )}

            {notice && (
                <p role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-center text-sm font-medium text-blue-700">
                    {notice.text}
                </p>
            )}

            <section className={CARD}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <Title>{isSupport ? 'Tickets y casos' : 'Casos recibidos'}</Title>
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                        {pendientes} {pendientes === 1 ? 'pendiente' : 'pendientes'}
                    </span>
                </div>

                {isSupport && (
                    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar casos">
                        {FILTROS.map((f) => {
                            const active = filtro === f.id;
                            const count = base.filter(f.test).length;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setFiltro(f.id)}
                                    className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                                        active ? 'bg-blue-600 text-white' : 'bg-blue-50 text-gray-500 hover:bg-blue-100'
                                    }`}
                                >
                                    {f.label} ({count})
                                </button>
                            );
                        })}
                    </div>
                )}

                {visibles.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
                        <p className="text-sm font-bold text-gray-500">
                            {isSupport ? 'No hay casos en esta vista.' : 'Soporte aún no te ha escalado casos.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {visibles.map((caso) => {
                            const open = panel && panel.id === caso.id ? panel : null;
                            const supportActions = isSupport && isPending(caso);
                            const supportClose = isSupport && caso.status === 'Atendido';
                            const receiverActions = isReceiver && caso.status === 'Escalado';
                            return (
                                <article key={caso.id} className="rounded-2xl border-2 border-blue-100 bg-blue-50/40 p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <span className="text-xs font-bold uppercase tracking-wide text-blue-600">
                                                {caso.id} · Alumno: {caso.alias} · {caso.date}
                                            </span>
                                            <h3 className="text-lg font-bold text-brand-600">{caso.category}</h3>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_CHIP[caso.status]}`}>
                                            {caso.status}
                                            {(caso.status === 'Escalado' || caso.status === 'Atendido') && isSupport && ` · ${DESTINO_LABEL[caso.escalatedTo]}`}
                                        </span>
                                    </div>

                                    <p className="mt-2 text-sm font-medium text-gray-700">"{caso.text}"</p>

                                    {caso.replies.map((r, i) => (
                                        <p key={i} className="mt-3 rounded-xl bg-white p-3 text-sm font-medium text-gray-600">
                                            <span className="mr-2 text-xs font-bold uppercase tracking-wide text-blue-600">Respuesta de Soporte · {r.date}</span>
                                            {r.text}
                                        </p>
                                    ))}

                                    {caso.note && (
                                        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                                            <span className="font-bold">Nota de Soporte: </span>{caso.note}
                                        </p>
                                    )}

                                    {caso.request && (
                                        <p className="mt-3 rounded-xl border border-blue-200 bg-white p-3 text-xs font-medium text-blue-800">
                                            <span className="font-bold">Solicitud enviada al Auditor: {REQUEST_LABEL[caso.request.kind]}</span>
                                            {' · '}{caso.request.date}{' · '}Motivo: {caso.request.reason}
                                        </p>
                                    )}

                                    {caso.handledNote && (
                                        <p className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-medium text-green-900">
                                            <span className="font-bold">Nota del área: </span>{caso.handledNote}
                                        </p>
                                    )}

                                    {/* Acciones de Soporte */}
                                    {supportActions && !open && (
                                        <div className="mt-5 flex flex-wrap items-center gap-3 border-t-2 border-blue-100/60 pt-4">
                                            <span className="mr-1 text-xs font-bold uppercase tracking-wide text-gray-400">Acciones:</span>
                                            <button type="button" onClick={() => openPanel(caso, 'reply')} className={BTN_SECONDARY}>
                                                Responder
                                            </button>
                                            <button type="button" onClick={() => openPanel(caso, 'escalate')} className={BTN_SECONDARY}>
                                                Escalar a...
                                            </button>
                                            <button type="button" onClick={() => resolve(caso)} className={BTN_PRIMARY}>
                                                Marcar resuelto
                                            </button>
                                        </div>
                                    )}

                                    {supportClose && (
                                        <div className="mt-5 flex flex-wrap items-center gap-3 border-t-2 border-blue-100/60 pt-4">
                                            <span className="mr-1 text-xs font-bold uppercase tracking-wide text-gray-400">El área ya lo atendió:</span>
                                            <button type="button" onClick={() => resolve(caso)} className={BTN_PRIMARY}>
                                                Marcar resuelto
                                            </button>
                                        </div>
                                    )}

                                    {/* Acciones del área que recibe el caso */}
                                    {receiverActions && !open && (
                                        <div className="mt-5 flex flex-wrap items-center gap-3 border-t-2 border-blue-100/60 pt-4">
                                            <span className="mr-1 text-xs font-bold uppercase tracking-wide text-gray-400">Acciones:</span>
                                            {isAccessManager && !caso.request && (
                                                <>
                                                    <button type="button" onClick={() => openPanel(caso, 'request', { kind: 'suspend' })} className={BTN_SECONDARY}>
                                                         Suspender
                                                    </button>
                                                    <button type="button" onClick={() => openPanel(caso, 'request', { kind: 'activate' })} className={BTN_SECONDARY}>
                                                         Activar
                                                    </button>
                                                </>
                                            )}
                                            <button type="button" onClick={() => openPanel(caso, 'attend')} className={BTN_PRIMARY}>
                                                Ya lo atendí
                                            </button>
                                        </div>
                                    )}

                                    {/* Formularios */}
                                    {open && open.mode === 'reply' && (
                                        <form onSubmit={(e) => sendReply(e, caso)} className="mt-5 space-y-3 border-t-2 border-blue-100/60 pt-4">
                                            <div>
                                                <label htmlFor={`reply-${caso.id}`} className={LABEL}>Respuesta para {caso.alias}</label>
                                                <textarea
                                                    id={`reply-${caso.id}`}
                                                    className={`${FIELD} min-h-[90px] resize-y`}
                                                    value={open.text}
                                                    onChange={(e) => setPanel({ ...open, text: e.target.value })}
                                                    placeholder="Escribe tu respuesta..."
                                                    maxLength={1000}
                                                    required
                                                />
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button type="submit" className={BTN_PRIMARY}>Enviar respuesta</button>
                                                <button type="button" onClick={() => setPanel(null)} className={BTN_SECONDARY}>Cancelar</button>
                                            </div>
                                        </form>
                                    )}

                                    {open && open.mode === 'escalate' && (
                                        <form onSubmit={(e) => escalate(e, caso)} className="mt-5 space-y-3 border-t-2 border-blue-100/60 pt-4">
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                <div>
                                                    <label htmlFor={`dest-${caso.id}`} className={LABEL}>Escalar a</label>
                                                    <select
                                                        id={`dest-${caso.id}`}
                                                        className={FIELD}
                                                        value={open.destino}
                                                        onChange={(e) => setPanel({ ...open, destino: e.target.value })}
                                                        required
                                                    >
                                                        <option value="">Selecciona un área</option>
                                                        {DESTINOS.map((d) => (
                                                            <option key={d.value} value={d.value}>{d.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label htmlFor={`note-${caso.id}`} className={LABEL}>Nota para el área (opcional)</label>
                                                    <input
                                                        id={`note-${caso.id}`}
                                                        className={FIELD}
                                                        value={open.note}
                                                        onChange={(e) => setPanel({ ...open, note: e.target.value })}
                                                        placeholder="Qué debe revisar"
                                                        maxLength={200}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button type="submit" className={BTN_PRIMARY} disabled={!open.destino}>Confirmar escalamiento</button>
                                                <button type="button" onClick={() => setPanel(null)} className={BTN_SECONDARY}>Cancelar</button>
                                            </div>
                                        </form>
                                    )}

                                    {open && open.mode === 'request' && (
                                        <form onSubmit={(e) => sendRequest(e, caso)} className="mt-5 space-y-3 border-t-2 border-blue-100/60 pt-4">
                                            <p className="text-sm font-bold text-brand-600">
                                                {REQUEST_LABEL[open.kind]}: {caso.alias}
                                            </p>
                                            <div>
                                                <label htmlFor={`reason-${caso.id}`} className={LABEL}>Motivo</label>
                                                <input
                                                    id={`reason-${caso.id}`}
                                                    className={FIELD}
                                                    value={open.reason}
                                                    onChange={(e) => setPanel({ ...open, reason: e.target.value })}
                                                    placeholder="Por qué se necesita este cambio"
                                                    maxLength={200}
                                                    required
                                                />
                                            </div>
                                            <p className="text-xs font-medium text-gray-500">
                                                Esto no cambia la cuenta: se envía como solicitud y la decide el Auditor.
                                            </p>
                                            <div className="flex flex-wrap gap-3">
                                                <button type="submit" className={BTN_PRIMARY} disabled={!open.reason.trim()}>Enviar solicitud</button>
                                                <button type="button" onClick={() => setPanel(null)} className={BTN_SECONDARY}>Cancelar</button>
                                            </div>
                                        </form>
                                    )}

                                    {open && open.mode === 'attend' && (
                                        <form onSubmit={(e) => attend(e, caso)} className="mt-5 space-y-3 border-t-2 border-blue-100/60 pt-4">
                                            <div>
                                                <label htmlFor={`attend-${caso.id}`} className={LABEL}>Nota para Soporte (opcional)</label>
                                                <input
                                                    id={`attend-${caso.id}`}
                                                    className={FIELD}
                                                    value={open.note}
                                                    onChange={(e) => setPanel({ ...open, note: e.target.value })}
                                                    placeholder="Qué se hizo"
                                                    maxLength={200}
                                                />
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button type="submit" className={BTN_PRIMARY}>Confirmar</button>
                                                <button type="button" onClick={() => setPanel(null)} className={BTN_SECONDARY}>Cancelar</button>
                                            </div>
                                        </form>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}