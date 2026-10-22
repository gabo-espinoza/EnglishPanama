import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-6';
const BTN_PRIMARY = 'rounded-xl bg-brand-600 px-4 py-2.5 font-bold text-white transition-all hover:bg-brand-700 shadow-sm hover:-translate-y-0.5';
const FIELD = 'w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-brand-500 focus:bg-white transition-colors';

const MOCK_DRAFTS = [
    { 
        id: 101, title: 'Verbos en Pasado', module: 'Grammar', level: 'A1.2', status: 'En Revisión',
        question: 'Selecciona la traducción correcta para: "Yo comí una manzana".'
    },
];

const MOCK_PUBLISHED = [
    { id: 201, title: 'Colores Básicos', module: 'Vocabulary', level: 'A1 (Básico)', type: 'Opción Múltiple', uses: 1450, question: '¿Cómo se dice "Rojo" en inglés?' },
    { id: 202, title: 'Presente Simple', module: 'Grammar', level: 'A2 (Pre-Intermedio)', type: 'Completar Espacio', uses: 2100, question: 'She ___ (play) tennis every Sunday.' },
];

export default function ContentManagement() {
    const { currentRole } = useOutletContext();
    const [activeTab, setActiveTab] = useState('Vocabulary');
    
    const [formData, setFormData] = useState({
        level: 'A1 (Básico)',
        lesson: '',
        type: 'Opción Múltiple',
        question: '',
        answer: '',
        hint: ''
    });
    const [isEditing, setIsEditing] = useState(false);
    
    const isAnalyst = currentRole === 'analyst';
    const isManager = currentRole === 'content_manager';

    const creatorTabs = ['Vocabulary', 'Grammar', 'Reading', 'Catálogo Publicado'];

    function handleEdit(item) {
        setActiveTab(item.module);
        setFormData({
            level: item.level,
            lesson: '1', 
            type: item.type,
            question: item.question,
            answer: item.answer || '',
            hint: item.hint || ''
        });
        setIsEditing(true);
    }

    function handleResetForm() {
        setFormData({ level: 'A1 (Básico)', lesson: '', type: 'Opción Múltiple', question: '', answer: '', hint: '' });
        setIsEditing(false);
    }

    // Protección de ruta adicional
    if (!isManager && !isAnalyst) {
        return <div className="p-8 text-center text-red-500 font-bold">Acceso restringido: Solo para Gestores o Analistas.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-3xl font-display text-brand-600">Gestión de Contenidos</h1>
                <p className="text-sm font-medium text-gray-500">
                    {isManager && 'Estudio de Creación: Diseña misiones y administra el catálogo en vivo.'}
                    {isAnalyst && 'Modo Analista: Vista de solo lectura de la producción de contenido.'}
                </p>
            </div>

            {isManager && (
                <div className="flex flex-wrap gap-2 p-1 bg-gray-100 rounded-2xl w-fit">
                    {creatorTabs.map(tab => (
                        <button
                            key={tab}
                            onClick={() => {
                                setActiveTab(tab);
                                if (tab === 'Catálogo Publicado') handleResetForm();
                            }}
                            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                                activeTab === tab 
                                    ? 'bg-white text-brand-700 shadow-sm' 
                                    : 'text-gray-500 hover:text-brand-600'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                
                {/* CATÁLOGO PUBLICADO */}
                {isManager && activeTab === 'Catálogo Publicado' && (
                    <section className={`${CARD} lg:col-span-12 border-t-4 border-t-blue-500`}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-gray-800">Contenido en Vivo (Clases Activas)</h2>
                                <p className="text-xs text-gray-500">Administra las lecciones que los estudiantes están jugando actualmente.</p>
                            </div>
                            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">{MOCK_PUBLISHED.length} Lecciones Activas</span>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Título de la Lección</th>
                                        <th className="px-4 py-3">Módulo</th>
                                        <th className="px-4 py-3 text-center">Nivel</th>
                                        <th className="px-4 py-3 text-center">Interacciones</th>
                                        <th className="px-4 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {MOCK_PUBLISHED.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-bold text-brand-700">{item.title}</td>
                                            <td className="px-4 py-3 font-medium text-gray-600">{item.module}</td>
                                            <td className="px-4 py-3 text-center"><span className="bg-gray-100 px-2 py-1 rounded font-bold text-gray-700">{item.level.split(' ')[0]}</span></td>
                                            <td className="px-4 py-3 text-center font-bold text-green-600">{item.uses}</td>
                                            <td className="px-4 py-3 text-right space-x-3">
                                                <button onClick={() => handleEdit(item)} className="text-xs font-bold text-blue-600 hover:text-blue-800">Editar</button>
                                                <button onClick={() => alert('Solicitud enviada al Revisor.')} className="text-xs font-bold text-red-600 hover:text-red-800">Ocultar</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* FORMULARIO DE CREACIÓN / EDICIÓN */}
                {isManager && activeTab !== 'Catálogo Publicado' && (
                    <section className={`${CARD} lg:col-span-7 h-fit border-t-4 ${isEditing ? 'border-t-amber-500' : 'border-t-brand-500'}`}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-800">
                                {isEditing ? 'Editando Actividad Existente:' : 'Redactar Nueva Actividad:'} <span className="text-brand-600">{activeTab}</span>
                            </h2>
                            {isEditing && (
                                <button onClick={handleResetForm} className="text-xs font-bold text-gray-500 hover:text-red-500">Cancelar Edición</button>
                            )}
                        </div>
                        
                        <form className="space-y-5" onSubmit={(e) => { 
                            e.preventDefault(); 
                            alert(isEditing ? 'Cambios enviados a la bandeja del Revisor.' : 'Nuevo borrador enviado a revisión.'); 
                            handleResetForm();
                        }}>
                            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-2xl border-2 border-gray-100">
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-gray-500 uppercase">Nivel</label>
                                    <select className={FIELD} value={formData.level} onChange={(e) => setFormData({...formData, level: e.target.value})}>
                                        <option>A1 (Básico)</option>
                                        <option>A2 (Pre-Intermedio)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-gray-500 uppercase">Lección</label>
                                    <input type="number" className={FIELD} placeholder="Ej. 1" min="1" value={formData.lesson} onChange={(e) => setFormData({...formData, lesson: e.target.value})} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-gray-500 uppercase">Tipo</label>
                                    <select className={FIELD} value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}>
                                        <option>Opción Múltiple</option>
                                        <option>Completar Espacio</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Pregunta / Prompt</label>
                                <textarea className={`${FIELD} min-h-[120px]`} required value={formData.question} onChange={(e) => setFormData({...formData, question: e.target.value})} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase text-brand-600">Respuesta Esperada (Sistema)</label>
                                    <input type="text" className={`${FIELD} border-brand-200 bg-brand-50`} required value={formData.answer} onChange={(e) => setFormData({...formData, answer: e.target.value})} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase text-amber-500">Pista Interna</label>
                                    <input type="text" className={`${FIELD} border-amber-200 bg-amber-50`} value={formData.hint} onChange={(e) => setFormData({...formData, hint: e.target.value})} />
                                </div>
                            </div>

                            <button type="submit" className={`${isEditing ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-600 hover:bg-brand-700'} w-full rounded-xl px-4 py-3 text-lg font-bold text-white shadow-sm transition-all hover:-translate-y-0.5`}>
                                {isEditing ? 'Solicitar Actualización de Contenido' : 'Enviar Borrador a Revisión'}
                            </button>
                        </form>
                    </section>
                )}

                {/* VISTA DEL ANALISTA */}
                {isAnalyst && (
                    <section className={`${CARD} lg:col-span-7 bg-blue-50 border-blue-100`}>
                        <h2 className="mb-4 text-lg font-bold text-blue-800">Métricas de Producción</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between p-4 bg-white rounded-xl border-2 border-blue-100 shadow-sm">
                                <span className="font-bold text-gray-600">Lecciones Publicadas (Catálogo)</span>
                                <span className="font-black text-brand-600 text-xl">{MOCK_PUBLISHED.length}</span>
                            </div>
                        </div>
                    </section>
                )}

                {/* BANDEJA LATERAL */}
                <section className={`${CARD} lg:col-span-5 bg-gray-50 border-dashed`}>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-gray-800">
                            {isAnalyst ? 'Contenido en Cola' : 'Mis Borradores Pendientes'}
                        </h2>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                        {MOCK_DRAFTS.map(draft => (
                            <div key={draft.id} className="flex flex-col rounded-2xl border-2 border-amber-100 bg-white p-5 shadow-sm hover:border-brand-300 transition-colors">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-bold text-brand-700 text-lg">{draft.title}</p>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{draft.module} - Nivel: {draft.level}</p>
                                    </div>
                                    <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-bold">{draft.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}