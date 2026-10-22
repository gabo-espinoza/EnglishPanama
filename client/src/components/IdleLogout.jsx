import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IDLE_NOTICE, IDLE_TIMEOUT_MS, clearAllSessions, isPublicPath, loginPathFor } from '../api/sessionPolicy';

// Eventos que cuentan como actividad de la persona.
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'keydown', 'wheel', 'scroll', 'touchstart'];

// Cierra la sesión tras IDLE_TIMEOUT_MS (5 minutos) sin actividad y lleva al login con un aviso.
// No pinta nada. Se monta una vez, dentro del router. Solo cuenta en pantallas que no son públicas
// (paneles, primer ingreso y vinculación del MFA); en el login y el registro no hay nada que cerrar.
//
// Compara marcas de tiempo en lugar de confiar en un solo temporizador: los navegadores frenan los
// temporizadores de las pestañas ocultas y una laptop dormida no los ejecuta. Por eso también revisa
// al volver a la pestaña.
export default function IdleLogout() {
    const location = useLocation();
    const navigate = useNavigate();
    const pathRef = useRef(location.pathname);
    const lastActivityRef = useRef(Date.now());
    const navigateRef = useRef(navigate);

    useEffect(() => {
        navigateRef.current = navigate;
    }, [navigate]);

    // Cambiar de pantalla también es actividad.
    useEffect(() => {
        pathRef.current = location.pathname;
        lastActivityRef.current = Date.now();
    }, [location.pathname]);

    useEffect(() => {
        const markActivity = () => {
            lastActivityRef.current = Date.now();
        };

        const check = () => {
            const path = pathRef.current;
            if (isPublicPath(path)) {
                lastActivityRef.current = Date.now();
                return;
            }
            if (Date.now() - lastActivityRef.current < IDLE_TIMEOUT_MS) return;
            clearAllSessions();
            lastActivityRef.current = Date.now();
            navigateRef.current(loginPathFor(path), { replace: true, state: { notice: IDLE_NOTICE } });
        };

        ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActivity, { passive: true, capture: true }));
        document.addEventListener('visibilitychange', check);
        window.addEventListener('focus', check);
        const timer = setInterval(check, 1000);

        return () => {
            ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActivity, { capture: true }));
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('focus', check);
            clearInterval(timer);
        };
    }, []);

    return null;
}
