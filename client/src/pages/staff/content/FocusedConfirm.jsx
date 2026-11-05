import { useEffect, useRef } from 'react';
import { ConfirmPanel } from '../ui';

// ConfirmPanel con manejo del foco: al abrirse lleva el foco a su primer botón y, al cerrarse,
// intenta devolverlo al control que lo abrió (si sigue en pantalla).
export default function FocusedConfirm(props) {
    const wrapperRef = useRef(null);

    useEffect(() => {
        const opener = document.activeElement;
        const first = wrapperRef.current && wrapperRef.current.querySelector('button');
        if (first) first.focus();
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
