import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-6';

// Simulamos reportes reales con el contenido del mensaje para que el moderador pueda juzgar
const MOCK_REPORTS = [
    { 
        id: 'REP-001', 
        alias: 'NinjaStar', 
        category: 'Spam', 
        content: 'Entra a mi canal para ganar XP gratis y trucos para los exámenes www.scam-link.com', 
        date: 'Hace 2 horas' 
    },
    { 
        id: 'REP-002', 
        alias: 'ToxicGamer99', 
        category: 'Ofensa', 
        content: 'Eres un completo inútil, desinstala la aplicación pedazo de tonto.', 
        date: 'Hace 5 horas' 
    },
];

export default function Moderation() {
    const { currentRole } = useOutletContext();
    const [reportes, setReportes] = useState(MOCK_REPORTS);

    if (currentRole !== 'moderator') {
        return <div className="p-8 text-center text-red-500 font-bold">Acceso restringido: Solo para Moderadores de Comunidad.</div>;
    }

    function handleAction(id, action) {
        setReportes(prev => prev.filter(r => r.id !== id));
        alert(`Reporte ${id}: ${action}`);
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-3xl font-display text-brand-600">Moderación de Comunidad</h1>
                <p className="text-sm font-medium text-gray-500">Revisa reportes de ofensas, borra spam y restringe la participación comunitaria.</p>
            </div>

            <section className={CARD}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-800">Reportes de Conducta Activos</h2>
                    <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">{reportes.length} Pendientes</span>
                </div>
                
                {reportes.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                        <p className="font-bold text-gray-400">La comunidad está tranquila. No hay reportes pendientes.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {reportes.map(reporte => (
                            <div key={reporte.id} className="flex flex-col rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm">
                                <div className="flex justify-between items-start mb-4 border-b-2 border-gray-50 pb-3">
                                    <div>
                                        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Reporte {reporte.id} • {reporte.date}</span>
                                        <p className="font-bold text-brand-700 text-lg">Involucrado: {reporte.alias}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                                        reporte.category === 'Spam' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                        Motivo: {reporte.category}
                                    </span>
                                </div>

                                {/* CONTEXTO DEL REPORTE: El moderador necesita leer esto para trabajar */}
                                <div className="mb-4 rounded-xl bg-gray-50 p-4 border border-gray-100">
                                    <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Mensaje Reportado</p>
                                    <p className="text-sm font-medium text-gray-800 italic">"{reporte.content}"</p>
                                </div>
                                
                                {/* BOTONES DE ACCIÓN BASADOS EN LA MATRIZ */}
                                <div className="flex flex-wrap gap-3 mt-auto">
                                    <button 
                                        onClick={() => handleAction(reporte.id, 'Falsa alarma. Reporte desestimado.')} 
                                        className="rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                                    >
                                        Desestimar (Falsa Alarma)
                                    </button>

                                    <div className="flex-1 flex gap-2 justify-end">
                                        <button 
                                            onClick={() => handleAction(reporte.id, 'Mensaje borrado y usuario silenciado por 24h.')} 
                                            className="rounded-xl bg-amber-100 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-200 transition-colors"
                                        >
                                            Borrar Mensaje + Silenciar (24h)
                                        </button>
                                        
                                        <button 
                                            onClick={() => handleAction(reporte.id, 'Caso escalado al Gestor de Accesos para suspensión de cuenta.')} 
                                            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700 transition-all hover:-translate-y-0.5"
                                        >
                                            Escalar para Suspensión
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}