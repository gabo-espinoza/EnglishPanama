# Cambio obligatorio de la contraseña temporal: plan de implementación (pieza 1)

> **Para quien ejecute el plan:** SUB-HABILIDAD REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementarlo tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que un docente recién creado por el personal de gestión no pueda usar su contraseña temporal más allá del primer ingreso: debe crear la suya antes de vincular el MFA y de recibir sesión.

**Arquitectura:** una columna `users.must_change_password` y un token restringido `pwd_change` (mismo patrón que `mfa_enroll`) que solo abre `POST /api/auth/set-initial-password`. El servidor lo exige: `requireAuth` rechaza con 403 y `code` a quien tenga la bandera, y rechaza el token restringido en cualquier otra ruta. Al guardar la contraseña, el flujo continúa por el camino que ya existe (reto de MFA, vinculación del MFA o sesión).

**Tecnologías:** Node 20 + Express 4, MySQL 8, `jsonwebtoken`, `bcrypt`, `node:test`; React 18 + Vite + Tailwind.

**Diseño:** `docs/superpowers/specs/2026-10-20-primer-ingreso-docente-y-grado-de-clase-design.md` (sección "Pieza 1" y "Precisiones tras la revisión del documento"). Este plan no cubre las piezas 2, 3 y 4.

## Restricciones globales

- Texto del proyecto (interfaz, errores, comentarios, documentos, commits) en español latinoamericano neutro, con "tú", sin voseo. Los mensajes de error del servidor siguen el estilo actual (sin tildes ni signos de apertura, como en `auth.service.js`); los textos del cliente llevan tildes.
- Commits en formato convencional, **sin** líneas de coautoría ni atribución de IA. Rama nueva `feat/cambio-obligatorio-de-contrasena` creada desde `origin/develop`; el PR apunta a `develop`.
- No ejecutar `npm run build` ni compilar tras los cambios. Las pruebas del servidor que necesitan MySQL se omiten solas si no hay base (como en `password.test.js`) y **no pueden correrse en la máquina del líder**: las pruebas DB-less sí deben pasar localmente.
- La migración es manual, incremental, repetible (patrón de `information_schema`) y compatible hacia atrás; se aplica en producción **antes** de desplegar el código.
- Nunca usar la base de producción para desarrollo ni pruebas. Ningún secreto en el repositorio ni en la salida.
- Reutilizar la política de contraseñas existente (`validatePassword`: de 4 a 72 caracteres).
- La bandera solo se activa para docentes creados con `createTeacher`; las cuentas existentes quedan en `0`.

## Enfoque de revisión

Casos que el diseño implica y que ninguna tarea de "camino feliz" ejercita. Cada uno tiene su prueba en la tarea indicada:

1. El token `pwd_change` presentado en `/mfa/setup`, `/mfa/confirm` o `/change-password` (tarea 3).
2. El mismo `passwordToken` usado dos veces: el segundo uso debe fallar con 401 porque `token_version` ya cambió (tarea 4).
3. Un usuario con la bandera en `0` que presenta un `pwd_change` viejo (tarea 4).
4. Contraseña nueva igual a la temporal, vacía, de más de 72 caracteres, o con repetición distinta (tarea 4).
5. Un docente con la bandera en `1` **y** con MFA ya vinculado: debe pasar primero por el cambio y después por el reto de MFA (tarea 4).

---

### Tarea 1: Columna, migración y creación de docentes con la bandera

**Archivos:**
- Crear: `server/database/migrations/phase3-must-change-password.sql`
- Modificar: `server/database/schema.sql` (tabla `users`)
- Modificar: `server/src/services/staffAccounts.service.js` (`createTeacher`, insert de `users`)
- Prueba: `server/tests/password-initial.test.js` (archivo nuevo; las tareas 3 y 4 lo amplían)

**Interfaces:**
- Produce: columna `users.must_change_password TINYINT(1) NOT NULL DEFAULT 0`. `createTeacher` la deja en `1`.

- [ ] **Paso 1: Crear `server/tests/password-initial.test.js`** con la misma estructura de arranque que `password.test.js` (servidor en puerto 0, omitir si no hay MySQL, `JWT_SECRET` o `STAFF_MFA_KEY`, limpieza en `test.after`) y esta prueba, que llama directamente a `staffAccounts.createTeacher({ username, displayName: 'Docente Nuevo', actorId })`:
  - `'createTeacher deja must_change_password en 1'`: tras crearlo, `SELECT must_change_password FROM users WHERE id = ?` devuelve `1`. Un usuario insertado con `INSERT INTO users (role, username, password_hash)` sin la columna queda en `0`.
- [ ] **Paso 2: Verificar que falla** (en un entorno con MySQL, tras aplicar la migración del paso 3, la aserción de `1` falla hasta el paso 4). Comando: `cd server && node --test tests/password-initial.test.js`. Sin MySQL la prueba se omite; es esperado.
- [ ] **Paso 3: Escribir la migración** `phase3-must-change-password.sql` con el mismo patrón y cabecera de `phase2-platform-mfa.sql`: un `ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = el usuario debe crear su contrasena antes de recibir sesion'` condicionado a `information_schema.COLUMNS`. Añadir la misma columna a `schema.sql`, después de `locked_until`.
- [ ] **Paso 4: En `createTeacher`**, cambiar el insert a `INSERT INTO users (role, username, password_hash, must_change_password) VALUES (?, ?, ?, 1)`.
- [ ] **Paso 5: Verificar**: sintaxis con `node --check server/src/services/staffAccounts.service.js`; la prueba del paso 1 pasa donde haya MySQL.
- [ ] **Paso 6: Commit** `feat(auth): columna must_change_password y docentes nuevos con cambio obligatorio`.

### Tarea 2: Campo `code` en los errores de la API

**Archivos:**
- Modificar: `server/src/services/auth.service.js` (`AuthError`)
- Modificar: `server/src/middleware/errorHandler.js`
- Modificar: `client/src/api/client.js` (`ApiError`, `apiRequest`)
- Prueba: `server/tests/errorCode.test.js` (nuevo, sin base de datos)

**Interfaces:**
- Produce (servidor): `new AuthError(message, status = 400, code)`; `err.code` opcional. El `errorHandler` responde `{ error, code }` solo cuando el error trae `code` de cadena y el estado es menor que 500. Cuidado: `err.code` también lo usan los errores de MySQL (`ER_DUP_ENTRY`) y de Node; por eso `AuthError` guarda el suyo en `err.apiCode`, y el handler lee `apiCode`.
- Produce (cliente): `new ApiError(message, status, code)`, con `err.code`.

- [ ] **Paso 1: Escribir `errorCode.test.js`** con un `res` falso (`status(n)` devuelve el mismo objeto, `json(b)` guarda el cuerpo) y estas pruebas contra `errorHandler`:
  - `'incluye code cuando el error trae apiCode'`: `{ status: 403, message: 'x', apiCode: 'PASSWORD_CHANGE_REQUIRED' }` → cuerpo `{ error: 'x', code: 'PASSWORD_CHANGE_REQUIRED' }`.
  - `'no incluye code si no hay apiCode'`: cuerpo exactamente `{ error: 'x' }`.
  - `'no filtra el code de MySQL'`: `{ status: 409, message: 'x', code: 'ER_DUP_ENTRY' }` → cuerpo `{ error: 'x' }`.
  - `'un 500 no expone apiCode'`: `{ status: 500, apiCode: 'X' }` → cuerpo `{ error: 'Ocurrio un error inesperado.' }`.
- [ ] **Paso 2: Verificar que falla.** `cd server && node --test tests/errorCode.test.js` → FALLA en las dos primeras.
- [ ] **Paso 3: Implementar** `AuthError` con tercer parámetro `apiCode` (guardado en `this.apiCode`) y el `errorHandler` según la interfaz.
- [ ] **Paso 4: Verificar que pasa.** Mismo comando → PASA. Ejecutar también `node --test tests/rateLimiter.test.js` para confirmar que nada previo se rompió.
- [ ] **Paso 5: Cliente.** `ApiError` recibe y guarda `code`; `apiRequest` lo pasa desde `data.code`.
- [ ] **Paso 6: Commit** `feat(api): campo code legible por maquina en los errores`.

### Tarea 3: El middleware entiende el token restringido y la bandera

**Archivos:**
- Modificar: `server/src/middleware/auth.js`
- Prueba: `server/tests/password-initial.test.js` (ampliar)

**Interfaces:**
- Consume: `AuthError`/códigos de la tarea 2 no se usan aquí; el middleware responde JSON directo.
- Produce: constante `PASSWORD_TOKEN_TYP = 'pwd_change'` exportada desde `auth.service.js` (se define en la tarea 4; aquí el middleware compara contra la cadena literal vía una constante local para no depender de la tarea 4). `requirePasswordToken` exportado junto a `requireAuth`, `requireAuthOrEnroll`, `requireRole`.
- Comportamiento: `authenticate` se generaliza de `{ allowEnroll }` a `{ allowEnroll, allowPasswordToken }`. Con `allowPasswordToken` acepta `typ === 'pwd_change'` y **no** aplica el rechazo por bandera (esa ruta es justo para quien la tiene en `1`). En el resto de rutas: un `pwd_change` se rechaza con 401 `Token invalido o expirado.`; y si la fila del usuario tiene `must_change_password = 1`, responde 403 `{ error: 'Debes crear tu contrasena antes de continuar.', code: 'PASSWORD_CHANGE_REQUIRED' }`. La consulta de usuario de `authenticate` añade `must_change_password`. `req.passwordTokenOnly` indica que llegó un `pwd_change`.

- [ ] **Paso 1: Pruebas sin base de datos** (el `typ` se rechaza antes de consultar la base), con `JWT_SECRET` de prueba fijado en el propio archivo si no existe, montando `requireAuth`, `requireAuthOrEnroll` y `requirePasswordToken` en una mini app de Express:
  - `'un pwd_change no abre rutas con requireAuth'` → 401.
  - `'un pwd_change no abre rutas con requireAuthOrEnroll'` → 401.
  - `'un mfa_enroll no abre la ruta del cambio inicial'` (con `requirePasswordToken`) → 401.
  - `'un mfa_pending no abre la ruta del cambio inicial'` → 401.
- [ ] **Paso 2: Pruebas con base de datos** (se omiten sin MySQL), sobre `/api/auth/change-password` y `GET /api/users/me`:
  - `'una sesion valida con must_change_password=1 recibe 403 con code'`: crear un docente con la bandera en `1`, firmar un JWT normal con su `token_version`, esperar 403 y `body.code === 'PASSWORD_CHANGE_REQUIRED'`.
  - `'con la bandera en 0 la misma sesion pasa'`.
- [ ] **Paso 3: Verificar que fallan**, `cd server && node --test tests/password-initial.test.js`.
- [ ] **Paso 4: Implementar** el middleware según el comportamiento descrito; la consulta pasa a `SELECT id, role, is_active, token_version, must_change_password`.
- [ ] **Paso 5: Verificar que pasan** las pruebas DB-less (y las de base donde haya MySQL). Ejecutar además `node --test tests/session.test.js` donde haya MySQL para confirmar que las sesiones existentes siguen funcionando.
- [ ] **Paso 6: Commit** `feat(auth): requireAuth exige la creacion de contrasena y rechaza el token restringido`.

### Tarea 4: Servicio, controlador y ruta de `set-initial-password`

**Archivos:**
- Modificar: `server/src/services/auth.service.js`
- Modificar: `server/src/controllers/auth.controller.js`
- Modificar: `server/src/routes/auth.routes.js`
- Prueba: `server/tests/password-initial.test.js` (ampliar)

**Interfaces:**
- Consume: `AuthError(message, status, apiCode)` (tarea 2); `requirePasswordToken` (tarea 3).
- Produce en `auth.service.js`: `PASSWORD_TOKEN_TYP = 'pwd_change'` y `PASSWORD_TOKEN_MINUTES = 15` (exportada la primera); `signPasswordToken(user)` con el mismo patrón que `signEnrollToken`; `async function setInitialPassword({ userId, newPassword, confirmPassword }) -> Promise<{ token, role } | { mfaRequired, mfaToken, expiresIn } | { mfaSetupRequired, enrollToken, expiresIn }>`.
- Produce: `passwordChangeRequired(user)` → `{ passwordChangeRequired: true, passwordToken, expiresIn }`.
- Refactor interno: extraer de `login` la parte posterior a la comprobación de contraseña (rama MFA activo → reto; sin MFA → `clearLock`; rol con MFA obligatorio → `enrollmentRequired`; resto → sesión) a `async function afterFirstFactor(user)`, que `login` y `setInitialPassword` comparten. La comprobación nueva de la bandera va en `login` **antes** de `afterFirstFactor`: si `must_change_password` es 1, `clearLock(user)` y `return passwordChangeRequired(user)`. `LOGIN_COLUMNS` añade `must_change_password`.
- Ruta: `router.post('/set-initial-password', authLimiter, requirePasswordToken, authController.setInitialPassword)`. El controlador lee `{ newPassword, confirmPassword }` de `req.body || {}` y pasa `userId: req.user.id`.

Reglas de `setInitialPassword` (servidor):
1. `newPassword` y `confirmPassword` obligatorios (400); `validatePassword(newPassword)`; si difieren, 400 `Las contrasenas no coinciden.`.
2. Leer el usuario con `LOGIN_COLUMNS`. Cuenta inexistente o inactiva → 401. Cuenta bloqueada → 401 `Demasiados intentos. Espera unos segundos.`.
3. Si `must_change_password` no es 1 → 409 con `apiCode: 'PASSWORD_ALREADY_SET'` (cubre un `pwd_change` viejo con la bandera en `0`).
4. Si `bcrypt.compare(newPassword, user.password_hash)` es verdadero → 400 `La contrasena nueva debe ser distinta de la temporal.`.
5. `UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL WHERE id = ? AND must_change_password = 1` y verificar `affectedRows === 1` (si es 0, 409 como en el punto 3: gana solo una petición concurrente).
6. `audit.record({ actorType: user.role, actorId: user.id, actorRole: user.role, action: 'user.password.initial_set', outcome: 'ok' })`.
7. `return afterFirstFactor({ ...user, token_version: Number(user.token_version) + 1, failed_attempts: 0, locked_until: null })`: así los tokens nuevos llevan la versión actualizada.

- [ ] **Paso 1: Escribir las pruebas con base de datos** (`password-initial.test.js`, se omiten sin MySQL). Datos: un docente con bandera en `1` y sin MFA, otro con bandera en `1` y con MFA, y un estudiante. Los `passwordToken` se obtienen con un `POST /auth/login` real, contando con el límite de 20 intentos por IP: firmar los tokens con `jwt.sign({ id, typ: 'pwd_change', tv }, JWT_SECRET, { expiresIn: '15m' })` salvo en la prueba del login.
  - `'login con la bandera en 1 devuelve passwordChangeRequired y no da sesion'`: cuerpo con `passwordChangeRequired === true`, `passwordToken` y **sin** `token`, `mfaToken` ni `enrollToken`.
  - `'login con la bandera en 1 y MFA ya vinculado tampoco da reto de MFA'`: igual que arriba (el cambio va primero).
  - `'set-initial-password sin MFA devuelve enrollToken y deja la bandera en 0'` y `'la contrasena temporal deja de servir'` (login con la temporal → 401; con la nueva → continúa).
  - `'set-initial-password con MFA ya vinculado devuelve mfaToken'`.
  - `'usar dos veces el mismo passwordToken falla con 401'`.
  - `'un passwordToken con la bandera en 0 devuelve 409 PASSWORD_ALREADY_SET'`.
  - `'rechaza contrasena igual a la temporal'`, `'rechaza contrasenas distintas'`, `'rechaza vacia'`, `'rechaza de mas de 72 caracteres'`.
  - `'el passwordToken no abre /auth/mfa/setup ni /auth/change-password'` → 401 en ambos.
  - `'dos peticiones simultaneas: solo una tiene exito'`.
  - `'queda registrado en la auditoria'`: existe una fila `user.password.initial_set` (consultar `audit.service` como hace `password.test.js`).
- [ ] **Paso 2: Verificar que fallan**, `cd server && node --test tests/password-initial.test.js`.
- [ ] **Paso 3: Implementar** servicio, controlador y ruta según las interfaces y las siete reglas. Actualizar `module.exports` del servicio (`setInitialPassword`, `PASSWORD_TOKEN_TYP`) y del controlador.
- [ ] **Paso 4: Verificar que pasan** donde haya MySQL; sin MySQL, `node --check` de los tres archivos y las pruebas DB-less de las tareas 2 y 3. Correr también `node --test tests/mfa-teacher.test.js tests/password.test.js` donde haya MySQL: el login de docentes con la bandera en `0` no debe cambiar.
- [ ] **Paso 5: Commit** `feat(auth): set-initial-password y bandera de cambio obligatorio en el login`.

### Tarea 5: Cliente: pantalla "Crea tu contraseña" y manejo del 403

**Archivos:**
- Crear: `client/src/pages/auth/SetInitialPassword.jsx`
- Modificar: `client/src/api/auth.js`, `client/src/api/client.js`, `client/src/pages/auth/Login.jsx`, `client/src/App.jsx`

**Interfaces:**
- Consume: `ApiError.code` (tarea 2); respuestas de las tareas 3 y 4.
- Produce: `setInitialPassword(passwordToken, newPassword, confirmPassword)` en `client/src/api/auth.js` (`POST /auth/set-initial-password` con `token`). Ruta `/password/initial`.

Comportamiento:
- `Login.handleSubmit`: si `result.passwordChangeRequired`, `navigate('/password/initial', { replace: true, state: { passwordToken: result.passwordToken } })` (token en memoria, nunca en `localStorage`, igual que `enrollToken`).
- `SetInitialPassword`: usa `AuthBackground` y las clases `auth-card`, `auth-input`, `auth-button` como `Login.jsx`. Encabezado "Es tu primer ingreso" / "Crea tu contraseña", texto "La temporal deja de servir en cuanto guardes la nueva.", campos "Contraseña nueva" y "Repetir contraseña" con `htmlFor`/`id`, botón "Guardar contraseña". Valida en el cliente que ambas coincidan antes de enviar. Sin `passwordToken` en el estado, redirige a `/login`.
- Tras guardar: si la respuesta trae `mfaSetupRequired`, `navigate('/mfa/setup', { replace: true, state: { enrollToken } })`; si trae `mfaRequired`, `navigate('/login', { replace: true, state: { mfaToken: result.mfaToken } })` y `Login` inicializa su estado `mfaToken` desde `location.state?.mfaToken`; si trae `token`, guarda la sesión y entra. Errores por estado, no por texto: 401 y 409 con `code === 'PASSWORD_ALREADY_SET'` → `/login` con `notice` ("Tu tiempo para crear la contraseña venció. Inicia sesión de nuevo." / "Tu contraseña ya fue creada. Inicia sesión."); 429 → mensaje en línea; el resto → mensaje en línea.
- `apiRequest`: si la respuesta es 403 con `code === 'PASSWORD_CHANGE_REQUIRED'`, llamar `clearSession()` y `window.location.assign('/login')` antes de lanzar el `ApiError`.

- [ ] **Paso 1: Implementar** los cinco archivos según el comportamiento.
- [ ] **Paso 2: Verificar sin compilar**: `cd client && node --check` no aplica a JSX; revisar el diff completo, comprobar que no hay texto con voseo y que los imports resuelven (`rg -n "SetInitialPassword|setInitialPassword" client/src`).
- [ ] **Paso 3: Commit** `feat(client): pantalla para crear la contrasena en el primer ingreso`.

### Tarea 6: Documentación y guía de migración

**Archivos:**
- Modificar: `docs/api.md` (en `POST /auth/login`: la respuesta `passwordChangeRequired`; sección nueva `POST /auth/set-initial-password`; `code` en "Formato de errores"; corregir la nota de `/auth/register/teacher` si menciona el cambio opcional)
- Modificar: `docs/security.md` (el token `pwd_change` y la bandera) y `docs/frontend.md` (ruta `/password/initial`)
- Modificar: `docs/migraciones-produccion.md` (sección nueva al final, antes de la lista de verificación: "Migración incremental: cambio obligatorio de contraseña", con respaldo, `mysql … < phase3-must-change-password.sql`, y la comprobación de que los usuarios existentes quedan en `0`: `SELECT must_change_password, COUNT(*) FROM users GROUP BY must_change_password;`, esperado: solo `0`)

- [ ] **Paso 1: Escribir** las secciones. La guía de migración debe decir expresamente que la migración se aplica **antes** del despliegue.
- [ ] **Paso 2: Verificar** que los ejemplos del documento coinciden con las respuestas reales del servidor (nombres de campos de las tareas 3 y 4).
- [ ] **Paso 3: Commit** `docs: cambio obligatorio de contrasena (API, seguridad y migracion)`.

### Tarea 7: Revisión y verificación funcional

- [ ] **Paso 1:** correr todas las pruebas que no necesitan MySQL: `cd server && node --test tests/errorCode.test.js tests/rateLimiter.test.js tests/password-initial.test.js` (las de base se omiten). Informar con exactitud cuántas pasaron y cuántas se omitieron.
- [ ] **Paso 2:** abrir el PR a `develop` con el título `feat(auth): cambio obligatorio de la contraseña temporal` y un cuerpo que diga qué pruebas **no** se pudieron correr localmente.
- [ ] **Paso 3 (después de mergear y de aplicar la migración a producción, a cargo del líder técnico):** verificar de punta a punta con un docente de prueba nuevo creado desde el personal de gestión: contraseña temporal → pantalla de contraseña nueva → QR → panel; que la temporal ya no sirve; que `must_change_password` quedó en `0`; y que `docente.prueba` (bandera en `0`) sigue entrando con normalidad.
