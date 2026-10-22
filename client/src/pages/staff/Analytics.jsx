import { useOutletContext } from 'react-router-dom';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-6';

export default function Analytics() {
    const { currentRole } = useOutletContext();

    if (currentRole !== 'analyst') {
        return <div className="p-8 text-center text-red-500 font-bold">Acceso restringido: Solo para Analistas de Datos.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="border-b-2 border-gray-100 pb-4 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-display text-brand-600">Datos y Reportes Globales</h1>
                    <p className="text-sm font-medium text-gray-500">Métricas anónimas de uso, rendimiento de juego y contenido.</p>
                </div>
                <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition-colors">
                    Exportar CSV (GET /api/staff/analytics)
                </button>
            </div>

            {/* Tarjetas de Métricas Principales */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className={`${CARD} text-center bg-blue-50 border-blue-100`}>
                    <p className="text-xs font-bold text-blue-500 uppercase">Usuarios Activos Hoy</p>
                    <p className="text-4xl font-black text-brand-700 mt-2">1,204</p>
                </div>
                <div className={`${CARD} text-center bg-green-50 border-green-100`}>
                    <p className="text-xs font-bold text-green-600 uppercase">Precisión Promedio (Juego)</p>
                    <p className="text-4xl font-black text-green-700 mt-2">82%</p>
                </div>
                <div className={`${CARD} text-center bg-purple-50 border-purple-100`}>
                    <p className="text-xs font-bold text-purple-500 uppercase">Misiones Completadas</p>
                    <p className="text-4xl font-black text-purple-700 mt-2">45.8K</p>
                </div>
                <div className={`${CARD} text-center bg-amber-50 border-amber-100`}>
                    <p className="text-xs font-bold text-amber-600 uppercase">Tiempo Promedio (App)</p>
                    <p className="text-4xl font-black text-amber-700 mt-2">24m</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Desglose de Contenido (Como exige el documento) */}
                <section className={CARD}>
                    <h2 className="mb-4 text-lg font-bold text-gray-800">Métricas Agregadas por Módulo</h2>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-sm font-bold mb-1">
                                <span className="text-gray-600">Vocabulary (Nivel A1)</span>
                                <span className="text-brand-600">78% Aprobación</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500 w-[78%] rounded-full"></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm font-bold mb-1">
                                <span className="text-gray-600">Grammar (Nivel A2)</span>
                                <span className="text-blue-500">65% Aprobación</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 w-[65%] rounded-full"></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm font-bold mb-1">
                                <span className="text-gray-600">Reading (Nivel B1)</span>
                                <span className="text-purple-500">42% Aprobación</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500 w-[42%] rounded-full"></div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className={`${CARD} flex flex-col items-center justify-center border-dashed border-gray-200 bg-gray-50 min-h-[250px]`}>
                    <span className="text-4xl mb-2"></span>
                    <p className="text-gray-400 font-bold text-sm text-center px-4">
                        Área reservada para inyectar gráfica interactiva (Chart.js / Recharts) conectada al endpoint de retención de jugadores.
                    </p>
                </section>
            </div>
        </div>
    );
}