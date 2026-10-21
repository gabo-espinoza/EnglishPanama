import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { declareGrade, getClass, getStudents } from '../../api/teacher';
import { clearSession, getSession } from '../../api/session';
import TopBar from '../../components/TopBar';

const CARD = 'bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8';

function gradeLabel(grade, level) {
    return `${grade}.º grado · ${level}`;
}

// Promedio en porcentaje; sin intentos en el módulo llega null y se muestra "—".
function formatAverage(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '—';
}

// Panel docente: código de la clase y declaración del grado (una sola vez).
export default function TeacherHome() {
    const navigate = useNavigate();
    const [classData, setClassData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [selected, setSelected] = useState(null);
    const [understood, setUnderstood] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [students, setStudents] = useState(null);
    const [studentsLoading, setStudentsLoading] = useState(true);
    const [studentsError, setStudentsError] = useState('');

    function toLogin() {
        clearSession();
        navigate('/login', { replace: true });
    }

    // Carga idempotente: si StrictMode ejecuta el efecto dos veces, solo cuenta la última respuesta.
    useEffect(() => {
        let active = true;
        const session = getSession();
        if (!session) {
            toLogin();
            return undefined;
        }
        getClass(session.token)
            .then((data) => {
                if (active) setClassData(data);
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 401) toLogin();
                else setLoadError(err.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lista de estudiantes: carga independiente de la clase, con su propio estado de carga y error.
    useEffect(() => {
        let active = true;
        const session = getSession();
        if (!session) return undefined;
        getStudents(session.token)
            .then((data) => {
                if (active) setStudents(data);
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 401) toLogin();
                else setStudentsError(err.message);
            })
            .finally(() => {
                if (active) setStudentsLoading(false);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function chooseGrade(option) {
        setSelected(option);
        setUnderstood(false);
        setError('');
    }

    async function handleConfirm() {
        const session = getSession();
        if (!session) {
            toLogin();
            return;
        }
        setError('');
        setSaving(true);
        try {
            const updated = await declareGrade(session.token, selected.grade);
            setClassData(updated);
            setSelected(null);
        } catch (err) {
            if (err.status === 401) {
                toLogin();
            } else if (err.status === 409 && err.code === 'GRADE_LOCKED') {
                // Otra petición ya declaró el grado: se recarga el estado y se muestra ese grado.
                try {
                    setClassData(await getClass(session.token));
                    setSelected(null);
                } catch (reloadErr) {
                    setError(reloadErr.message);
                }
            } else {
                setError(err.message);
            }
        } finally {
            setSaving(false);
        }
    }

    const locked = classData !== null && classData.classGrade !== null;

    return (
        <div className="min-h-screen">
            <TopBar name={classData?.displayName || 'Docente'} />
            <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                {loading && <p className="text-sm text-gray-500 text-center">Cargando...</p>}
                {loadError && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{loadError}</div>}

                {classData && (
                    <>
                        <section className={CARD}>
                            <p className="text-sm text-gray-500 mb-1">Tu código de clase</p>
                            <p className="text-4xl font-bold tracking-widest text-blue-700">{classData.classCode}</p>
                            <p className="text-sm text-gray-600 mt-3">Compártelo con tus estudiantes para que se registren.</p>
                        </section>

                        <section className={CARD}>
                            <h2 className="text-lg font-bold text-gray-900 mb-4">Nivel de la clase</h2>

                            {locked ? (
                                <div>
                                    <p className="text-xl font-semibold text-gray-900">
                                        <span aria-hidden="true">🔒 </span>
                                        {gradeLabel(classData.classGrade, classData.classLevel)}
                                    </p>
                                    <p className="text-sm text-gray-600 mt-3">
                                        Si fue un error, abre un ticket con el gestor de cuentas.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <p className="text-sm text-gray-600">Elige el grado de tu clase.</p>
                                    <div className="flex flex-wrap gap-3">
                                        {classData.grades.map((option) => {
                                            const active = selected?.grade === option.grade;
                                            return (
                                                <button
                                                    key={option.grade}
                                                    type="button"
                                                    onClick={() => chooseGrade(option)}
                                                    aria-pressed={active}
                                                    className={`px-4 py-3 rounded-lg border text-sm font-semibold transition-colors ${
                                                        active
                                                            ? 'bg-blue-600 border-blue-600 text-white'
                                                            : 'bg-white border-gray-200 text-gray-700 hover:border-blue-500'
                                                    }`}
                                                >
                                                    {gradeLabel(option.grade, option.level)}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {selected && (
                                        <div className="space-y-4">
                                            <div role="alert" className="p-4 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
                                                Este nivel no se puede cambiar durante todo el periodo escolar. Si te equivocas, deberás pedir ayuda al gestor de cuentas.
                                            </div>
                                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={understood}
                                                    onChange={(e) => setUnderstood(e.target.checked)}
                                                    className="w-4 h-4 accent-blue-600"
                                                />
                                                Entiendo que no podré cambiarlo
                                            </label>
                                            <button
                                                type="button"
                                                onClick={handleConfirm}
                                                disabled={!understood || saving}
                                                className="auth-button disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {saving ? 'Guardando...' : `Confirmar ${gradeLabel(selected.grade, selected.level)}`}
                                            </button>
                                        </div>
                                    )}

                                    {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}
                                </div>
                            )}
                        </section>
                    </>
                )}

                <section className={CARD}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                        <h2 className="text-lg font-bold text-gray-900">Estudiantes de tu clase</h2>
                        {students && (
                            <p className="text-sm text-gray-500">
                                {students.length === 1 ? '1 estudiante' : `${students.length} estudiantes`}
                            </p>
                        )}
                    </div>

                    {studentsLoading && <p className="text-sm text-gray-500">Cargando estudiantes...</p>}
                    {studentsError && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{studentsError}</div>}

                    {students && students.length === 0 && (
                        <div>
                            <p className="text-sm text-gray-600">Aún no hay estudiantes registrados con tu código de clase.</p>
                            {!classData && <p className="text-sm text-gray-600 mt-1">Compártelo con tus estudiantes para que se registren.</p>}
                        </div>
                    )}

                    {students && students.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-100">
                                        <th scope="col" className="py-2 pr-4 font-semibold">Alias</th>
                                        <th scope="col" className="py-2 pr-4 font-semibold">XP</th>
                                        <th scope="col" className="py-2 pr-4 font-semibold">Nivel XP</th>
                                        <th scope="col" className="py-2 pr-4 font-semibold">Actividades</th>
                                        <th scope="col" className="py-2 pr-4 font-semibold">Vocabulary</th>
                                        <th scope="col" className="py-2 pr-4 font-semibold">Grammar</th>
                                        <th scope="col" className="py-2 font-semibold">Reading</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map((student) => (
                                        <tr key={student.userId} className="border-b border-gray-50 last:border-0">
                                            <th scope="row" className="py-2 pr-4 font-semibold text-gray-900 whitespace-nowrap">{student.alias}</th>
                                            <td className="py-2 pr-4 text-gray-700">{student.xp}</td>
                                            <td className="py-2 pr-4 text-gray-700">{student.level}</td>
                                            <td className="py-2 pr-4 text-gray-700">{student.completedActivities}</td>
                                            <td className="py-2 pr-4 text-gray-700">{formatAverage(student.averages?.vocabulary)}</td>
                                            <td className="py-2 pr-4 text-gray-700">{formatAverage(student.averages?.grammar)}</td>
                                            <td className="py-2 text-gray-700">{formatAverage(student.averages?.reading)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
