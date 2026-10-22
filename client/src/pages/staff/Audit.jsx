import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-6';

const MOCK_SOLICITUDES = [
    { id: 'REQ-001', type: 'Suspensión de Cuenta', target: 'prof_marta', requestedBy: 'admin_gabo', date: '21/10/2026' },
    { id: 'REQ-002', type: 'Reset de MFA', target: 'teacher_luis', requestedBy: 'admin_gabo', date: '21/10/2026' }
];

const MOCK_LOGS = [
    '[2026-10-21 14:02:11] SYSTEM: access_manager (ID:1) creó cuenta docente temporal.',
    '[2026-10-21 15:45:00] SYSTEM: content_manager (ID:2) envió actividad a revisión.',
    '[2026-10-21 16:10:22] SECURITY ALERT: Intento de acceso sin MFA bloqueado para admin_gabo.',
    '[2026-10-21 16:15:05] SYSTEM: auditor_ext (ID:3) inició sesión correctamente.'
];

export default function Audit() {
    const { currentRole } = useOutletContext();
    const [solicitudes, setSolicitudes] = useState(MOCK_SOLICITUDES);
    const [verificando, setVerificando] = useState(false);
    const [integridad, setIntegridad] = useState(null);

    // Protección de ruta
    if (currentRole !== 'auditor') {
        return <div className="p-8 text-center text-red-500 font-bold">Acceso restringido: Solo para el rol de Auditor.</div>;
    }

    function handleDecision(id, decision) {
        // Filtramos la solicitud para quitarla de la lista (simulando que ya se atendió)
        setSolicitudes(prev => prev.filter(req => req.id !== id));
        alert(`Solicitud ${id} ${decision} exitosamente.`);
    }

    function handleVerificar() {
        setVerificando(true);
        setIntegridad(null);
        // Simulamos el tiempo de respuesta del servidor (GET /api/staff/audit/verify)
        setTimeout(() => {
            setVerificando(false);
            setIntegridad('La cadena de bloques de auditoría está intacta. Criptografía verificada.');
        }, 1500);
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-3xl font-display text-brand-600">Auditoría y Cumplimiento</h1>
                <p className="text-sm font-medium text-gray-500">Supervisa los registros inmutables del sistema y aprueba solicitudes de cambio.</p>
            </div>

            {/* SECCIÓN 1: Aprobación de Solicitudes */}
            <section className={CARD}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-800">Bandeja de Autorizaciones</h2>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                        {solicitudes.length} Pendientes
                    </span>
                </div>
                
                {solicitudes.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                        <p className="font-bold text-gray-400">No hay solicitudes de cambio pendientes.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {solicitudes.map((req) => (
                            <div key={req.id} className="flex flex-wrap justify-between items-center gap-4 rounded-xl border-2 border-amber-100 bg-amber-50 p-4 transition-all">
                                <div>
                                    <span className="text-xs font-bold uppercase tracking-wide text-amber-600">{req.id} • {req.type}</span>
                                    <p className="font-bold text-gray-800 text-lg">Cuenta objetivo: {req.target}</p>
                                    <p className="text-xs font-medium text-gray-500">Solicitado por {req.requestedBy} el {req.date}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleDecision(req.id, 'RECHAZADA')}
                                        className="rounded-xl bg-red-100 px-5 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-200"
                                    >
                                        Rechazar
                                    </button>
                                    <button 
                                        onClick={() => handleDecision(req.id, 'APROBADA')}
                                        className="rounded-xl bg-green-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_0_#166534] transition-all hover:-translate-y-0.5 hover:bg-green-600 hover:shadow-[0_4px_0_0_#14532d]"
                                    >
                                        Aprobar y Ejecutar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* SECCIÓN 2: Registro de Auditoría y Verificación */}
            <section className={CARD}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-800">Registro de Auditoría (Solo Lectura)</h2>
                    <button 
                        onClick={handleVerificar}
                        disabled={verificando}
                        className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                    >
                        {verificando ? 'Verificando firmas...' : 'Verificar Integridad'}
                    </button>
                </div>

                {integridad && (
                    <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm font-bold text-green-700 border-2 border-green-200">
                        {integridad}
                    </div>
                )}

                <div className="rounded-xl bg-slate-900 p-5 font-mono text-sm leading-relaxed text-green-400 overflow-y-auto h-56 shadow-inner">
                    {MOCK_LOGS.map((log, i) => (
                        <p key={i} className={log.includes('SECURITY ALERT') ? 'text-red-400 font-bold' : ''}>
                            {log}
                        </p>
                    ))}
                    <span className="animate-pulse">_</span>
                </div>
            </section>
        </div>
    );
}
