import { useEffect, useState } from 'react';
import { useStaff } from '../../components/StaffRoute';
import { ROLE_LABELS } from './StaffLayout';
import { analyticsDashboard } from '../../api/staff';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-4 sm:p-6';
const STAT = 'rounded-[1.75rem] shadow-sm border-2 p-4 sm:p-6 text-center';
const BTN_SECONDARY = 'rounded-xl border-2 border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50';

// Campos que devuelve GET /api/staff/analytics/dashboard (staffAnalytics.service.js).
const TONES = {
    blue: { box: 'border-blue-100 bg-blue-100', label: 'text-blue-500' },
    emerald: { box: 'border-emerald-100 bg-emerald-50', label: 'text-emerald-600' },
    purple: { box: 'border-purple-100 bg-purple-50', label: 'text-purple-500' },
    amber: { box: 'border-amber-100 bg-amber-50', label: 'text-amber-600' }
};

const METRICS = [
    { key: 'students', label: 'Estudiantes registrados', tone: 'blue' },
    { key: 'teachers', label: 'Docentes registrados', tone: 'emerald' },
    { key: 'activities', label: 'Actividades', tone: 'purple' },
    { key: 'questions', label: 'Preguntas', tone: 'amber' },
    { key: 'attempts', label: 'Intentos realizados', tone: 'blue' },
    { key: 'dailyCompletions', label: 'Retos diarios completados', tone: 'emerald' }
];

const numberFormat = new Intl.NumberFormat('es-PA');

function formatCount(value) {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    return Number.isFinite(n) ? numberFormat.format(n) : '—';
}

export default function Analytics() {
    const { token, handleAuthError } = useStaff();
    const [data, setData] = useState(null);
    const [state, setState] = useState('loading'); // loading | ok | error
    const [error, setError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;
        setState('loading');
        analyticsDashboard(token)
            .then((result) => {
                if (!active) return;
                setData(result);
                setState('ok');
            })
            .catch((err) => {
                if (!active) return;
                if (handleAuthError(err)) return;
                setError(err.status === 403 ? 'No tienes permiso para esta acción, o tu cuenta de gestión no está activa.' : err.message);
                setState('error');
            });
        return () => {
            active = false;
        };
    }, [token, reloadKey, handleAuthError]);

    const staffByRole = data && Array.isArray(data.staffByRole) ? data.staffByRole : [];

    return (
        <div className="animate-fade-in space-y-6 pb-10">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-2xl font-display text-brand-600 sm:text-3xl">Datos y reportes</h1>
                <p className="text-sm font-medium text-gray-500">
                    Totales agregados y anónimos de la plataforma. No incluyen nombres ni datos personales.
                </p>
            </div>

            {state === 'loading' && (
                <p role="status" className="py-8 text-center text-sm text-gray-500">Cargando métricas...</p>
            )}

            {state === 'error' && (
                <div role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center">
                    <p className="mb-3 text-sm font-bold text-red-700">{error}</p>
                    <button type="button" onClick={() => setReloadKey((n) => n + 1)} className={BTN_SECONDARY}>Reintentar</button>
                </div>
            )}

            {state === 'ok' && data && (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {METRICS.map((metric) => (
                            <div key={metric.key} className={`${STAT} ${TONES[metric.tone].box}`}>
                                <p className={`text-xs font-bold uppercase ${TONES[metric.tone].label}`}>{metric.label}</p>
                                <p className="mt-2 text-4xl font-black text-gray-800">{formatCount(data[metric.key])}</p>
                            </div>
                        ))}
                    </div>

                    <section className={CARD} aria-labelledby="personal-por-rol">
                        <h2 id="personal-por-rol" className="mb-4 text-lg font-bold text-gray-800">Cuentas de personal por rol</h2>
                        {staffByRole.length === 0 ? (
                            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                                <p className="font-bold text-gray-400">No hay cuentas de personal registradas.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
                                <table className="w-full whitespace-nowrap text-left text-sm">
                                    <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                        <tr>
                                            <th scope="col" className="px-4 py-3">Rol</th>
                                            <th scope="col" className="px-4 py-3 text-right">Cuentas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {staffByRole.map((row) => (
                                            <tr key={row.role} className="transition-colors hover:bg-gray-50">
                                                <td className="px-4 py-3 font-bold text-gray-800">{ROLE_LABELS[row.role] || row.role}</td>
                                                <td className="px-4 py-3 text-right font-bold text-brand-600">{numberFormat.format(Number(row.total) || 0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
