# Revisión del PR #26 (entrega del backend, fases 1, 2, B y C)

Fecha: 5 de noviembre de 2026. Revisado: `develop` en `a015c9e` (incluye el #26, +2.404/−134 en 59 archivos), contra `main` en `c4eca4a`.
Método: tres revisiones independientes **por lectura del código** (autenticación y seguridad; contenido, reportes y juego; flujo del estudiante y regresiones). Después, con Docker arriba, se corrió la suite completa y se probaron las migraciones (ver «Verificación empírica»).

## Veredicto

**Apto con condiciones. No desplegar todavía.** No hay hallazgos críticos de seguridad ni escalada de privilegios desde estudiante o docente hacia gestión. **No se perdió ni se debilitó nada de lo construido antes** (cambio obligatorio de contraseña, grado de la clase y filtro por nivel, reto diario con respuesta y su orden de bloqueos). Las 13 líneas netas que salieron de `dailyChallenge.service.js` son helpers de fecha movidos a `utils/day.js`.

## Antes de desplegar (bloqueantes)

| # | Qué | Dónde |
|---|---|---|
| B1 | **`schema.sql` no se actualizó.** Una base creada solo con `schema.sql` no tiene `activities.status`, `students.alias_hidden` ni `content_reports`; fallan el listado de actividades, el reto diario y el ranking (`Unknown column`). El README de instalación (`server/README.md:30-32`) tampoco menciona las migraciones | `server/database/schema.sql`, `server/README.md` |
| B2 | **Alcance de los reportes:** `PATCH /api/staff/reports/:id` no limita la decisión a la bandeja del rol. `support` puede descartar reportes de `moderator`, y `content_manager` puede resolver reportes que nadie le escaló. Los ids son secuenciales | `reports.service.js:107-128` |
| B3 | **`reportLimiter` va antes de `requireAuth`**: cuenta por IP, no por cuenta. Todo un salón comparte 5 reportes por hora, y cualquiera sin token puede agotar la cuota de la escuela. `docs/api.md` promete "por cuenta" | `reports.routes.js:18` |
| B4 | **`PUT /api/staff/game/rules` parcial:** un cuerpo con una sola clave resetea las demás a los valores por defecto, y las tres escrituras no son atómicas | `game.service.js:22,46-48` |
| B5 | **No habilitar `uq_activity (module_id, title, level)` de `phase6-hardening.sql`:** choca con el flujo de revisión, que copia título, módulo y nivel; además no se puede crear si ya hay revisiones aprobadas | `phase6-hardening.sql` |
| B6 | **Anti-replay del TOTP falla "abierto" en silencio:** cualquier error del `UPDATE` (no solo la columna ausente) acepta el código. Si se omite la migración `phase6-totp-replay.sql`, no hay anti-replay y nadie se entera | `auth.service.js:161-164`, `staffAuth.service.js:72-75` |
| B7 | **El bloqueo de 3 intentos / 10 s no se aplica en `mfa/setup` ni `mfa/confirm`**, aunque el PR dice que sí: solo cuentan el fallo, nunca consultan `is_locked`. El límite real es `authLimiter` (20 fallos por IP cada 15 min) | `auth.service.js:388-454` |
| B8 | **Regresión parcial del timing equalizado:** el login fallido escribe en la auditoría solo si la cuenta existe; el usuario inexistente no. La diferencia de milisegundos permite enumerar cuentas. En staff sí audita ambos casos | `auth.service.js:270-300` |

## Importantes

- **Alias oculto rompe el cliente desplegado:** `ranking.service.js:33` devuelve `'Jugador oculto'` para todos los ocultos, incluido el propio estudiante. `StudentHome.jsx:492,495` marca "Tú" comparando alias y usa `key={student.alias}`: el estudiante oculto pierde el resaltado y hay claves duplicadas. Arreglo: `isMe` calculado en el servidor y `key` por posición.
- **El "día" del reto es ahora UTC** (`utils/day.js`). En Panamá (UTC−5, sin horario de verano) el reto cambia a las **19:00** locales y se puede completar dos veces en un mismo día panameño. Decisión pendiente: fijar la zona de Panamá o documentar. No se verificó con qué zona corría la VM antes.
- **Las reglas de XP editables se aplican a medias:** `activity.service` y `dailyChallenge.service` usan la regla configurada; `/users/me`, `/ranking` y `/teacher/students` siguen con el valor por defecto de 100. Si un `game_manager` cambia `xpPerLevel`, las pantallas se contradicen y cambia el nivel de todos retroactivamente.
- **`removeDailyChallenge` borra por cascada los registros de `daily_completions`:** quien ya completó el reto hoy puede repetirlo y cobrar XP otra vez.
- **El reto de hoy depende del tamaño del pool filtrado:** archivar una actividad o tocar el pool a media jornada cambia la pregunta; el estudiante ve una, responde, y el servidor corrige contra otra, gastando un intento.
- **Límite del reto diario (10):** en memoria (se reinicia con cada reinicio de PM2), cuenta **todas** las peticiones (también 400, 409 y aciertos), se reinicia 24 h después del primer golpe y no por día del reto. Con 3 o 4 opciones, 10 intentos siguen permitiendo adivinar. Bloquea el flujo de la demo (completar cada día).
- **Contenido:** `archived` es terminal y de una sola persona (sin `restore`); `revision()` permite varias revisiones abiertas de la misma actividad y se pueden publicar dos copias; `cleanText` rechaza saltos de línea y tabulaciones, así que un texto de Reading no puede tener párrafos; `GET /staff/content/activities/:id` deja leer cualquier estado por id (con `correctAnswer`) a un revisor.
- **`setAliasHidden` con `hidden` ausente o no booleano muestra el alias** (debería exigir un booleano).
- **Anti-replay incompleto:** `mfa/setup` usa `codeMatches` y no consume el contador (un código ya usado sirve 30 a 90 s más para reemplazar el autenticador); `confirmMfa` tampoco lo consume.
- **Privacidad de menores en los reportes:** la nota libre (hasta 300 caracteres) de un niño la leen `support`, `moderator` y `content_manager`, con el alias real aunque esté oculto; no hay retención ni borrado, `reporter_id` es `ON DELETE CASCADE`, y la lectura de la bandeja no se audita. Un estudiante puede confirmar que existe una actividad de otro nivel (404 frente a 201).
- **`POST /auth/logout` revoca todas las sesiones de la cuenta** (`token_version + 1`). Afecta a las cuentas `demo.*` compartidas y obliga al frontend a llamarlo (el cliente actual no lo hace).
- **Un código TOTP vale una sola vez por cuenta:** recargar y volver a entrar dentro de 30 s con el mismo código da "Codigo incorrecto." y cuenta como fallo (tres seguidos bloquean 10 s). Afecta a la página de códigos de la demo.
- **`docs/specs/staff-fase-b.md` no existe en `develop`:** el PR dice que se implementaron las 3 decisiones abiertas del spec, pero el archivo vive en la rama `docs/spec-fase-b` (sin PR), así que nadie puede confirmarlas.

## Menores (resumen)

IDs sin validar (`NaN` termina en 500 y deja `activity:NaN` en la auditoría); `outcome: 'denied'` para todo error en la auditoría de contenido; sin valores anterior y nuevo al cambiar reglas de juego; `AUDIT_DB_PORT` ausente; `assertAuthConfig` no comprueba `STAFF_JWT_SECRET !== JWT_SECRET` y solo actúa con `NODE_ENV=production` exacto; validación de nombre sin tope de bytes (bcrypt 72); `createTeacher` no usa `validateDisplayName`; listados sin paginación y `LIMIT 200` en la bandeja de reportes; `getRules()` hace 3 consultas por llamada, sin caché; cambios de `package-lock.json` (`body-parser` 1.20.8→1.20.9 y `qs` 6.16.0→6.16.2) sin justificar; el conteo del panel docente no filtra por `published`.

## Pruebas del PR

Las nuevas (`answers`, `day`, `ranking`, `totp`, `xp.service`, `display-name`, `content-lifecycle`, `fase-c`…) son de **funciones puras**: no cubren logout, anti-replay contra la base, bloqueo en setup/confirm, el alcance de los reportes, las transiciones del ciclo de contenido ni los límites. Una de ellas (`totp-replay.test.js`) simula el `WHERE` en JavaScript y pasaría con una implementación incorrecta. Los tests nuevos de `session` y `mfa-platform` exigen la columna `mfa_last_counter`.

## Migraciones (lectura, sin ejecutar)

- `phase5-content-review.sql`: idempotente, sintaxis válida de MySQL 8, `status` con `DEFAULT 'published'`: las filas existentes, **incluidas las 12 actividades de ejemplo**, quedan publicadas y los estudiantes no pierden contenido; los `INSERT` del código viejo siguen funcionando. Agregar las FK reconstruye `activities` y bloquea escrituras unos instantes: aplicar en un momento tranquilo.
- **Rollback:** el código viejo no filtra por `status`; si se vuelve a `main` con filas `draft`, `in_review` o `archived`, los estudiantes verían borradores. Antes de un rollback, pasarlas a `published` o retirarlas.
- `phase6-totp-replay.sql`: idempotente y compatible con el código desplegado hoy.

## Variables de entorno

La `.env` de la VM-APP ya tiene `NODE_ENV`, `STAFF_JWT_SECRET`, `STAFF_MFA_KEY` y `AUDIT_DB_*` (verificado en el release de octubre; una línea vieja de `docs/migraciones-produccion.md` dice lo contrario y conviene corregirla). El servidor se niega a arrancar en producción si falta alguna.

## Cambios de contrato para frontend

- Nuevo `POST /api/auth/logout` (revoca todas las sesiones de la cuenta): el cliente debe llamarlo al cerrar sesión, ignorando errores.
- Replay de TOTP: avisar "espera al siguiente código".
- 429 del reto diario sin tratamiento especial en el cliente.
- Ranking: alias oculto (ver arriba).
- Cinco pantallas de gestión nuevas (`/staff/content`, `/staff/review`, `/staff/game`, `/staff/moderation`, `/staff/support`) y `ROLE_SECTIONS` en `StaffLayout.jsx`.

## Verificación empírica (5 de noviembre, MySQL 8.0.46 en Docker)

- Suite completa sobre `develop` (`a015c9e`): 238 pruebas, 236 pasan, 0 fallan, 2 omitidas (las mismas 2 de siempre).
- `phase5-content-review.sql` y `phase6-totp-replay.sql` aplicadas sobre una base previa a la fase 5 con una actividad de ejemplo: la actividad quedó `published`, la tabla `content_reports` se creó bien y ambas migraciones se pueden repetir sin error (idempotentes).
- Que la suite pase no contradice los hallazgos: las pruebas nuevas son de funciones puras y no cubren los puntos B2 a B8.

## Lo que no se verificó

El comportamiento real de MySQL bajo concurrencia, la zona horaria de las VM, si producción corre uno o varios procesos Node (decide si el limitador en memoria es aceptable), el timing real de B8, y el cliente de las pantallas nuevas (no existe).
