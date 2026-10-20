# Seguridad - English Panama (MVP + base de gestion)

Documento vivo. Describe los principios, los controles ya implementados en el backend
y las recomendaciones para la siguiente fase. Esta pensado tambien como guia para la
**prueba de seguridad** (ejercicio de pentest) del curso.

## 1. Principios de diseno

- **El servidor es la autoridad.** La correccion de respuestas, el XP y los niveles se
  calculan siempre en el servidor. El cliente no puede "declarar" un puntaje.
- **Minimo privilegio.** Cada rol recibe solo lo que necesita: `student` juega y ve su
  clase; `teacher` ve solo a sus estudiantes; cada cuenta de gestion administra **una sola
  area** (accesos, auditoria, contenido, juego, comunidad, datos o soporte).
- **Zero trust.** No se confia en "ya haber entrado": en **cada** peticion se verifica el
  token **y** se revalida la cuenta contra la base. Si la cuenta se desactiva o su version
  de token cambia, el token deja de servir al instante, aunque no haya expirado.
- **Separacion de funciones (4 ojos).** Quien pide un cambio de permisos no lo aprueba;
  quien lo aprueba es otra cuenta (`auditor`). Nadie decide sobre su propia cuenta.
- **Nunca confiar en el cliente.** Todo dato que llega por el body/params/query se valida.

### 1.1 Organizacion por departamentos (no hay administrador unico)

El control esta desglosado como en una empresa: **8 roles repartidos en 7 departamentos
(areas)**; cada cuenta administra una sola area y no puede invadir las otras. **No existe**
una cuenta "superadmin": el poder esta repartido y el cambio de permisos exige solicitar +
aprobar por otra cuenta (4 ojos).

| Departamento (area) | Rol | Puede |
|---|---|---|
| Identidad y Accesos (`access`) | `access_manager` | Listar cuentas, crear docentes y solicitar suspender/activar |
| Auditoria y Cumplimiento (`audit`) | `auditor` | Ver y verificar la auditoria; aprobar o rechazar solicitudes |
| Datos y Reportes (`analytics`) | `analyst` | Ver metricas anonimas (solo lectura) |
| Contenido (`content`) | `content_manager` | Crear y estructurar contenido (queda pendiente) |
| Contenido (`content`) | `content_reviewer` | Revisar y aprobar/rechazar el contenido |
| Producto y Juego (`game`) | `game_manager` | Administrar reglas del juego y catalogo de alias |
| Comunidad (`moderation`) | `moderator` | Atender reportes de la comunidad y aplicar sanciones |
| Soporte (`support`) | `support` | Atender reportes y consultas de los usuarios |

Ademas, **Infraestructura (IT)** no son cuentas de la app: el gestor de base de datos y el
gestor de la aplicacion son usuarios del sistema operativo de las VM (permisos acotados, MFA
y auditoria).

## 2. Controles implementados (backend)

| Riesgo | Control |
|---|---|
| Inyeccion SQL | Todas las consultas usan sentencias parametrizadas (`?`) con `mysql2`. Nunca se concatenan strings. |
| Manipulacion de puntaje | La correccion y el calculo de XP ocurren en el servidor; el body solo trae respuestas, no resultados. |
| Fuga de respuestas correctas | `correct_answer` nunca se selecciona en los endpoints publicos; solo se usa internamente al corregir. |
| Fuerza bruta en login/registro | `express-rate-limit`: maximo 20 intentos **con error** por 15 minutos por IP (`middleware/rateLimiter.js`); entrar bien no gasta el cupo. El tope se sube con `AUTH_RATE_LIMIT_MAX` (un colegio comparte una IP publica). Ademas, cada cuenta se bloquea 10 segundos tras 3 fallos. |
| Abuso general de la API | Limite general de 120 peticiones por minuto por IP. |
| Cabeceras inseguras | `helmet` aplica cabeceras de seguridad por defecto. |
| Body malicioso o enorme | `express.json({ limit: '100kb' })` + manejo de JSON invalido (`400`) y body grande (`413`). |
| Fuga de informacion en errores | Los errores `500` responden con mensaje generico; la traza se registra solo en el servidor. |
| IDOR (acceder a datos ajenos) | Los endpoints de docente usan el `teacher_id` del token, nunca un id enviado por el cliente. El ranking solo devuelve la clase del estudiante autenticado. |
| Escalada de privilegios (rol) | `requireRole(...)` protege cada grupo de rutas; el rol **se lee de la base** en cada peticion, no del token. |
| XSS | El backend solo devuelve JSON; React escapa el texto por defecto. No se renderiza HTML crudo. |
| Datos personales de menores | Los estudiantes se identifican con un alias; el ranking expone solo alias/avatar/XP/nivel. |
| Reutilizacion de reto diario | Restriccion unica `(student_id, completed_on)` en la base; el duplicado responde `409`. |
| Tokens falsificados | JWT firmado con `JWT_SECRET`; token invalido o expirado responde `401`. |
| CORS abierto en produccion | Se puede restringir con la variable `CORS_ORIGIN` (lista de origenes permitidos). |
| IP falsificada para evadir limites | `trust proxy` se activa solo con `TRUST_PROXY=true` (cuando hay Nginx delante). |

### 2.1 Controles de las cuentas de gestion (Fase A)

| Riesgo | Control |
|---|---|
| Reuso de un token de estudiante en la gestion | Los tokens del personal se firman con **otro secreto** (`STAFF_JWT_SECRET`) y llevan `typ: 'staff'`. Un token de un mundo no valida en el otro (`401`). |
| Sesion de personal demasiado larga | El token de gestion dura **20 minutos** (contra 2 horas de estudiantes/docentes). |
| Robo de contrasena | **MFA con TOTP** (6 digitos, ventana de +/- 30 s), obligatorio en cada login de personal. |
| Fuga del secreto MFA | El secreto TOTP se guarda **cifrado** (AES-256-GCM) con `STAFF_MFA_KEY`; nunca en claro. |
| Fuerza bruta sobre una cuenta de gestion | Tras **5 intentos fallidos** la cuenta se bloquea **15 minutos** (`locked_until`). |
| Cuenta de gestion secuestrada | `requireStaff` revalida en cada peticion: la cuenta existe, esta `active`, su `token_version` coincide y el rol/area siguen vigentes. |
| Un rol actua fuera de su area | Cada ruta de gestion exige `area` **y** `role` (`requireStaff({ area, roles })`). Ej.: un `access_manager` no puede leer la auditoria (`403`). |
| Un solo administrador con todo el poder | Hay **8 roles** repartidos en 7 areas; **no existe** una cuenta "superadmin". El cambio de permisos requiere solicitar + aprobar por otra cuenta. |
| Abuso de poder al suspenderse a si mismo | Una solicitud no puede apuntar a la cuenta que la crea (`400`) y el `auditor` tampoco decide sobre su propia cuenta. |
| Auditoria alterable | La auditoria vive en **otra base** (`englishpanama_audit`) con un usuario que solo tiene `INSERT` y `SELECT`. Cada fila encadena un hash SHA-256; `GET /staff/audit/verify` detecta cualquier alteracion. |
| Registros incompletos | Cada accion sensible (login, cambio de estado, creacion de docente, decisiones) queda en el registro con actor, rol, accion y resultado. |

### 2.2 Cambio obligatorio de la contrasena inicial

Los docentes nacen con una contrasena temporal que conoce quien crea la cuenta. Para que esa clave no
quede en uso, la tabla `users` tiene la bandera `must_change_password` (1 = el usuario debe crear su
contrasena antes de recibir sesion; las cuentas existentes quedan en 0).

| Riesgo | Control |
|---|---|
| Contrasena temporal conocida por terceros | Con la bandera en 1, `POST /auth/login` no entrega sesion: devuelve `{ passwordChangeRequired, passwordToken }`. Esta comprobacion va **antes** del MFA, asi que el docente no llega a vincular su autenticador sin haber creado su propia contrasena. |
| Uso indebido del token del cambio | `passwordToken` es un JWT con `typ: "pwd_change"` y **15 minutos** de vida. Solo abre `POST /auth/set-initial-password`; en cualquier otra ruta `requireAuth` lo rechaza (`401`), igual que al reto `mfa_pending` y al token `mfa_enroll`. Esa ruta, a su vez, rechaza cualquier otro tipo de token. |
| Reutilizacion del token o de la temporal | El `UPDATE` que fija la contrasena solo procede si la bandera sigue en 1 y sube `token_version`: el `passwordToken` usado, y cualquier sesion abierta con la temporal, quedan revocados. Un segundo uso secuencial del mismo `passwordToken` recibe `401` (la `token_version` ya no coincide); una peticion concurrente recibe `401` o `409` (`409` solo si lee la fila antes de que el primer `UPDATE` se confirme). Un `passwordToken` usado con la bandera ya en 0 pero con la version aun vigente recibe `409 PASSWORD_ALREADY_SET`. |
| Sesion saltandose el cambio | Mientras la bandera valga 1, `requireAuth` revalida contra la base en cada peticion y responde `403` con `code: "PASSWORD_CHANGE_REQUIRED"`. |
| Conservar la temporal | La contrasena nueva debe ser distinta de la temporal, coincidir con su confirmacion y cumplir el largo (4 a 72 caracteres). |
| Trazabilidad | El cambio queda en la auditoria como `user.password.initial_set`. |

El `passwordToken` viaja en el estado del router (historial del navegador, `window.history.state`), nunca en `localStorage` ni en la URL. Sobrevive a una recarga mientras el token sea valido; muere a los 15 minutos o al usarse.

## 3. Validacion de entrada

- `username`: 3-30 caracteres, solo `[A-Za-z0-9_.-]`.
- `password`: minimo 4, maximo 72 caracteres (bcrypt solo usa 72 bytes).
- `displayName` (docente): maximo 100 caracteres.
- `moduleSlug`: solo `vocabulary`, `grammar` o `reading`.
- `:id` de actividad: se convierte a numero; ids inexistentes responden `404`.
- `limit` del panel: se acota entre 1 y 50.
- `answers`: debe ser un arreglo no vacio; ids ajenos a la actividad se ignoran.
- `action` de una solicitud de gestion: solo `suspend` o `activate`.
- `decision` de auditoria: solo `approved` o `rejected`.
- `totp`: exactamente 6 digitos; si no, responde `401` sin revelar la causa.

## 4. Recomendaciones para la fase de despliegue (infraestructura)

Estas no dependen del codigo de la app y son clave antes de publicar:

1. **HTTPS obligatorio.** Terminar TLS en Nginx y redirigir todo HTTP a HTTPS. Sin esto,
   el token viaja en claro.
2. **Secretos robustos.** Generar `JWT_SECRET` y `STAFF_JWT_SECRET` con al menos 32 bytes
   aleatorios (`openssl rand -hex 32`) y `STAFF_MFA_KEY` con 32 bytes en base64. Rotarlos
   si se sospecha filtracion. Nunca subirlos al repo.
3. **Usuarios de base con permisos minimos.** El usuario de la app solo debe tener
   `SELECT/INSERT/UPDATE` sobre `englishpanama`. El usuario de auditoria (`audit_writer`)
   solo `INSERT/SELECT` sobre `englishpanama_audit`. Ninguno con `DROP` ni acceso global.
4. **Base de datos no expuesta a internet.** MySQL debe escuchar solo en la red interna;
   el unico puerto publico es el 443 del proxy.
5. **Backups automaticos y cifrados** de la base, con prueba de restauracion.
6. **`.env` fuera del repositorio** (ya esta en `.gitignore`) y con permisos restringidos.
7. **Logs y monitoreo.** Alertas por picos de `401/403/429` y por accesos desde
   ubicaciones u horas inusuales (base para el plan de auditoria del documento de diseno).
8. **Actualizar dependencias** con `npm audit` antes de cada entrega.
9. **Tokens cortos para el personal.** Ya implementado: 20 minutos con MFA; se recomienda
   el cambio de contrasena temporal en el primer ingreso del docente ya esta implementado
   (ver seccion 2.2).

## 5. Checklist para la prueba de seguridad

Con `DEMO_MODE=false`, `TRUST_PROXY=false` y `CORS_ORIGIN` configurado, verificar:

**App de estudiantes y docentes**

- [ ] `GET /api/activities/...` sin token -> `401`.
- [ ] Token de estudiante en un endpoint de docente -> `403`.
- [ ] Alterar el `id` de otro estudiante en el body -> no tiene efecto (se usa el del token).
- [ ] Enviar puntaje falso en `POST /attempts` -> se ignora; el servidor recalcula.
- [ ] Pedir las preguntas -> la respuesta **no** incluye `correct_answer`.
- [ ] `POST /daily-challenge/complete` dos veces el mismo dia -> la segunda da `409`.
- [ ] `POST /demo/advance-day` con `DEMO_MODE=false` -> `403`.
- [ ] Muchos intentos de login seguidos -> `429`.
- [ ] SQL injection en `username` (`' OR 1=1 --`) -> login falla; no rompe la consulta.
- [ ] JSON gigante o mal formado en el body -> `413` / `400`, no `500`.
- [ ] Errores `500` -> no revelan la traza.
- [ ] Token de estudiante con `token_version` viejo -> `401` aunque no haya expirado.

**Cuentas de gestion**

- [ ] Un token de estudiante en `/api/staff/...` -> `401`.
- [ ] Un token de gestion en `/api/ranking` -> `401`.
- [ ] Login de gestion con TOTP incorrecto o vencido -> `401`.
- [ ] Un `access_manager` en `/api/staff/audit` -> `403`.
- [ ] Un `auditor` creando solicitudes de cambio -> `403`.
- [ ] Solicitar un cambio sobre la propia cuenta -> `400`.
- [ ] Intentar aprobar una solicitud ya resuelta -> `409`.
- [ ] Suspender una cuenta y volver a usarla con su token: debe responder `401` de inmediato.
- [ ] Cinco logins fallidos de una cuenta de gestion -> `401` (bloqueada 15 min).
- [ ] Alterar un registro de la auditoria a mano -> `GET /api/staff/audit/verify` responde `ok:false`.

## 6. Riesgos conocidos y supuestos del MVP

- El reto diario otorga XP al marcarse completado **una vez por dia**; no valida la
  respuesta en ese endpoint (el contrato no envia respuesta). Impacto acotado por la
  restriccion diaria. A futuro: pedir la respuesta y corregirla en el servidor.
- La app de estudiantes/docentes mantiene solo **dos roles** (`student`, `teacher`). La
  base de gestion tiene **8 roles** (sembrados con 3 cuentas cada uno, 24 en total);
  `content_manager`, `content_reviewer`, `game_manager`, `moderator` y `support` tienen
  rutas reservadas para las fases B y C (mismo motor de permisos), ya probados a nivel de
  login y aislamiento. Infraestructura (gestor de BD y gestor de la app) son usuarios del
  sistema operativo, fuera de la app.
- El token de estudiante/docente duro 2 horas y el de gestion 20 minutos. Es un balance
  entre comodidad (ninos en colegio) y seguridad; se puede bajar con refresh tokens.
