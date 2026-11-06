# Pantallas de gestión: contrato para las cinco páginas

Rama `feat/staff-pantallas-gestion` (desde `origin/develop`). Cada página de `client/src/pages/staff/` se reemplaza **completa** por su agente; no se tocan `api/staff.js`, `StaffLayout.jsx` ni `App.jsx`; `ui.jsx` se amplió en la revisión (`useAsync` descarta los datos cuando cambian las `deps` y los conserva ante un `reload()` fallido). Fuente de verdad: `server/src/config/staffRoles.js`, las rutas `server/src/routes/{content,game,reports}.routes.js` y los servicios `server/src/services/{content,game,reports}.service.js`.

## Convenciones (todas las páginas)

- Español neutro latinoamericano con "tú", con tildes, ¿ ¡ y "n.º"; sin voseo ni inglés suelto en la interfaz (los valores del servidor como `draft` o `in_review` se traducen con un mapa de etiquetas).
- Sin datos falsos: nada de `MOCK_*`, arreglos de ejemplo, `setTimeout` que simule respuestas ni `alert()`. Todo control debe tener su endpoint; si no lo tiene, se omite.
- Sesión de staff con `useStaff()` → `{ token, id, username, role, area, handleAuthError, logout }`. En cada `catch`: `if (handleAuthError(err)) return;` (el 401 cierra la sesión y lleva al login).
- Reutiliza `./ui`: `useAsync` (carga segura en StrictMode con bandera `active`), `useMounted`, `PageHeader`, `ErrorBanner`, `EmptyState`, `LoadingRows`, `Notice`, `StatusBadge`, `ConfirmPanel`, `Field`, `errorMessage`, `formatDate(Time)` y las clases `CARD`, `BTN_*`, `FIELD`, `LABEL`. Léelo: tiene el modo de uso en el encabezado. Si necesitas un `useEffect` propio, usa la bandera `active` con limpieza.
- Estados de carga, error (con "Reintentar") y vacío en cada lista; botones deshabilitados mientras hay una petición en curso (evita doble envío); confirmación (`ConfirmPanel`) antes de acciones destructivas o irreversibles (borrar, archivar, rechazar, ocultar alias, quitar de la lista de retos, resolver/descartar reportes).
- Tras una acción exitosa, vuelve a pedir los datos (`reload()`) en lugar de editar el estado a mano.
- Funciona a 375 px: tablas dentro de `overflow-x-auto`, formularios en una columna, botones con `flex-wrap`. Etiquetas `<label htmlFor>`, `role="alert"/"status"`, `aria-label` en botones solo-icono.
- Tailwind: existen `brand-100` a `brand-600` (no `brand-50` ni `brand-700`). `animate-fade-in` existe. Sin nuevas dependencias.
- Los mensajes de error del servidor llegan **sin tildes** y en español; para los casos esperados usa textos propios por estado/código con `errorMessage(err, { 409: '...' }, { INVALID_STATE: '...' })`. El 403 por defecto es `NO_PERMISSION`. Un `status` 0 = sin conexión (el mensaje ya viene listo).
- Rate limit: solo hay el general de `/api` (120 peticiones por minuto por IP); un 429 muestra el mensaje del servidor. No hay límite propio por endpoint de staff.
- Ningún endpoint devuelve ni debe mostrar datos personales: de los reportes solo se muestra el rol de quien reportó. `reporterAlias` (el usuario de acceso de un menor) y `reporterActive` llegan en la respuesta pero NO se muestran (mínimo privilegio).

## Matriz rol → sección (ya aplicada en `StaffLayout.jsx`)

| Rol | Sección | Ruta | Página |
|---|---|---|---|
| `content_manager` | `content` | `/staff/content` | `ContentManagement` |
| `content_reviewer` | `review` | `/staff/review` | `ContentReview` |
| `game_manager` | `game` | `/staff/game` | `GameManagement` |
| `moderator` | `moderation` | `/staff/moderation` | `Moderation` |
| `support` | `support` | `/staff/support` | `SupportStaff` |

El `content_manager` recibe además los reportes **escalados** (`GET /api/staff/reports`); no tiene sección aparte: se incluye como bloque dentro de `ContentManagement`. Las páginas no necesitan comprobar el rol para entrar (lo hace `RequireSection`), pero `ContentManagement` y `ContentReview` ya son de un solo rol cada una.

## Hallazgos del código (diferencias con `docs/api.md` o detalles no documentados)

1. **No existe un endpoint de "cola de revisión".** El revisor usa `listContentActivities(token, { status: 'in_review' })`; el servidor además le oculta los `draft` y `archived`.
2. **Las listas devuelven arreglos planos** (`[...]`), no `{ rows }` ni `{ reports }`: actividades, alias, retos y reportes.
3. **`GET /staff/reports`**: el `content_manager` solo ve `status = escalated`; si pide otro `status` el resultado queda vacío (sin error). Pedir un `kind` que no sea el propio del rol → 403. Máximo 200 filas, más recientes primero. `reporterActive` es booleano.
4. **`PATCH /staff/reports/:id` no comprueba el tipo del reporte**: un `support` podría decidir un reporte `inappropriate` conociendo su id. La interfaz solo muestra su propia bandeja, así que no se llega a eso. `PATCH /staff/reports/:id` solo decide sobre la bandeja del rol: `support` y `moderator` únicamente sobre reportes `open` de su tipo; `content_manager` solo sobre los `escalated`. Un reporte fuera de la bandeja responde 409 `REPORT_CLOSED` si es del tipo del rol pero ya fue atendido, y 404 ("El reporte no existe.") si es de otro tipo, está fuera de la bandeja o no existe (no revela si el id existe en otra bandeja). Por eso no se ofrece "Escalar", "Resolver" ni "Descartar" a `support`/`moderator` sobre filas que no sean `open`.
5. **`PUT /staff/game/rules`**: es parcial: solo cambian las claves enviadas y las omitidas conservan lo guardado (se guardan de forma atómica; una clave desconocida o un cuerpo vacío dan 400). La pantalla envía igualmente las tres. Los límites son enteros: `xpPerCorrect` 1 a 50, `xpPerLevel` 10 a 1000, `dailyChallengeXp` 1 a 100 (400 si no).
6. **Reto diario.** `GET /staff/game/questions` busca preguntas (solo de actividades `published` y de tipos compatibles: se excluye `sentence_order`) con filtros `module`, `level`, `q` y `limit`, sin respuesta correcta ni opciones. `POST /staff/game/daily-challenges` responde 404 (la pregunta no existe), 409 `QUESTION_NOT_PUBLISHED`, 409 `QUESTION_TYPE_NOT_SUPPORTED` (`sentence_order`: la respuesta es un orden y el estudiante responde con una sola opción) y 409 `QUESTION_ALREADY_IN_POOL`; la verificación y el alta son atómicas (transacción que bloquea la fila de la pregunta). Memoria, Opción múltiple y Completar espacios guardan una opción como respuesta y sí sirven. El listado devuelve `activityStatus`; muéstralo.
7. `POST` sin cuerpo útil (`submit`, `withdraw`, `archive`, `approve`, `revision`) ya envían `{}` desde `api/staff.js`.
8. Los errores de validación (400) traen el mensaje del servidor sin tildes; muéstralos tal cual si no tienes uno propio.

---

## 1. Contenido: `ContentManagement.jsx` (rol `content_manager`)

**Ruta:** `/staff/content`. **Funciones de `api/staff.js`:** `listContentActivities`, `getContentActivity`, `createContentActivity`, `updateContentActivity`, `deleteContentActivity`, `addContentQuestion`, `updateContentQuestion`, `deleteContentQuestion`, `submitContentActivity`, `withdrawContentActivity`, `createContentRevision`, `archiveContentActivity` y, para el bloque de reportes escalados, `listReports` y `decideReport`.

**Lista** (`listContentActivities(token, { status, module, level })`, filtros opcionales): `id`, `title`, `moduleSlug` (`vocabulary` = Vocabulario, `grammar` = Gramática, `reading` = Lectura), `gameType` (`memory` = Memoria, `multiple_choice` = Opción múltiple, `sentence_order` = Ordenar oraciones, `fill_blank` = Completar espacios), `level` (`A1.1`, `A1.2`, `A1.3`), `status` (`draft` = Borrador, `in_review` = En revisión, `published` = Publicada, `archived` = Archivada), `reviewNote` (nota del rechazo del revisor, visible en borradores devueltos), `replacesId` (si es una revisión de otra), `updatedAt`.

**Detalle** (`getContentActivity`): lo anterior más `passageText` y `questions: [{ id, topic, prompt, options[], correctAnswer }]`. `correctAnswer` es texto (una de las opciones) o, en `sentence_order`, un arreglo con el orden.

**Acciones y estado en que valen** (todas devuelven la actividad completa salvo borrar y revisión):

| Acción | Función | Estado requerido | Notas |
|---|---|---|---|
| Crear borrador | `createContentActivity(token, { moduleSlug, title, gameType, level, passageText? })` | n/a | `title` ≤ 100; `passageText` ≤ 4000 (opcional, útil en `reading`); sin `<`, `>` ni caracteres de control; devuelve la actividad nueva (`id`) |
| Editar datos | `updateContentActivity(token, id, campos)` | `draft` | parcial; los datos del tipo de juego condicionan las preguntas ya creadas: avisa antes de cambiar `gameType` si ya tiene preguntas |
| Borrar | `deleteContentActivity` | `draft` | devuelve `{ deleted: true }`; con confirmación |
| Agregar / editar pregunta | `addContentQuestion(token, id, q)`, `updateContentQuestion(token, id, qid, q)` | `draft` | `q = { topic ≤ 50, prompt ≤ 500, options (2 a 8 textos ≤ 120), correctAnswer }`; la regla de `correctAnswer`: debe coincidir con una opción (el servidor compara con `normalizeAnswer`: quita espacios en los extremos y pasa a minúsculas; las tildes cuentan, "café" y "cafe" son distintas); en `sentence_order` es un arreglo de ≥ 2 elementos, todos presentes en `options` |
| Borrar pregunta | `deleteContentQuestion(token, id, qid)` | `draft` | 404 si la pregunta no existe |
| Enviar a revisión | `submitContentActivity` | `draft` | 409 `NO_QUESTIONS` si no hay preguntas; valida de nuevo cada pregunta (400 si alguna es inválida) |
| Retirar de revisión | `withdrawContentActivity` | `in_review` | vuelve a `draft` |
| Crear revisión | `createContentRevision` | `published` | copia la publicada a un **borrador nuevo** (otro `id`, `replacesId` = original); al aprobarse, la original queda archivada. Navega al borrador nuevo |
| Archivar | `archiveContentActivity` | `published` | con confirmación |

**Errores:** `409 INVALID_STATE` = la actividad ya cambió de estado (recarga y avisa); `404` = la actividad o la pregunta ya no existe (recarga la lista); `403` = permiso (`NO_PERMISSION`); `400` = validación (muestra el mensaje). Las actividades `in_review`, `published` y `archived` son de solo lectura en la interfaz (solo los botones de arriba).

**Bloque "Reportes escalados"** (`listReports(token)` sin filtros; el servidor ya limita al `content_manager` a `escalated`): `id`, `kind` (`error` = Error, `inappropriate` = Inadecuado), `activityId`, `activityTitle`, `questionId`, `note` (≤ 300), `reporterRole` (`student` = Estudiante, `teacher` = Docente), `createdAt` (`reporterAlias` y `reporterActive` llegan pero no se muestran). Acciones con `decideReport(token, id, decision)`: solo `resolve` (Resolver) y `dismiss` (Descartar). 409 `REPORT_CLOSED` = ya fue atendido (recarga). El `activityId` permite abrir el detalle de esa actividad (para corregirla con una revisión).

## 2. Revisión: `ContentReview.jsx` (rol `content_reviewer`)

**Ruta:** `/staff/review`. **Funciones:** `listContentActivities`, `getContentActivity`, `approveContentActivity`, `rejectContentActivity`. Solo lectura de contenido más aprobar o rechazar.

**Cola:** `listContentActivities(token, { status: 'in_review' })` (más filtros opcionales `module` y `level`). Campos como en la lista de contenido; muestra `id`, `title`, módulo, tipo de juego, nivel, `updatedAt`, y si `replacesId` no es nulo, "Revisión de la actividad n.º X". Opcionalmente una pestaña "Publicadas" con `status: 'published'`, solo lectura.

**Detalle para decidir:** `getContentActivity(token, id)` con `passageText` y todas las preguntas, opciones y `correctAnswer` (el revisor las ve; es parte de su trabajo).

**Acciones:**

- Aprobar: `approveContentActivity(token, id)` (con confirmación). Errores: `409 INVALID_STATE` (ya no está en revisión: recarga la cola); `403` con `code: 'SAME_AUTHOR'` ("No puedes aprobar tu propio contenido"; para tu cuenta es solo una salvaguarda: ten el texto); `404` (ya no existe).
- Rechazar: `rejectContentActivity(token, id, note)`; `note` obligatoria, 1 a 500 caracteres, sin `<`, `>` ni caracteres de control (valida en el cliente con el mismo criterio y muestra el contador). `400` si es inválida; mismos 409/404. El gestor verá la nota como `reviewNote` y la actividad vuelve a `draft`.

## 3. Juego: `GameManagement.jsx` (rol `game_manager`)

**Ruta:** `/staff/game`. **Funciones:** `getGameRules`, `updateGameRules`, `listGameAliases`, `setAliasHidden`, `listDailyChallenges`, `addDailyChallenge`, `removeDailyChallenge`.

- **Reglas de XP:** `getGameRules` → `{ xpPerCorrect, xpPerLevel, dailyChallengeXp }`. Formulario de tres números enteros: puntos por respuesta correcta (1 a 50), puntos por nivel (10 a 1000), puntos del reto diario (1 a 100). `updateGameRules(token, { ...los tres })` devuelve las reglas guardadas; 400 con el mensaje del servidor si alguno está fuera de rango (valida antes en el cliente). Muestra "Guardado" con `Notice` ok solo tras la respuesta real.
- **Alias del ranking:** `listGameAliases` → `[{ studentId, alias, xp, aliasHidden }]`, ordenados por XP. Nunca nombres reales. Botón "Ocultar" / "Mostrar" por fila: `setAliasHidden(token, studentId, true|false)` devuelve `{ studentId, aliasHidden }`; 404 = el estudiante ya no existe (recarga). Con confirmación al ocultar. El efecto: el ranking muestra "Jugador oculto" y conserva la posición. Filtro de texto local por alias (sobre lo ya cargado) opcional.
- **Reto diario (lista de retos; en la interfaz no se usa la palabra "pool"):** `listDailyChallenges` → `[{ id, position, questionId, prompt, activityTitle, activityStatus }]`. Agregar: `addDailyChallenge(token, questionId, position?)` (`questionId` entero positivo, `position` entero positivo opcional; si se omite va al final); 201 `{ id, questionId, position }`; 404 = la pregunta no existe; 400 = datos inválidos; 409 `QUESTION_NOT_PUBLISHED`, `QUESTION_TYPE_NOT_SUPPORTED` o `QUESTION_ALREADY_IN_POOL`. Quitar: `removeDailyChallenge(token, id)` con confirmación; 404 = ya no existe. Muestra `activityStatus` (solo `published` llega a los estudiantes, ver hallazgo 6). El buscador `listGameQuestions` alimenta la elección.

## 4. Moderación: `Moderation.jsx` (rol `moderator`)

**Ruta:** `/staff/moderation`. **Funciones:** `listReports`, `decideReport`.

`listReports(token, { status })`: el servidor ya limita a `kind = inappropriate`; filtro por estado (`open` = Abierto, `escalated` = Escalado, `resolved` = Resuelto, `dismissed` = Descartado); valor por defecto de la vista: `open`. No envíes `kind` (solo se acepta `inappropriate`; cualquier otro da 403). Campos: `id`, `activityId`, `activityTitle`, `questionId`, `note`, `reporterRole` (solo se muestra el rol; `reporterAlias` y `reporterActive` no), `status`, `createdAt`, `handledBy` (número de quien lo atendió, solo informativo). Muestra "Sin nota" si `note` es nulo.

Acciones solo sobre reportes `open` (el moderador ya no decide los `escalated`): `decideReport(token, id, 'escalate' | 'resolve' | 'dismiss')` → `{ id, status }`. Escalar (envía el reporte al gestor de contenido), Resolver y Descartar, todas con confirmación. `409 REPORT_CLOSED` = ya fue atendido (recarga); `404` = ya no está en tu bandeja de abiertos o no existe (recarga). `403` = decisión no permitida.

## 5. Soporte: `SupportStaff.jsx` (rol `support`)

**Ruta:** `/staff/support`. **Funciones:** `listReports`, `decideReport`. Es la misma mecánica que Moderación, con `kind = error` (errores en el contenido: respuesta mal, texto con falta, etc.) y las mismas decisiones (`escalate`, `resolve`, `dismiss`). No existen otros endpoints de soporte (no hay tickets ni mensajes a usuarios): no inventes secciones para ellos. Se puede reutilizar el diseño de Moderación, pero cada archivo es independiente (no importes de la otra página; si hay lógica común, duplica lo mínimo o pídele al coordinador una pieza en `ui.jsx`).

---

## Verificación sin compilar

`node C:\Users\User\AppData\Local\Temp\claude\7dd50c270b2bd800\d39b387d-d295-4b4c-86db-519dd1816734\scratchpad\syntaxcheck\check.mjs <ruta-del-worktree> [archivo-relativo-a-client/src ...]` revisa la sintaxis de cada `.js/.jsx` y empaqueta `main.jsx` para comprobar que todos los imports (y exportaciones con nombre) resuelven. No ejecutes `npm install`, `npm run build` ni servidores.
