import { useEffect, useRef } from 'react';
import { ConfirmPanel } from './ui';

// ConfirmPanel con manejo del foco: al abrirse lleva el foco a "Cancelar" (el último botón; un Enter
// accidental no ejecuta la acción) y, al cerrarse, intenta devolverlo al control que lo abrió (si
// sigue en pantalla; si ya no está, el que muestra la pantalla decide dónde dejar el foco).
export default function FocusedConfirm(props) {
    const wrapperRef = useRef(null);

    useEffect(() => {
        const opener = document.activeElement;
        const buttons = wrapperRef.current ? wrapperRef.current.querySelectorAll('button') : [];
        if (buttons.length > 0) buttons[buttons.length - 1].focus();
        return () => {
            if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
        };
    }, []);

    return (
        <div ref={wrapperRef}>
            <ConfirmPanel {...props} />
        </div>
    );
}
