import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const CARD = 'bg-white rounded-[1.75rem] shadow-sm border-2 border-gray-100 p-6';
const BTN_PRIMARY = 'rounded-xl bg-brand-600 px-4 py-2.5 font-bold text-white shadow-sm transition-all hover:bg-brand-700';
const FIELD = 'w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-brand-500 focus:bg-white transition-colors';

const CUENTAS_INICIALES = [
    { id: 1, name: 'María Gómez', email: 'maria.gomez@escuela.edu.pa', role: 'Docente', status: 'Activa' },
    { id: 2, name: 'Carlos Pérez', email: 'carlos.perez@escuela.edu.pa', role: 'Docente', status: 'Activa' },
    { id: 3, name: 'Ana Rodríguez', email: 'ana.rodriguez@escuela.edu.pa', role: 'Docente', status: 'Suspendida' },
];

export default function IdentityAccess() {
    const { currentRole } = useOutletContext();
    const [cuentas, setCuentas] = useState(CUENTAS_INICIALES);
    const [emailTemp, setEmailTemp] = useState('');

    const isManager = currentRole === 'access_manager';
    const isAuditor = currentRole === 'auditor';

    function handleCrearCuenta(e) {
        e.preventDefault();
        if (!emailTemp) return;
        setCuentas(prev => [...prev, { id: Date.now(), name: emailTemp.split('@')[0], email: emailTemp, role: 'Docente', status: 'Activa' }]);
        alert(`Cuenta creada para ${emailTemp} con contraseña temporal.`);
        setEmailTemp('');
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="border-b-2 border-gray-100 pb-4">
                <h1 className="text-3xl font-display text-brand-600">Identidad y Acceso</h1>
                <p className="text-sm font-medium text-gray-500">
                    {isManager && 'Gestión de cuentas del personal y control de accesos.'}
                    {isAuditor && 'Modo Auditor: consulta las cuentas del personal.'}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                
                {/* Formulario de Creación (SOLO PARA GESTOR) */}
                {isManager && (
                    <section className={`${CARD} xl:col-span-4 h-fit`}>
                        <h2 className="mb-4 text-lg font-bold text-gray-800">Crear Cuenta de Docente</h2>
                        <form onSubmit={handleCrearCuenta} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Correo Institucional</label>
                                <input 
                                    type="email" 
                                    className={FIELD} 
                                    placeholder="docente@escuela.edu.pa" 
                                    value={emailTemp}
                                    onChange={(e) => setEmailTemp(e.target.value)}
                                    required 
                                />
                            </div>
                            <button type="submit" className={`${BTN_PRIMARY} w-full`}>Generar Contraseña Temporal</button>
                        </form>
                    </section>
                )}

                {/* Directorio de Cuentas (Gestor y Auditor lo ven, pero el auditor NO ve botones ni historial) */}
                <section className={`${CARD} ${isManager ? 'xl:col-span-8' : 'xl:col-span-12'}`}>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-brand-700 border-b-2 border-brand-500 pb-1">Directorio de cuentas del personal</h2>
                        <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-800">{cuentas.length}</span>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="px-4 py-3">Nombre / Usuario</th>
                                    <th className="px-4 py-3 text-center">Rol</th>
                                    <th className="px-4 py-3 text-center">Estado</th>
                                    {isManager && <th className="px-4 py-3 text-right">Acciones</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {cuentas.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-gray-800">{user.name}</p>
                                            <p className="text-xs text-gray-400">{user.email}</p>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">{user.role}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {user.status === 'Activa' ? (
                                                <span className="bg-cyan-100 text-cyan-800 px-3 py-1 rounded-full text-xs font-bold">Activa</span>
                                            ) : (
                                                <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-xs font-bold">Suspendida</span>
                                            )}
                                        </td>
                                        
                                        {/* Botones SOLO para el Gestor */}
                                        {isManager && (
                                            <td className="px-4 py-3 text-right space-x-3">
                                                <button onClick={() => alert(`Reset MFA para ${user.name}`)} className="text-xs font-bold text-amber-600 hover:text-amber-800">Reset MFA</button>
                                                {user.status === 'Activa' ? (
                                                    <button onClick={() => alert(`Solicitar suspensión para ${user.name}`)} className="text-xs font-bold text-red-600 hover:text-red-800">Solicitar Suspensión</button>
                                                ) : (
                                                    <button onClick={() => alert(`Solicitar activación para ${user.name}`)} className="text-xs font-bold text-green-600 hover:text-green-800">Solicitar Activación</button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}