# Frontend – English Panamá

Cliente web en `client/` (React + Vite + Tailwind CSS).

## Cómo correrlo

```bash
cd client
npm install
npm run dev
```

Se abre en `http://localhost:5173`.

## Estructura de `client/src`

```
src/
├── api/                      Conexión con el backend y sesión (student.js y teacher.js: llamadas de cada panel)
├── components/
│   ├── AuthBackground.jsx    Fondo con ráfagas de viento para Login y Registro
│   ├── ProtectedRoute.jsx    Protege rutas según sesión y rol
│   └── TopBar.jsx            Barra superior de los paneles: nombre del usuario y cierre de sesión
├── pages/
│   ├── auth/                 Login.jsx y Register.jsx
│   ├── student/              StudentHome.jsx (panel del estudiante)
│   └── teacher/              TeacherHome.jsx (panel docente)
├── App.jsx
├── index.css                 Clases base (auth-card, auth-input, auth-button)
└── main.jsx
```

## Sistema de diseño

### Tipografía
Poppins para el texto y Fredoka One para el logo "E" (definidas en `tailwind.config.js`).

### Paleta de colores (turquesa)
Definida en `client/tailwind.config.js`.

| Color | Hex | Uso |
|---|---|---|
| `brand-600` | `#0B454C` | Fondo oscuro de Login y Registro |
| `brand-500` | `#105F68` | Fondo oscuro (degradado) |
| `brand-300` | `#63C1BB` | Ráfagas de viento |
| `brand-100` | `#C8E6E2` | Ráfagas de viento (tono claro) |
| `blue-600` | `#26807A` | Botones, logo "E" y enlaces |
| `blue-700` | `#1D6B66` | Botón al pasar el mouse |
| `blue-300` | `#5DC1B9` | Aros de enfoque y acentos |
| `blue-200` | `#8AE0DB` | Bordes suaves |

**Importante:** en `tailwind.config.js` las escalas `blue` y `green` de Tailwind están redefinidas con la misma paleta turquesa. Cualquier clase como `bg-blue-600` o `text-green-600` se ve turquesa en todo el proyecto. Para cambiar el color de la app basta con editar esos valores.

## Componentes

### `AuthBackground`
Envuelve las pantallas de autenticación: fondo oscuro con degradado turquesa y ráfagas de viento en SVG. En pantallas grandes la tarjeta queda a la izquierda y el viento a la derecha; en móvil se centra.

```jsx
<AuthBackground>
  <div className="auth-card">...</div>
</AuthBackground>
```

## Pantallas implementadas

### Login (`/login`)
- Usuario y contraseña, con manejo de errores y estado de carga.
- Redirige a `/teacher` o `/student` según el rol.
- Se retiró el checkbox "Recordarme" y el enlace "¿Olvidaste tu contraseña?" porque no tenían funcionalidad conectada.
- **MFA (segundo factor):** si la cuenta tiene MFA activo, el backend no devuelve sesión sino `{ mfaRequired: true, mfaToken }`. El Login pasa entonces a un segundo paso donde se pide el código de 6 dígitos del autenticador y se envía a `POST /api/auth/login/mfa`. El reto dura 5 minutos; si vence, se vuelve al primer paso. Las cuentas sin MFA entran directo, como antes.
- **Contraseña inicial obligatoria:** si la cuenta debe crear su contraseña (docente nuevo), el backend responde `{ passwordChangeRequired: true, passwordToken }` y el Login manda a `/password/initial` (ver abajo). Esto ocurre antes que el MFA.
- **MFA obligatorio para docentes:** si el docente aún no vinculó un autenticador, el backend no entrega sesión sino `{ mfaSetupRequired: true, enrollToken }`. El Login lo manda a `/mfa/setup` (ver abajo). Los estudiantes siguen con MFA opcional.
- Si otra pantalla devuelve al usuario al login (por ejemplo, un token vencido), deja un aviso en `location.state.notice` y el Login lo muestra.

### Registro (`/register`)
- Solo registra **estudiantes**: las cuentas de docente no se crean por registro, las crea el gestor de accesos y el docente las recibe ya creadas (`POST /api/auth/register/teacher` responde 403).
- Registro de estudiante con **alias**, contraseña y código de clase del docente. El alias es lo único que ven los demás (ranking), por eso el formulario pide no usar el nombre real. Reglas del backend: de 3 a 30 caracteres con letras, números, punto, guion o guion bajo.
- Usa las mismas clases (`auth-input`, `auth-button`) que el Login para verse idéntico.

### Vinculación del autenticador (`/mfa/setup`)
- Llega aquí el docente en su primer inicio de sesión (el login le pasa el `enrollToken` en el estado del router (historial del navegador), nunca en `localStorage` ni en la URL). También sirve para un usuario con sesión normal que quiera activar el MFA.
- Pasos en pantalla: instalar una app de autenticación gratis (Google Authenticator, Microsoft Authenticator, Aegis o 2FAS), escanear el **QR** (se genera en el cliente con la librería `qrcode` a partir del `otpauthUri` que devuelve `POST /api/auth/mfa/setup`), y escribir el código de 6 dígitos. También muestra la clave de respaldo para quien no pueda escanear.
- `POST /api/auth/mfa/confirm` con el primer código correcto activa el MFA y, con el token de vinculación, **entrega la sesión**: el docente entra directo a su panel.
- Si la vinculación vence (10 minutos) aparece "Generar un código nuevo". Si el token de vinculación vence o se revoca (15 minutos), vuelve al login con un aviso.
- El token de vinculación no abre ninguna otra ruta: sin él, `/mfa/setup` redirige al login.
- Si un docente pierde el celular, el gestor de accesos le reinicia el MFA y vuelve a pasar por esta pantalla en su siguiente inicio de sesión.

### Creación de la contraseña inicial (`/password/initial`)
- Llega aquí el docente recién creado por el gestor de accesos. Su cuenta nace con la bandera `must_change_password`, así que `POST /api/auth/login` no devuelve sesión sino `{ passwordChangeRequired: true, passwordToken, expiresIn }`. El Login navega a `/password/initial` y le pasa el `passwordToken` en el estado del router (historial del navegador), nunca en `localStorage` ni en la URL.
- Pantalla "Crea tu contraseña": dos campos (contraseña nueva y repetirla). Si no coinciden se avisa en el cliente sin viajar al servidor; el servidor sigue siendo la autoridad (4 a 72 caracteres y distinta de la temporal).
- Envía `POST /api/auth/set-initial-password` con el `passwordToken`. La respuesta continúa el flujo normal del login: un docente sin autenticador recibe `{ mfaSetupRequired, enrollToken }` y pasa a `/mfa/setup`; con MFA activo vuelve a `/login` con el reto del segundo paso; en otro caso se guarda la sesión y entra a su panel.
- `401` (el token de 15 minutos venció o se revocó) y `409 PASSWORD_ALREADY_SET` (la contraseña ya fue creada) devuelven al login con un aviso. Los demás errores (400, 429) se muestran en el formulario.
- Sin `passwordToken` en el estado (por ejemplo, al abrir la ruta directamente), la ruta redirige al login. El estado del router vive en `window.history.state`, así que una recarga lo conserva mientras el token sea válido (muere a los 15 minutos o tras usarse).
- Red de seguridad: si una sesión vieja recibe `403` con `code: "PASSWORD_CHANGE_REQUIRED"`, el cliente HTTP (`api/client.js`) descarta la sesión y lleva a `/login`, donde el flujo normal lo conduce a crear la contraseña.

### Panel docente (`/teacher`)
- Muestra el **código de la clase** (para compartirlo con los estudiantes) y la tarjeta **"Nivel de la clase"**. Los datos salen de `GET /api/teacher/class` (`api/teacher.js`).
- **Sin grado declarado:** ofrece un botón por cada opción de `grades` (por ejemplo "3.º grado · A1.1"). Al elegir una, aparece un aviso de que el nivel **no se puede cambiar durante todo el periodo escolar** y que, si se equivoca, deberá pedir ayuda al gestor de cuentas, junto con la casilla "Entiendo que no podré cambiarlo". El botón "Confirmar …" sigue desactivado hasta marcar la casilla.
- **Confirmación:** envía `PUT /api/teacher/class/grade` con `{ grade, confirm: true }` (el cliente siempre manda `confirm: true`; el servidor es la autoridad y exige ambos). Con la respuesta 200 la tarjeta pasa a modo bloqueado.
- **Con grado declarado:** muestra el grado y el nivel y un candado (por ejemplo "🔒 3.º grado · A1.1") y el texto "Si fue un error, abre un ticket con el gestor de cuentas". Ya no hay botones para cambiarlo. Es el estado también al volver a entrar.
- Si otra petición ya había declarado el grado (`409` con `code: "GRADE_LOCKED"`), el cliente recarga `GET /api/teacher/class` y muestra el grado ya declarado. Un `401` limpia la sesión y lleva al login; los demás errores se muestran en la tarjeta.

### Panel del estudiante (`/student`)
- Arriba, la tarjeta **"Nivel de tu clase"** con el grado y el nivel (`classGrade` y `classLevel` de `GET /api/users/me`) y su XP y nivel de XP (`level` numérico). Si el docente aún no declaró el grado (`classLevel` es `null`), muestra "Tu docente aún no ha elegido el nivel de la clase." y **no pide actividades**.
- Con nivel, una sección por módulo (Vocabulary, Grammar y Reading) que carga `GET /api/activities/:moduleSlug` (`api/student.js`). El servidor ya devuelve solo las actividades del nivel de la clase; el cliente no filtra nada.
- Las actividades con `isExample: true` llevan una etiqueta **"Ejemplo"**: son actividades de demostración, no contenido oficial.
- Un módulo sin actividades muestra "Aún no hay actividades en este módulo.". Un `401` limpia la sesión y lleva al login.

### Rutas
`/login`, `/register`, `/password/initial`, `/mfa/setup`, y las protegidas `/student/*` y `/teacher/*` (`ProtectedRoute`). `/` redirige a `/login`.

## Pendiente
- Estudiante: jugar las actividades, XP en vivo, ranking y reto diario (hoy el panel solo lista las actividades del nivel).
- Docente: lista de estudiantes, progreso y temas difíciles (hoy el panel solo muestra el código y el grado de la clase).