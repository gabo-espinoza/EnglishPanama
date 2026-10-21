import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActivities, getProfile } from '../../api/student';
import { clearSession, getSession } from '../../api/session';
import TopBar from '../../components/TopBar';

const CARD = 'bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8';

const MODULES = [
    { slug: 'vocabulary', title: 'Vocabulary' },
    { slug: 'grammar', title: 'Grammar' },
    { slug: 'reading', title: 'Reading' }
];

// Sección de un módulo: carga sus actividades al montarse (solo se monta si la clase tiene nivel).
function ModuleSection({ slug, title, onUnauthorized }) {
    const [activities, setActivities] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        const session = getSession();
        if (!session) {
            onUnauthorized();
            return undefined;
        }
        getActivities(session.token, slug)
            .then((data) => {
                if (active) setActivities(data);
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 401) onUnauthorized();
                else setError(err.message);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    return (
        <section className={CARD}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
            {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}
            {!error && activities === null && <p className="text-sm text-gray-500">Cargando...</p>}
            {activities && activities.length === 0 && (
                <p className="text-sm text-gray-500">Aún no hay actividades en este módulo.</p>
            )}
            {activities && activities.length > 0 && (
                <ul className="space-y-2">
                    {activities.map((activity) => (
                        <li key={activity.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-100 bg-gray-50">
                            <span className="text-sm font-medium text-gray-800">{activity.title}</span>
                            {activity.isExample && (
                                <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">Ejemplo</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

// Panel del estudiante: nivel de la clase, XP y actividades por módulo.
export default function StudentHome() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
        getProfile(session.token)
            .then((data) => {
                if (active) setProfile(data);
            })
            .catch((err) => {
                if (!active) return;
                if (err.status === 401) toLogin();
                else setError(err.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="min-h-screen">
            <TopBar name={profile?.alias || 'Estudiante'} />
            <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                {loading && <p className="text-sm text-gray-500 text-center">Cargando...</p>}
                {error && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">{error}</div>}

                {profile && (
                    <>
                        <section className={CARD}>
                            <p className="text-sm text-gray-500 mb-1">Nivel de tu clase</p>
                            {profile.classLevel !== null ? (
                                <p className="text-2xl font-bold text-blue-700">{profile.classGrade}.º grado · {profile.classLevel}</p>
                            ) : (
                                <p className="text-sm text-gray-600">Tu docente aún no ha elegido el nivel de la clase.</p>
                            )}
                            <p className="text-sm text-gray-600 mt-3">
                                {profile.xp} XP · Nivel {profile.level}
                            </p>
                        </section>

                        {profile.classLevel !== null && MODULES.map((module) => (
                            <ModuleSection key={module.slug} slug={module.slug} title={module.title} onUnauthorized={toLogin} />
                        ))}
                    </>
                )}
            </main>
        </div>
    );
}
