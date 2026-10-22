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
├── api/                      Conexión con el backend y sesiones. client.js (apiRequest y ApiError),
│                             session.js (sesión de estudiante y docente), staffSession.js (sesión de gestión)
│                             y auth.js, student.js, teacher.js y staff.js (llamadas de cada área)
├── components/
│   ├── AuthBackground.jsx    Fondo con ráfagas de viento para Login y Registro
│   ├── WindBackdrop.jsx      Fondo fijo de los paneles (estudiante, docente y gestión)
│   ├── ProtectedRoute.jsx    Protege rutas según sesión y rol
│   ├── StaffRoute.jsx        Guarda de /staff y contexto useStaff() (rol y área desde GET /api/staff/me)
│   └── TopBar.jsx            Barra superior de los paneles: nombre del usuario y cierre de sesión
├── pages/
│   ├── auth/                 Login.jsx, Register.jsx, MfaSetup.jsx y SetInitialPassword.jsx
│   ├── staff/                StaffLogin.jsx, StaffLayout.jsx, IdentityAccess.jsx, Audit.jsx y Analytics.jsx
│   ├── student/              StudentHome.jsx (panel del estudiante)
│   └── teacher/              TeacherHome.jsx (panel docente)
├── App.jsx
├── index.css                 Clases base (auth-card, auth-input, auth-button) y animación de entrada
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

**Importante:** en `tailwind.config.js` la escala `blue` de Tailwind está redefinida con la paleta turquesa. Cualquier clase como `bg-blue-600` o `text-blue-600` se ve turquesa en todo el proyecto. Para cambiar el color de la app basta con editar esos valores.

La escala `brand` solo tiene los tonos 100 a 600. Clases como `brand-50`, `brand-700`, `brand-800` o `brand-900` no existen: no generan ningún estilo.

### Animación `animate-fade-in`
Definida en `tailwind.config.js` (keyframes `fade-in`, 300 ms, con un desplazamiento de 4 px). Se usa al entrar en las pestañas y paneles, y en el menú móvil de gestión. `index.css` la quita cuando el usuario tiene activado `prefers-reduced-motion`.

## Componentes

### `AuthBackground`
Envuelve las pantallas de autenticación: fondo oscuro con degradado turquesa y ráfagas de viento en SVG. En pantallas grandes la tarjeta queda a la izquierda y el viento a la derecha; en móvil se centra.

```jsx
<AuthBackground>
  <div className="auth-card">...</div>
</AuthBackground>
```

### `WindBackdrop`
Fondo fijo de los paneles de estudiante, docente y gestión: degradado turquesa con las mismas ráfagas en SVG. Es decorativo (`aria-hidden`), no recibe clics (`pointer-events-none`) y queda detrás del contenido de la página.

## Cliente HTTP (`api/client.js`)

`apiRequest(path, { method, body, token })` envuelve `fetch` con la base `/api`. Un error HTTP lanza un `ApiError` con `status` (el número HTTP) y `code` (el código que envía el servidor, si lo hay). Las pantallas deciden por esos campos y no por el texto del mensaje.

Sin conexión, `fetch` falla antes de recibir respuesta. En ese caso `apiRequest` lanza un `ApiError` con `status: 0` y `code: 'NETWORK_ERROR'`, con el mensaje "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.".

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
Tres pestañas (**Mi clase**, **Estudiantes** y **Progreso**). Solo se monta el panel de la pestaña activa; por eso las pestañas no llevan `aria-controls`. Cada pestaña tiene su propia carga: si una falla, las demás siguen funcionando.

- **Mi clase:** muestra el **código de la clase** (para compartirlo con los estudiantes) y la tarjeta **"Nivel de la clase"**. Los datos salen de `GET /api/teacher/class` (`api/teacher.js`).
  - **Sin grado declarado:** ofrece un botón por cada opción de `grades` (por ejemplo "3.º grado · A1.1"). Al elegir una, aparece un aviso de que el nivel **no se puede cambiar durante todo el periodo escolar** y que, si se equivoca, deberá pedir ayuda al gestor de cuentas, junto con la casilla "Entiendo que no podré cambiarlo". El botón "Confirmar …" sigue desactivado hasta marcar la casilla.
  - **Confirmación:** envía `PUT /api/teacher/class/grade` con `{ grade, confirm: true }` (el cliente siempre manda `confirm: true`; el servidor es la autoridad y exige ambos). Con la respuesta 200 la tarjeta pasa a modo bloqueado.
  - **Con grado declarado:** muestra el grado y el nivel y un candado (por ejemplo "🔒 3.º grado · A1.1") y el texto "Si fue un error, abre un ticket con el gestor de cuentas". Ya no hay botones para cambiarlo. Es el estado también al volver a entrar.
  - Si otra petición ya había declarado el grado (`409` con `code: "GRADE_LOCKED"`), el cliente recarga `GET /api/teacher/class` y muestra el grado ya declarado. Un `401` limpia la sesión y lleva al login; los demás errores se muestran en la tarjeta.
- **Estudiantes:** la tarjeta "Estudiantes de tu clase" con el número de estudiantes, orden por XP (con columna "Puesto") o por alias de A a Z, y una tabla (con scroll horizontal en pantallas estrechas) con alias, XP, nivel de XP, actividades completadas y promedio por módulo (Vocabulario, Gramática y Lectura; "—" si no hay intentos). Los datos salen de `GET /api/teacher/students` (`getStudents` en `api/teacher.js`). Sin estudiantes muestra "Aún no hay estudiantes registrados con tu código de clase."
- **Progreso:** tarjetas con estudiantes registrados, XP total de la clase y actividades completadas (suma); el promedio de la clase por módulo (media de los estudiantes que ya tienen intentos); los cinco estudiantes con más XP; y **"Temas con más errores"**, de `GET /api/teacher/difficult-topics?limit=5`. Sin respuestas suficientes muestra un aviso.
- Estudiantes y Progreso cargan por separado de la clase: si fallan, muestran su error sin afectar al resto del panel. Un `401` limpia la sesión y lleva al login.

### Panel del estudiante (`/student`)
Arriba, la identidad del estudiante: avatar, alias, grado y nivel de la clase, nivel y XP con su barra de progreso. Los datos salen de `GET /api/users/me`: `classGrade` y `classLevel` para la clase, y `level` (numérico) como nivel de XP. Si el docente aún no declaró el grado (`classLevel` es `null`), muestra "Tu docente aún no ha elegido el nivel de la clase." y **no pide actividades ni reto**.

Tres pestañas: **Mis misiones**, **Ranking** y **Mi perfil**. Los paneles quedan montados y solo se ocultan, para no repetir peticiones al cambiar de pestaña.

- **Mis misiones:** con nivel, el **reto del día** y una tarjeta por módulo (Vocabulario, Gramática y Lectura) que carga `GET /api/activities/:moduleSlug` (`api/student.js`). El servidor ya devuelve solo las actividades del nivel de la clase; el cliente no filtra nada.
  - **Reto del día:** `GET /api/daily-challenge` muestra la pregunta y sus opciones (un grupo de botones de opción, operable con teclado) y si ya se completó. El botón **Responder** (deshabilitado hasta elegir una opción y mientras se envía) llama a `POST /api/daily-challenge/complete` con `{ answer }`; el servidor califica y el cliente nunca conoce la respuesta correcta. Con `correct: false` muestra "Esa no es la respuesta. Inténtalo de nuevo." y el reto sigue disponible; con `correct: true` muestra "¡Correcto! Ganaste N XP", recarga el perfil y el ranking (XP y posición) y deja la tarjeta en "Reto de hoy completado". Un `409` (ya completado) solo vuelve a leer el reto, sin error. Sin reto para hoy muestra "Hoy no hay un reto diario para tu clase."
  - Las actividades con `isExample: true` llevan una etiqueta **"Ejemplo"**: son actividades de demostración, no contenido oficial.
  - Un módulo sin actividades muestra "Aún no hay actividades en este módulo.". Un `401` limpia la sesión y lleva al login.
- **Ranking:** `GET /api/ranking`, ordenado por posición. La fila del propio estudiante se marca con "Tú".
- **Mi perfil:** el alias es el usuario con el que inicia sesión y **no se edita**. El avatar se elige entre ocho opciones (`default`, `fox`, `cat`, `panda`, `owl`, `robot`, `rocket` y `star`) y se guarda con `PATCH /api/users/me` enviando solo ese identificador corto (el servidor acepta `^[a-z0-9_-]{1,50}$`). El emoji que se dibuja es un dato del cliente. No hay formulario de soporte.

### Área de gestión (`/staff`)
Acceso separado del de estudiantes y docentes, con su propia sesión:

- **Inicio de sesión (`/staff/login`):** usuario, contraseña y código TOTP, contra `POST /api/staff/auth/login`. Al entrar guarda la sesión de staff y va a `/staff`.
- **Sesión propia:** usa las claves de `localStorage` `ep_staff_token`, `ep_staff_role` y `ep_staff_area` (`api/staffSession.js`). No toca `ep_token` ni `ep_role`, así que cerrar la sesión de gestión no cierra la de estudiante o docente. La sesión dura 20 minutos (el servidor responde `expiresIn: 1200`); al vencer, un `401` lleva a `/staff/login` con un aviso.
- **Guarda (`StaffRoute`):** sin sesión de staff redirige a `/staff/login`. Con sesión, llama una vez a `GET /api/staff/me` y toma de ahí el usuario, el `role` y el `area`. Lo que quedó guardado al iniciar sesión no decide nada en pantalla. Un `403` significa cuenta no activa y vuelve al login con un aviso.
- **Menú y rutas:** `StaffLayout` muestra solo las secciones de `ROLE_SECTIONS` para el rol, y `RequireSection` vuelve a `/staff` si la ruta no corresponde. El servidor es la autoridad; el cliente solo oculta.
- **Cerrar sesión:** borra únicamente las claves de staff.

Secciones por rol (`ROLE_SECTIONS` en `pages/staff/StaffLayout.jsx`):

| Rol | Secciones que ve |
|---|---|
| `access_manager` (Gestor de usuarios y accesos) | Identidad y accesos |
| `auditor` (Auditor) | Identidad y accesos (solo lectura) y Auditoría |
| `analyst` (Analista de datos) | Datos y reportes |
| `content_manager`, `content_reviewer`, `game_manager`, `moderator` y `support` | Ninguna. Ven "Aún no hay paneles para tu rol" |

Páginas (endpoints reales en `api/staff.js`):

- **Identidad y accesos (`/staff/access`, `IdentityAccess.jsx`):** `GET /api/staff/accounts`, `POST /api/staff/teachers` (crea docente), `POST /api/staff/teachers/:id/reset-mfa`, `POST /api/staff/teachers/:id/reset-grade` (motivo de 5 a 40 caracteres) y `GET`/`POST /api/staff/change-requests` (solicitud de suspender o activar). Solo el gestor de accesos modifica; el auditor solo consulta.
- **Auditoría (`/staff/audit`, `Audit.jsx`):** `GET /api/staff/audit` con filtros, `GET /api/staff/audit/verify` (integridad de la cadena), `GET /api/staff/change-requests` y `POST /api/staff/change-requests/:id/decision` (aprobar o rechazar).
- **Datos y reportes (`/staff/analytics`, `Analytics.jsx`):** `GET /api/staff/analytics/dashboard`, con métricas agregadas y anónimas.

Las cinco páginas prototipo (contenido, revisión de contenido, gestión del juego, moderación y soporte) **no forman parte de la app**: no existe ruta de servidor para ellas. Su diseño sigue en la rama `PaginasWebs` para cuando haya backend.

### Rutas
`/login`, `/register`, `/password/initial`, `/mfa/setup` y las protegidas `/student/*` y `/teacher/*` (`ProtectedRoute`). Área de gestión: `/staff/login` (público) y `/staff` con `StaffRoute`, con las secciones anidadas `/staff/access`, `/staff/audit` y `/staff/analytics` (cada una con `RequireSection`). Cualquier otra ruta bajo `/staff` vuelve a `/staff`. `/` redirige a `/login`.

## Pendiente
- Estudiante: jugar las actividades y mostrar XP en vivo. El reto diario se responde desde el panel y solo otorga XP si la respuesta es correcta.
- Gestión: contenido, revisión de contenido, juego, moderación y soporte, cuando el backend exista (diseño en la rama `PaginasWebs`).
