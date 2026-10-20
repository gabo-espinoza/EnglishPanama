# Grado de la clase: plan de implementación (pieza 2)

> **Para quien ejecute el plan:** SUB-HABILIDAD REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementarlo tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que el docente declare una sola vez el grado de su clase (3.º, 4.º o 5.º → A1.1, A1.2, A1.3), que el servidor filtre por ese nivel todo lo que ve el estudiante, que el gestor de cuentas pueda reiniciarlo, y que haya paneles de docente y estudiante con datos de ejemplo para mostrar el cambio de punta a punta.

**Arquitectura:** `teachers.grade` + `teachers.grade_locked_at`, `activities.level` y `activities.is_example`. Una constante única grado → nivel en `server/src/config/classLevels.js`. El nivel de un estudiante sale de `students.teacher_id → teachers.grade` y se aplica en el servidor en el listado, las preguntas, los intentos, el reto diario y el panel docente. El bloqueo es un `UPDATE … WHERE grade IS NULL` atómico. El reinicio es una acción de personal (`access_manager`) con motivo y auditoría.

**Tecnologías:** Node 20 + Express 4, MySQL 8, `node:test`; React 18 + Vite + Tailwind.

**Diseño:** `docs/superpowers/specs/2026-10-20-primer-ingreso-docente-y-grado-de-clase-design.md` (sección "Pieza 2", "Precisiones tras la revisión del documento" y "Decisiones de implementación de la pieza 2"). Este plan no cubre las piezas 3 y 4.

## Restricciones globales

- Texto del proyecto (interfaz, errores, comentarios, documentos, commits) en español latinoamericano neutro, con "tú", sin voseo. Mensajes de error, comentarios y SQL del servidor sin tildes (estilo actual); textos del cliente con tildes y signos de apertura.
- Commits convencionales **sin** líneas de coautoría ni atribución de IA. Rama `feat/grado-de-la-clase` (ya creada desde `origin/develop` en el worktree `C:\Users\User\Documents\GitHub\EnglishPanama-grado`); el PR apunta a `develop`.
- No compilar ni ejecutar `npm run build`. El cliente no tiene corredor de pruebas: se verifica leyendo el código.
- La migración es manual, incremental, repetible (patrón `information_schema`), compatible hacia atrás, y se aplica en producción **antes** de desplegar.
- Nunca usar la base de producción para pruebas. Las pruebas con base se corren en el contenedor Docker `ep-test-mysql` (MySQL 8.0.46, `127.0.0.1:3306`; si está detenido: `docker start ep-test-mysql`). Contraseñas de `app_user` y `audit_writer` en los archivos `.ep-test-app` y `.ep-test-audit` del scratchpad de la sesión; nunca se imprimen ni se escriben en el repositorio. Variables: `DB_HOST=127.0.0.1 DB_USER=app_user DB_PASSWORD DB_NAME=englishpanama AUDIT_DB_HOST=127.0.0.1 AUDIT_DB_USER=audit_writer AUDIT_DB_PASSWORD AUDIT_DB_NAME=englishpanama_audit JWT_SECRET STAFF_JWT_SECRET STAFF_MFA_KEY (base64 de 32 bytes) NODE_ENV=test`. Correr archivo por archivo con `timeout 90`.
- El nombre `level` ya significa nivel de XP en las respuestas (`/users/me`, ranking, intentos). El nivel MEDUCA se llama **`classLevel`** en JSON y en código; el grado, **`classGrade`**. En la base, la columna de actividades se llama `level` (como en el diseño).
- Grados válidos: exactamente los enteros 3, 4 y 5. Nunca cadenas ("4"), decimales, booleanos ni `null`.

## Decisiones tomadas en este plan (a revisar por el líder técnico)

1. **Motivo del reinicio en la auditoría.** La tabla de auditoría no tiene columna de motivo (`action VARCHAR(60)`, `target VARCHAR(100)`) y un `target` de más de 100 caracteres hace que `record()` pierda el registro en silencio. Se guarda en `target` como `teacher#<id>:<usuario>:motivo=<texto>`; el motivo se valida de 5 a 40 caracteres, sin `|` ni caracteres de control (el hash de la cadena une campos con `|`). No se migra la base de auditoría.
2. **`AppError` gana un tercer parámetro `apiCode`**, igual que `AuthError`, para poder responder `GRADE_LOCKED`.
3. **El reto diario también se filtra por nivel**, para que ningún estudiante vea una pregunta de otro nivel: el conjunto de retos del día sale de `daily_challenges → questions → activities` del nivel de la clase. Sin grado, se trata como conjunto vacío.
4. **El panel docente (`getStudents` y `getDifficultTopics`) filtra por el nivel actual de la clase**, para que tras un reinicio y otro grado no se mezclen intentos de otro nivel.
5. **Marca de ejemplo:** columna `activities.is_example TINYINT(1) NOT NULL DEFAULT 0`. Retirar los ejemplos es `DELETE FROM activities WHERE is_example = 1`, que **borra también sus intentos y retos diarios asociados** (cascada); queda documentado.
6. **`activities.level` es `ENUM('A1.1','A1.2','A1.3') NOT NULL DEFAULT 'A1.1'`.** El valor por defecto es explícito (MySQL ya usaría el primero de forma implícita) y deja a las actividades existentes en `A1.1`. El script de contenido siempre declara el nivel.
7. **Actividad de otro nivel o clase sin grado → 404** `La actividad no existe.` en preguntas e intentos (no revela que existe). El listado devuelve `[]`. El estado vacío se decide en el cliente con `classLevel` de `GET /users/me`.
8. **Reiniciar un grado que no está declarado → 409** `GRADE_NOT_SET`.
9. **El script de contenido en producción** exige además el indicador de línea de comandos `--allow-production`; nunca una variable de entorno.
10. **Paneles del cliente mínimos:** docente (código, selector con aviso y confirmación, estado bloqueado) y estudiante (nivel de la clase, XP, módulos con sus actividades y el estado vacío). Jugar las actividades queda fuera.

## Enfoque de revisión

Casos que el diseño implica y que ninguna tarea de "camino feliz" ejercita. Cada uno tiene su prueba en la tarea indicada:

1. Un estudiante adivina el `id` de una actividad de otro nivel: preguntas e intentos deben dar 404 y no crear intento ni XP (tarea 2).
2. Un estudiante cuyo docente aún no declaró el grado: listado vacío y preguntas/intentos en 404 (tarea 2).
3. Dos `PUT /teacher/class/grade` simultáneos con grados distintos: solo uno gana y el otro recibe 409 `GRADE_LOCKED` (tarea 4).
4. Grado `"4"`, `4.5`, `true`, `0`, `6`, `null`, ausente, o `confirm` distinto de `true`: 400 y nada escrito (tarea 4).
5. Reinicio de grado por un auditor, por un docente o por un estudiante, o con un motivo de más de 40 caracteres o con `|`: se rechaza y no se pierde ni se escribe nada en la auditoría (tarea 5).

---

### Task 1: Constante de niveles, `AppError.apiCode`, esquema y migración

**Archivos:**
- Crear: `server/src/config/classLevels.js`
- Modificar: `server/src/utils/AppError.js`, `server/database/schema.sql` (tablas `teachers` y `activities`)
- Crear: `server/database/migrations/phase4-class-grade.sql`
- Pruebas: `server/tests/classLevels.test.js` (nuevo, sin base de datos); ampliar `server/tests/errorCode.test.js`

**Interfaces:**
- Produce en `classLevels.js`: `GRADE_LEVELS` (`Object.freeze({ 3: 'A1.1', 4: 'A1.2', 5: 'A1.3' })`), `VALID_GRADES` (`[3, 4, 5]`), `LEVELS` (`['A1.1','A1.2','A1.3']`), `isValidGrade(value) -> boolean` (solo enteros `number` de `VALID_GRADES`) y `levelForGrade(grade) -> string | null` (`null` si el grado es `null`, `undefined` o inválido).
- Produce: `new AppError(message, status = 400, apiCode)` con `err.apiCode` opcional; `errorHandler` ya lo expone como `code`.
- Produce en base de datos: `teachers.grade TINYINT UNSIGNED NULL`, `teachers.grade_locked_at TIMESTAMP NULL`, `activities.level ENUM('A1.1','A1.2','A1.3') NOT NULL DEFAULT 'A1.1'`, `activities.is_example TINYINT(1) NOT NULL DEFAULT 0` (con `COMMENT` en español sin tildes, como las columnas existentes).

- [ ] **Paso 1: Escribir las pruebas sin base.** `classLevels.test.js`: `'mapea 3, 4 y 5 a A1.1, A1.2 y A1.3'`; `'isValidGrade acepta solo 3, 4 y 5 como numero entero'` (rechaza `'4'`, `4.5`, `true`, `0`, `6`, `null`, `undefined`, `NaN`); `'levelForGrade devuelve null si no hay grado valido'`; `'la constante esta congelada'` (intentar mutarla no la cambia). En `errorCode.test.js`: `'AppError conserva apiCode y el handler lo expone como code'` (400/409) y `'AppError sin apiCode no agrega code'`.
- [ ] **Paso 2: Verificar que fallan.** `cd server && node --test tests/classLevels.test.js tests/errorCode.test.js` → FALLAN.
- [ ] **Paso 3: Implementar** `classLevels.js` y el tercer parámetro de `AppError`.
- [ ] **Paso 4: Verificar que pasan** el mismo comando.
- [ ] **Paso 5: Esquema y migración.** Añadir las cuatro columnas a `schema.sql` y escribir `phase4-class-grade.sql` con un bloque idempotente por columna (mismo patrón y cabecera que `phase3-must-change-password.sql`). Verificar contra el contenedor: (a) aplicar la migración sobre un esquema viejo (cargar el `schema.sql` de `origin/develop` en una base `ep_old`, insertar un docente, un módulo y una actividad, aplicar la migración dos veces) y comprobar que la actividad queda en `A1.1`, `is_example` en 0 y el docente con `grade` en `NULL`; (b) cargar el `schema.sql` nuevo en una base limpia y comprobar que las columnas coinciden (`SHOW COLUMNS`). Aplicar también la migración a la base `englishpanama` del contenedor para que las pruebas posteriores tengan las columnas. Borrar `ep_old` al terminar.
- [ ] **Paso 6: Commit** `feat(clase): constante de niveles, apiCode en AppError y columnas de grado y nivel`.

### Task 2: El estudiante solo ve actividades de su nivel

**Archivos:**
- Crear: `server/src/services/classLevel.service.js`
- Modificar: `server/src/services/activity.service.js`, `server/src/controllers/activity.controller.js`
- Modificar: `server/tests/isolation.test.js` (sembrar grado y nivel)
- Pruebas: `server/tests/class-grade.test.js` (nuevo; las tareas 3 a 5 lo amplían)

**Interfaces:**
- Consume: `levelForGrade` de `classLevels.js`.
- Produce en `classLevel.service.js`: `async function getClassLevelForStudent(studentId) -> Promise<string | null>` (`SELECT t.grade FROM students s JOIN teachers t ON t.user_id = s.teacher_id WHERE s.user_id = ?`, devuelve el nivel o `null`).
- Cambia: `listActivitiesByModule(studentId, moduleSlug)`, `getActivityQuestions(studentId, activityId)` y `submitAttempt(studentId, activityId, answers)` (este ya recibe `studentId`). El controlador pasa `req.user.id` a las dos primeras.
- Contrato: el listado devuelve `[ { id, title, gameType, sortOrder, isExample } ]` filtrado por `a.level = ?` (arreglo vacío si la clase no tiene grado). `getActivityQuestions` y `submitAttempt` responden 404 `La actividad no existe.` si la actividad no existe, es de otro nivel, o la clase no tiene grado; en `submitAttempt` esa comprobación va **antes** de corregir y de abrir la transacción.

- [ ] **Paso 1: Pruebas con base** en `class-grade.test.js` (se omiten sin MySQL, mismo arranque que `password-initial.test.js`; fijar `process.env.AUTH_RATE_LIMIT_MAX ??= '200'` antes de requerir la app). Siembra: docente A con grado 3, docente B con grado 4, docente C sin grado; un estudiante por docente; un módulo; una actividad con preguntas por cada nivel A1.1 y A1.2. Pruebas: `'el listado devuelve solo actividades del nivel de la clase'`; `'un estudiante de una clase sin grado recibe una lista vacia'`; `'las preguntas de una actividad de otro nivel dan 404'`; `'un intento sobre una actividad de otro nivel da 404 y no crea intento ni suma XP'` (comprobar filas de `attempts` y `students.xp`); `'un estudiante de una clase sin grado no puede pedir preguntas ni crear intentos (404)'`; `'el estudiante del nivel correcto sigue pudiendo jugar (200 y 201)'`; `'isExample refleja la columna'`.
- [ ] **Paso 2: Ajustar `isolation.test.js`** para que el docente A tenga `grade = 3` y `grade_locked_at = NOW()` y la actividad sembrada `level = 'A1.1'`, de modo que sus pruebas de preguntas e intentos sigan validando el aislamiento entre docentes.
- [ ] **Paso 3: Verificar que fallan** las pruebas nuevas.
- [ ] **Paso 4: Implementar** el servicio, los tres cambios del servicio de actividades y el controlador.
- [ ] **Paso 5: Verificar** `class-grade.test.js` e `isolation.test.js` contra el contenedor, y que `api.test.js`, `mfa-teacher.test.js` y `password-initial.test.js` siguen pasando.
- [ ] **Paso 6: Commit** `feat(clase): filtrar por nivel de la clase el listado, las preguntas y los intentos`.

### Task 3: Reto diario, panel docente y perfil con el nivel de la clase

**Archivos:**
- Modificar: `server/src/services/dailyChallenge.service.js`, `server/src/controllers/dailyChallenge.controller.js` (si cambia la firma)
- Modificar: `server/src/services/teacher.service.js`
- Modificar: `server/src/services/user.service.js`
- Pruebas: `server/tests/class-grade.test.js` (ampliar)

**Interfaces:**
- Consume: `getClassLevelForStudent` (tarea 2), `levelForGrade`.
- Cambia: `resolveTodayChallenge` toma el nivel y calcula `dayOfYear % total` sobre las preguntas del reto cuya actividad es de ese nivel (`daily_challenges dc JOIN questions q ON q.id = dc.question_id JOIN activities a ON a.id = q.activity_id WHERE a.level = ? ORDER BY dc.position, dc.id`). Sin grado o sin retos del nivel se comporta como hoy cuando el conjunto de retos está vacío (leer y reutilizar el manejo existente; no inventar un código nuevo).
- Cambia: `teacher.service.getStudents(teacherId)` y `getDifficultTopics(teacherId, limit)` filtran por `a.level` igual al nivel actual de la clase (sin grado: contadores y promedios en 0 y lista de temas vacía; la lista de estudiantes sigue apareciendo).
- Cambia: `GET /users/me` añade `classGrade` (entero o `null`) y `classLevel` (cadena o `null`), tanto para estudiantes (grado de su docente) como para docentes (el propio). No toca la clave existente `level` (XP).

- [ ] **Paso 1: Pruebas con base:** el reto diario de un estudiante de A1.1 nunca devuelve una pregunta de una actividad A1.2 (sembrar retos de ambos niveles); sin grado no devuelve reto de otro nivel; `completeDailyChallenge` sigue funcionando con el conjunto filtrado; `getStudents` cuenta solo intentos del nivel actual (sembrar un intento en una actividad de otro nivel y comprobar que no cuenta); `getDifficultTopics` ídem; `/users/me` trae `classGrade`/`classLevel` para estudiante y docente (con grado y sin grado) y conserva `level` numérico de XP; docente sin grado: `/teacher/students` responde 200.
- [ ] **Paso 2: Verificar que fallan**, implementar, **verificar que pasan** (mismo contenedor).
- [ ] **Paso 3: Commit** `feat(clase): reto diario, panel docente y perfil segun el nivel de la clase`.

### Task 4: Declarar el grado (docente)

**Archivos:**
- Modificar: `server/src/services/teacher.service.js`, `server/src/controllers/teacher.controller.js`, `server/src/routes/teacher.routes.js`
- Pruebas: `server/tests/class-grade.test.js` (ampliar); ampliar la lista de rutas protegidas de `server/tests/mfa-teacher.test.js` (~línea 134) y `server/tests/password-initial.test.js` (~línea 172) con `/teacher/class`

**Interfaces:**
- Consume: `AppError(message, status, apiCode)`, `isValidGrade`, `levelForGrade`, `GRADE_LEVELS`.
- Produce: `async function getClass(teacherId) -> Promise<{ displayName, classCode, classGrade, classLevel, gradeLocked, grades }>` donde `grades` es `[ { grade: 3, level: 'A1.1' }, … ]` tomado de la constante, y `gradeLocked` es `grade_locked_at IS NOT NULL`. `async function declareGrade(teacherId, { grade, confirm }) -> Promise<same shape>`.
- Rutas (después de `router.use(requireAuth, requireRole('teacher'))`): `GET /class` y `PUT /class/grade`.
- Reglas de `declareGrade`: `confirm !== true` → 400 `Debes confirmar que entiendes que el grado no se puede cambiar.`; `!isValidGrade(grade)` → 400 `El grado debe ser 3, 4 o 5.`; `UPDATE teachers SET grade = ?, grade_locked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND grade IS NULL` y revisar `affectedRows`; si es 0, un `SELECT` posterior distingue docente inexistente (404 `El docente no existe.`) de grado ya declarado (409 con `apiCode: 'GRADE_LOCKED'` y mensaje `El grado ya fue declarado y no se puede cambiar. Si fue un error, pide ayuda al gestor de cuentas.`). Responde con la forma de `getClass`.

- [ ] **Paso 1: Pruebas sin base:** `GET /api/teacher/class` y `PUT /api/teacher/class/grade` sin token → 401 (app real, antes de tocar la base).
- [ ] **Paso 2: Pruebas con base:** declarar por primera vez (200, `gradeLocked` verdadero, `classLevel` correcto para 3, 4 y 5); segundo intento con otro grado → 409 `GRADE_LOCKED` y el grado no cambia; con el mismo grado → 409 también; sin `confirm`, con `confirm: false` o `'true'` → 400 y nada escrito; grados inválidos (`"4"`, `4.5`, `true`, `0`, `6`, `null`, ausente) → 400 y nada escrito; **dos peticiones simultáneas con grados distintos: una 200 y otra 409**, y el grado final es el de la ganadora; un estudiante en esas rutas → 403; un token restringido (`mfa_enroll`, `pwd_change`) → 401; `GET /class` antes y después de declarar.
- [ ] **Paso 3: Verificar que fallan**, implementar, **verificar que pasan**.
- [ ] **Paso 4: Commit** `feat(clase): el docente declara el grado una sola vez`.

### Task 5: Reinicio del grado por el gestor de cuentas

**Archivos:**
- Modificar: `server/src/services/staffAccounts.service.js` (empieza con BOM: conservar la línea 1 tal cual), `server/src/controllers/staffAccounts.controller.js`, `server/src/routes/staff.routes.js`
- Pruebas: `server/tests/class-grade.test.js` (ampliar), modelo de `server/tests/mfa-teacher.test.js` (reinicio de MFA)

**Interfaces:**
- Consume: `AppError`, `audit.record`, `pool`.
- Produce: `async function resetTeacherGrade({ teacherId, reason, actorId }) -> Promise<{ id, username, gradeReset: true }>`. Ruta `POST /teachers/:id/reset-grade` con `requireStaff({ area: 'access', roles: ['access_manager'] })` justo debajo de `reset-mfa`.
- Reglas: `id` entero positivo (400 `Identificador de docente invalido.`); `reason` cadena recortada de 5 a 40 caracteres, sin `|` ni caracteres de control (400 `El motivo debe tener entre 5 y 40 caracteres y no puede incluir |.`); el docente debe existir (404 `El docente no existe.`, también si el id es de un estudiante); si `grade` ya es `NULL` → 409 con `apiCode: 'GRADE_NOT_SET'`; `UPDATE teachers SET grade = NULL, grade_locked_at = NULL WHERE user_id = ?`; no toca contraseña, MFA ni `token_version` ni el avance. `audit.record({ actorType: 'staff', actorId, actorRole: 'access_manager', action: 'staff.teacher.reset_grade', target: \`teacher#${id}:${username}:motivo=${reason}\`, outcome: 'ok' })`. El `target` total nunca supera 100 caracteres con estas validaciones (usuario de hasta 30).

- [ ] **Paso 1: Pruebas con base** (siguiendo `mfa-teacher.test.js`): sin token → 401; auditor → 403; docente o estudiante con su token de plataforma → 401/403 (no entra a rutas de gestión); id inválido → 400; id inexistente o de un estudiante → 404; sin motivo, motivo de 4 caracteres, de 41 caracteres o con `|` → 400 y **sin fila de auditoría nueva**; grado no declarado → 409 `GRADE_NOT_SET`; éxito → 200, `grade` y `grade_locked_at` en `NULL`, y la auditoría tiene `staff.teacher.reset_grade` con el `target` esperado; tras el reinicio el docente puede declarar otro grado y sus estudiantes ven el nuevo nivel; la contraseña, el MFA y `token_version` del docente quedan iguales; la cadena de auditoría (`audit.verify()`) sigue `ok`.
- [ ] **Paso 2: Verificar que fallan**, implementar, **verificar que pasan**.
- [ ] **Paso 3: Commit** `feat(gestion): el gestor de cuentas puede reiniciar el grado de una clase`.

### Task 6: Contenido de ejemplo y script de siembra

**Archivos:**
- Modificar: `server/scripts/seed-demo-content.js`, `server/scripts/seed-demo-student.js`, `server/env.example` (si documenta algo), `docs/` se actualiza en la tarea 8
- Pruebas: `server/tests/seed-content.test.js` (nuevo; patrón `spawnSync` de `staff-hardening.test.js`)

**Interfaces:**
- Cambia el guardia: con `NODE_ENV=production` el script solo corre si recibe `--allow-production` en la línea de comandos; sin él, termina con error que menciona `NODE_ENV=production` y `--allow-production`. Una variable de entorno nunca lo habilita.
- Contenido: las 6 actividades actuales quedan como `A1.1` con `is_example = 1`. Se añaden actividades de ejemplo de `A1.2` y `A1.3`, una por módulo y nivel (3 por nivel), con 3 preguntas cada una, de inglés de primaria acorde al nivel y con un prefijo reconocible en el título (`[Ejemplo A1.2] …`). La idempotencia pasa a ser por `(module_id, title, level)`. Todos los `INSERT INTO activities` declaran `level` e `is_example`. El reto diario sigue atado por `prompt`; incluir en el conjunto al menos una pregunta de cada nivel.
- `seed-demo-student.js`: el docente demo queda con `grade = 3` y `grade_locked_at = CURRENT_TIMESTAMP` para que `estudiante01` vea contenido sin pasos manuales (script solo de desarrollo; sigue negándose en producción).

- [ ] **Paso 1: Pruebas sin base** (`seed-content.test.js`): sin `--allow-production` y con `NODE_ENV=production` el script falla y el mensaje menciona `NODE_ENV=production` y `--allow-production`; con la variable de entorno `ALLOW_PRODUCTION=1` (u otra) y sin el indicador, sigue fallando; con el indicador y sin variables de base de datos falla por la base, **no** por el guardia (la prueba solo comprueba que el guardia dejó pasar). Pruebas con base (se omiten sin MySQL): después de correr el script contra el contenedor hay actividades de los tres niveles, todas con `is_example = 1`, y volver a correrlo no duplica filas.
- [ ] **Paso 2: Verificar que fallan**, implementar, **verificar que pasan**; correr el script dos veces contra el contenedor y contar filas por nivel.
- [ ] **Paso 3: Commit** `feat(seed): actividades de ejemplo por nivel y guardia explicito para produccion`.

### Task 7: Paneles de docente y de estudiante

**Archivos:**
- Crear: `client/src/api/teacher.js`, `client/src/api/student.js`
- Modificar: `client/src/pages/teacher/TeacherHome.jsx`, `client/src/pages/student/StudentHome.jsx`
- Posible: un componente pequeño `client/src/components/TopBar.jsx` (nombre de usuario y botón "Cerrar sesión", que llama a `clearSession()` y navega a `/login`)

**Interfaces:**
- Produce en `api/teacher.js`: `getClass(token)` → `GET /teacher/class`; `declareGrade(token, grade)` → `PUT /teacher/class/grade` con `{ grade, confirm: true }`. En `api/student.js`: `getProfile(token)` → `GET /users/me`; `getActivities(token, moduleSlug)` → `GET /activities/:moduleSlug`. Mismo patrón que `api/auth.js`; el token sale de `getSession()`.
- Docente: tarjeta con "Tu código de clase" (en grande, con texto "Compártelo con tus estudiantes para que se registren."). Sin grado declarado: botones "3.º grado · A1.1", "4.º grado · A1.2", "5.º grado · A1.3" (tomados de `grades` de la respuesta, no escritos a mano); al elegir uno aparece el aviso destacado "Este nivel no se puede cambiar durante todo el periodo escolar. Si te equivocas, deberás pedir ayuda al gestor de cuentas.", la casilla "Entiendo que no podré cambiarlo" (el botón "Confirmar" queda deshabilitado hasta marcarla) y el botón de confirmar con el grado elegido. Con grado declarado: se muestra el grado y el nivel con la marca de bloqueado y el texto de que, si fue un error, abra un ticket con el gestor de cuentas. Un 409 `GRADE_LOCKED` recarga el estado y muestra el grado ya declarado; los demás errores se muestran en línea. Decisiones por `err.status`/`err.code`.
- Estudiante: encabezado con su nivel de la clase (por ejemplo "3.º grado · A1.1") y su XP/nivel de XP tomados de `/users/me` (clave `level` numérica; el grado sale de `classGrade`/`classLevel`). Si `classLevel` es `null`: estado vacío "Tu docente aún no ha elegido el nivel de la clase.". Si no: tres secciones (Vocabulary, Grammar y Reading) que cargan sus actividades con `getActivities`; cada actividad muestra su título y, si `isExample`, una etiqueta "Ejemplo". Sin actividades en un módulo: texto "Aún no hay actividades en este módulo.". Jugar las actividades queda fuera de este plan.
- Estilo: tarjetas `bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]`, botones y entradas con las clases de `index.css` (`auth-button`) y los colores `blue-*` ya definidos (turquesa de marca). Sin `AuthBackground` (es solo para autenticación). Texto neutro con "tú".

- [ ] **Paso 1: Implementar** los módulos de API, los dos paneles y la barra superior, siguiendo `SetInitialPassword.jsx` en estados de carga/error.
- [ ] **Paso 2: Verificar sin compilar:** leer el diff completo, `rg -n "classLevel|classGrade|declareGrade|getActivities" client/src` para comprobar que los nombres coinciden con las respuestas reales del servidor (`docs/api.md` y las pruebas de las tareas 2 a 4), y que no hay voseo.
- [ ] **Paso 3: Commit** `feat(client): paneles de docente y de estudiante con el grado de la clase`.

### Task 8: Documentación y guía de migración

**Archivos:**
- Modificar: `docs/api.md` (lista de códigos de error: `GRADE_LOCKED` y `GRADE_NOT_SET`; `GET /users/me` con `classGrade` y `classLevel`; sección "Actividades" con `isExample`, el filtro por nivel y los 404; "Panel docente" con `GET /teacher/class` y `PUT /teacher/class/grade`; "Personal de gestión" con `POST /staff/teachers/:id/reset-grade` y su motivo), `docs/backend.md` (archivos nuevos), `docs/security.md` (filtro por nivel en el servidor; que el motivo del reinicio va en el `target` de la auditoría), `docs/frontend.md` (los dos paneles)
- Modificar: `docs/migraciones-produccion.md`: sección nueva "14. Migración incremental: grado de la clase" antes de "Lista de verificación", con el mismo formato que la sección 13 (respaldo, copiar `phase4-class-grade.sql`, aplicar con `sudo mysql englishpanama < …`, verificación con `SHOW COLUMNS FROM teachers LIKE 'grade%'`, `SHOW COLUMNS FROM activities LIKE 'level'` y `SELECT level, COUNT(*) FROM activities GROUP BY level;`, "se aplica ANTES de desplegar", rollback), más: cómo cargar los ejemplos en producción (`node scripts/seed-demo-content.js --allow-production`, **acción manual del líder técnico, no del despliegue**) y cómo retirarlos (`DELETE FROM activities WHERE is_example = 1;` con la advertencia de la cascada); y una línea en la lista de verificación.

- [ ] **Paso 1: Escribir** las secciones leyendo antes el código real; cada campo, código de estado y código de error debe coincidir con el servidor (tareas 2 a 5).
- [ ] **Paso 2: Verificar** con `rg -n "classGrade|classLevel|GRADE_LOCKED|GRADE_NOT_SET|reset-grade|is_example|allow-production" docs` que todo está documentado y sin contradicciones con el código.
- [ ] **Paso 3: Commit** `docs: grado de la clase (API, seguridad, migracion y datos de ejemplo)`.

### Task 9: Revisión y verificación funcional

- [ ] **Paso 1:** correr cada archivo de prueba del servidor, uno por uno con `timeout 90`, contra el contenedor, y la suite completa una vez con `timeout 300 node --test` (ahora termina). Informar con exactitud pasan / fallan / omitidas.
- [ ] **Paso 2:** abrir el PR a `develop` con título `feat(clase): grado de la clase, filtro por nivel y paneles de docente y estudiante` y un cuerpo que diga qué se probó, el orden **migración antes de desplegar**, y cómo se cargan los ejemplos en producción.
- [ ] **Paso 3 (después de mergear, aplicar la migración y desplegar; a cargo del líder técnico):** cargar los ejemplos en producción con el indicador explícito; entrar como docente nuevo, elegir el grado y ver el aviso y el bloqueo; registrar un estudiante con el código y ver solo las actividades de su nivel; probar el reinicio desde el personal de gestión.
