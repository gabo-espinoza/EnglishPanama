import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { mfaSetup, mfaConfirm } from '../../api/auth';
import { getSession, saveSession } from '../../api/session';
import AuthBackground from '../../components/AuthBackground';

// El backend solo entrega el URI otpauth://; de ahi sale el QR y la clave de respaldo.
function secretFromUri(uri) {
    const match = /[?&]secret=([A-Z2-7]+)/.exec(uri);
    return match ? match[1] : '';
}

// La clave (32 caracteres) se muestra en dos filas de 4 grupos de 4 para que no se parta al azar.
function secretLines(secret) {
    const groups = secret.match(/.{1,4}/g) || [];
    const lines = [];
    for (let i = 0; i < groups.length; i += 4) lines.push(groups.slice(i, i + 4).join(' '));
    return lines;
}

function homeFor(role) {
    return role === 'teacher' ? '/teacher' : '/student';
}

// Vinculacion del autenticador (MFA). Dos formas de llegar:
//  - Docente en su primer inicio de sesion: el MFA es obligatorio, asi que el login no
//    entrega sesion sino un token de vinculacion (viaja en el estado del router, en memoria).
//    Al confirmar el primer codigo, el backend entrega la sesion y se entra directo.
//  - Usuario con sesion (el MFA es opcional para estudiantes): usa su sesion normal.
export default function MfaSetup() {
    const location = useLocation();
    const navigate = useNavigate();
    const enrollToken = location.state?.enrollToken || null;
    const session = getSession();
    const token = enrollToken || session?.token || null;

    const [qr, setQr] = useState('');
    const [secret, setSecret] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [generating, setGenerating] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [needsNewCode, setNeedsNewCode] = useState(false);
    // React.StrictMode monta los efectos dos veces en desarrollo; cada /mfa/setup genera un
    // secreto nuevo y el segundo pisaria al primero (el QR no coincidiria con el pendiente).
    const startedRef = useRef(false);

    function backToLogin(notice) {
        navigate('/login', { replace: true, state: { notice } });
    }

    async function generate() {
        setGenerating(true);
        setError('');
        setNeedsNewCode(false);
        setCode('');
        try {
            const { otpauthUri } = await mfaSetup(token);
            setSecret(secretFromUri(otpauthUri));
            setQr(await QRCode.toDataURL(otpauthUri, { width: 224, margin: 1, errorCorrectionLevel: 'M' }));
        } catch (err) {
            if (err.status === 409) {
                backToLogin('Tu cuenta ya tiene un autenticador. Inicia sesión con tu código.');
            } else if (err.status === 429) {
                // Límite de intentos: el token sigue siendo válido, solo hay que esperar.
                setError(err.message);
            } else if (/token|sesi[oó]n/i.test(err.message)) {
                // El servidor responde 401 por varios motivos (token vencido o revocado, pero también
                // "indica el código actual"), así que aquí el estado no alcanza y se lee el mensaje.
                backToLogin('Tu tiempo para vincular el autenticador venció. Inicia sesión de nuevo.');
            } else {
                setError(err.message);
            }
        } finally {
            setGenerating(false);
        }
    }

    useEffect(() => {
        if (!token) {
            navigate('/login', { replace: true });
            return;
        }
        if (startedRef.current) return;
        startedRef.current = true;
        generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setConfirming(true);
        try {
            const result = await mfaConfirm(token, code.trim());
            if (result.token && result.role) {
                // Vinculacion obligatoria: el backend entrega la sesion junto con la confirmacion.
                saveSession(result.token, result.role);
                navigate(homeFor(result.role), { replace: true });
            } else {
                // Con sesion normal solo se activa el MFA: se vuelve a su pantalla.
                navigate(homeFor(session?.role), { replace: true });
            }
        } catch (err) {
            setError(err.message);
            if (err.status === 429) return; // límite de intentos: el aviso queda en pantalla
            // El secreto pendiente vale 10 minutos: si vencio, hay que pedir uno nuevo.
            if (/vinculaci[oó]n expir|en curso/i.test(err.message)) setNeedsNewCode(true);
            else if (/token|sesi[oó]n expir|revocad/i.test(err.message)) {
                backToLogin('Tu tiempo para vincular el autenticador venció. Inicia sesión de nuevo.');
            }
        } finally {
            setConfirming(false);
        }
    }

    if (!token) return null;

    return (
        <AuthBackground>
            <div className="auth-card">
                <div className="flex items-center justify-center mb-6">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3 shadow-sm">
                        <span className="text-white font-bold text-xl font-['Fredoka_One']">E</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-gray-900">English Panamá</span>
                </div>

                <div className="mb-6 text-center">
                    <p className="text-sm text-gray-500 mb-1">
                        {enrollToken ? 'Es obligatorio para docentes' : 'Verificación en dos pasos'}
                    </p>
                    <h1 className="text-2xl font-bold text-gray-900">Protege tu cuenta</h1>
                </div>

                <ol className="space-y-4 text-sm text-gray-700">
                    <li>
                        <p className="font-medium text-gray-900">1. Instala una app de autenticación</p>
                        <p className="text-gray-600">
                            Es gratis. Sirven Google Authenticator, Microsoft Authenticator, Aegis o 2FAS.
                        </p>
                    </li>

                    <li>
                        <p className="font-medium text-gray-900">2. Escanea este código QR con la app</p>
                        <div className="mt-3 flex flex-col items-center">
                            {generating && <p className="py-16 text-gray-500">Generando código...</p>}
                            {!generating && qr && (
                                <img
                                    src={qr}
                                    width="224"
                                    height="224"
                                    alt="Código QR para vincular tu app de autenticación"
                                    className="rounded-lg border border-gray-200"
                                />
                            )}
                            {!generating && secret && (
                                <div className="mt-3 w-full text-center">
                                    <p className="text-xs text-gray-500">¿No puedes escanearlo? Escribe esta clave en la app:</p>
                                    <code className="mt-1 block select-all rounded-lg bg-gray-50 px-3 py-2 text-sm tracking-wider text-gray-900">
                                        {secretLines(secret).map((line) => (
                                            <span key={line} className="block">{line}</span>
                                        ))}
                                    </code>
                                    <p className="mt-1 text-xs text-gray-500">No la compartas con nadie. Este código vence en 10 minutos.</p>
                                </div>
                            )}
                        </div>
                    </li>

                    <li>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <label className="block font-medium text-gray-900" htmlFor="mfa-code">
                                3. Escribe el código de 6 dígitos que muestra la app
                            </label>
                            <input
                                id="mfa-code"
                                className="auth-input text-center tracking-[0.4em]"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="000000"
                                disabled={generating || needsNewCode}
                                required
                            />

                            {error && (
                                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg text-center">
                                    {error}
                                </div>
                            )}

                            {needsNewCode ? (
                                <button type="button" onClick={generate} className="auth-button mt-2">
                                    Generar un código nuevo
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={generating || confirming || code.length !== 6}
                                    className="auth-button mt-2"
                                >
                                    {confirming ? 'Verificando...' : enrollToken ? 'Activar y entrar' : 'Activar'}
                                </button>
                            )}
                        </form>
                    </li>
                </ol>
            </div>
        </AuthBackground>
    );
}
