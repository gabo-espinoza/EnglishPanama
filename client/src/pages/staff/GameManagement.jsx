import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-6';

// Datos de prueba para simular la base de datos de los rankings
const MOCK_RANKINGS = {
    'CLASS-A1': [
        { rank: 1, alias: 'ShadowNinja', level: 5, xp: 2450 },
        { rank: 2, alias: 'LunaBlue', level: 4, xp: 1980 },
        { rank: 3, alias: 'GamerKid', level: 4, xp: 1850 }
    ],
    'CLASS-B2': [
        { rank: 1, alias: 'StarGirl', level: 6, xp: 3100 },
        { rank: 2, alias: 'PixelPro', level: 5, xp: 2200 }
    ]
};

export default function GameManagement() {
    const { currentRole } = useOutletContext();
    const [selectedClass, setSelectedClass] = useState('CLASS-A1');
    
    if (currentRole !== 'game_manager') {
        return <div className="p-8 text-center text-red-500 font-bold">Acceso restringido: Solo para el Gestor de Juego.</div>;
    }

    const currentRanking = MOCK_RANKINGS[selectedClass] || [];

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-3xl font-display text-brand-600">Gestión del Juego y Ranking</h1>
                <p className="text-sm font-medium text-gray-500">Configura la economía, modera alias y supervisa las tablas de clasificación.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                
                {/* 1. Supervisión de Rankings por Clase (Nueva Sección) */}
                <section className={`${CARD} lg:col-span-2`}>
                    <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Supervisión de Rankings (Modo Anónimo)</h2>
                            <p className="text-xs text-gray-500">Monitorea la competitividad sin comprometer la privacidad de los alumnos.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-bold text-gray-700">Seleccionar Clase:</label>
                            <select 
                                className="rounded-xl border-2 border-brand-200 bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 outline-none focus:border-brand-500 cursor-pointer"
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                            >
                                <option value="CLASS-A1">Código: CLASS-A1 (Turno Mañana)</option>
                                <option value="CLASS-B2">Código: CLASS-B2 (Turno Tarde)</option>
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 text-center w-16">Posición</th>
                                    <th className="px-4 py-3">Alias del Jugador</th>
                                    <th className="px-4 py-3 text-center">Nivel</th>
                                    <th className="px-4 py-3 text-right">Experiencia (XP)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {currentRanking.map((student) => (
                                    <tr key={student.alias} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-center font-black text-amber-500">#{student.rank}</td>
                                        <td className="px-4 py-3 font-bold text-brand-600">{student.alias}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">Lvl. {student.level}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-black text-gray-700">{student.xp} XP</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* 2. Catálogo de Alias */}
                <section className={CARD}>
                    <h2 className="mb-4 text-lg font-bold text-gray-800">Catálogo de Alias</h2>
                    <p className="text-xs text-gray-500 mb-4">Oculta alias que contengan PII o palabras inapropiadas.</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        <div className="flex justify-between items-center rounded-xl bg-gray-50 p-3 border-2 border-gray-100">
                            <span className="font-bold text-brand-700">JuanPerez2015</span>
                            <button className="rounded bg-red-100 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-200">Ocultar</button>
                        </div>
                        <div className="flex justify-between items-center rounded-xl bg-gray-50 p-3 border-2 border-gray-100">
                            <span className="font-bold text-brand-700">GamerKid</span>
                            <button className="rounded bg-gray-200 px-3 py-1 text-xs font-bold text-gray-500" disabled>Aprobado</button>
                        </div>
                    </div>
                </section>

                {/* 3. Retos Diarios */}
                <section className={CARD}>
                    <h2 className="mb-4 text-lg font-bold text-gray-800">Retos Diarios</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase text-gray-400">Reto Actual</label>
                            <input type="text" className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" defaultValue="Completa 2 lecciones perfectas" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase text-gray-400">Recompensa (XP)</label>
                            <input type="number" className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white" defaultValue="50" />
                        </div>
                        <button className="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white w-full hover:bg-brand-700">Actualizar Reto</button>
                    </div>
                </section>

                {/* 4. Reglas de Puntos */}
                <section className={`${CARD} lg:col-span-2`}>
                    <h2 className="mb-4 text-lg font-bold text-gray-800">Economía y Umbrales de Nivel</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4 rounded-xl border-2 border-blue-100 bg-blue-50 p-4">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-blue-700">XP por respuesta correcta</label>
                                <input type="number" className="w-full rounded-lg border-2 border-blue-200 px-3 py-2 text-sm outline-none" defaultValue="10" />
                            </div>
                        </div>
                        <div className="space-y-4 rounded-xl border-2 border-amber-100 bg-amber-50 p-4">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-amber-700">XP requerida para Nivel 2</label>
                                <input type="number" className="w-full rounded-lg border-2 border-amber-200 px-3 py-2 text-sm outline-none" defaultValue="500" />
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}