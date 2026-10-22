import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-6';

const MOCK_DRAFTS = [
    { 
        id: 101, title: 'Verbos en Pasado', module: 'Grammar', level: 'A1.2', status: 'En Revisión',
        question: 'Selecciona la traducción correcta para: "Yo comí una manzana".',
        answer: 'I ate an apple', hint: 'El pasado de "eat" es irregular.'
    },
    { 
        id: 102, title: 'Partes de la Casa', module: 'Vocabulary', level: 'A1.1', status: 'En Revisión',
        question: '¿Cómo se escribe "Ventana" en inglés?',
        answer: 'Window', hint: 'Empieza con la letra W.'
    }
];

export default function ContentReview() {
    const { currentRole } = useOutletContext();
    const [drafts, setDrafts] = useState(MOCK_DRAFTS);
    
    if (currentRole !== 'content_reviewer') {
        return <div className="p-8 text-center text-red-500 font-bold">Acceso restringido: Solo para el Revisor de Contenido.</div>;
    }

    function handleDecision(id, decision) {
        setDrafts(prev => prev.filter(d => d.id !== id));
        alert(`Borrador ${id} ${decision} exitosamente.`);
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-3xl font-display text-brand-600">Aprobación de Contenidos</h1>
                <p className="text-sm font-medium text-gray-500">Estación de Calidad: Revisa pedagógicamente las propuestas y decide si se publican en el juego.</p>
            </div>

            <section className={CARD}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-800">Bandeja de Aprobación Pedagógica</h2>
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold">{drafts.length} Por Revisar</span>
                </div>
                
                {drafts.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                        <p className="font-bold text-gray-400">Excelente. Tu bandeja de revisión está limpia.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {drafts.map(draft => (
                            <div key={draft.id} className="flex flex-col rounded-2xl border-2 border-amber-100 bg-white p-5 shadow-sm hover:border-brand-300 transition-colors">
                                <div className="mb-2">
                                    <p className="font-bold text-brand-700 text-lg">{draft.title}</p>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{draft.module} - Nivel: {draft.level}</p>
                                </div>

                                <div className="my-4 space-y-3 rounded-xl bg-gray-50 p-4 border border-gray-100 flex-1">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Pregunta del Gestor</p>
                                        <p className="text-sm font-medium text-gray-700 italic">"{draft.question}"</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase text-brand-600 mb-1">Respuesta Esperada</p>
                                            <p className="text-sm font-bold text-gray-800">{draft.answer}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase text-amber-500 mb-1">Pista Interna</p>
                                            <p className="text-sm font-medium text-gray-800">{draft.hint}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex gap-3 pt-3 border-t-2 border-gray-50 mt-auto">
                                    <button onClick={() => handleDecision(draft.id, 'rechazado')} className="flex-1 rounded-xl border-2 border-red-100 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Rechazar</button>
                                    <button onClick={() => handleDecision(draft.id, 'publicado en vivo')} className="flex-1 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-600 transition-all hover:-translate-y-0.5">Aprobar y Publicar</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}