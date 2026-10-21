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
| Identidad y Accesos (`access`) | `access_manager` | Listar cuentas, crear docentes, reiniciar MFA o grado de un docente y solicitar suspender/activar |
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
| Ver contenido de otro nivel | El filtro por nivel de la clase se aplica **en el servidor**, en la consulta SQL (`level = ?`), nunca en el cliente: listado, preguntas, intentos y reto diario usan el nivel que sale de la base (`classLevel.service.js`), no uno enviado por el cliente. |
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

### 2.3 Grado de la clase

El docente declara el grado una sola vez y de ello depende lo que ven sus estudiantes. Los controles:

| Riesgo | Control |
|---|---|
| Un estudiante pide una actividad de otro nivel por id | `GET /activities/:id/questions` y `POST /activities/:id/attempts` filtran por `id` **y** `level`. Otro nivel, clase sin grado o id inexistente responden el **mismo** `404` (`La actividad no existe.`): la respuesta no revela que ese id existe en otro nivel. El nivel se comprueba antes de corregir y de abrir la transaccion, asi que un intento rechazado no guarda nada ni suma XP. |
| Mostrar contenido sin nivel definido | Mientras el docente no declare el grado, el listado devuelve `[]`, las preguntas y los intentos dan `404`, y el reto diario da `404`. No hay un nivel "por defecto" para los estudiantes. |
| Cambiar el grado en una carrera o repetirlo | La declaracion es un unico `UPDATE teachers SET grade = ?, grade_locked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND grade IS NULL`: **atomico**. Si dos peticiones compiten, una cambia la fila y la otra recibe `409` con `code: "GRADE_LOCKED"`. No hay lectura previa que se pueda adelantar. |
| Declarar el grado sin querer o con valores raros | El body exige `confirm: true` y `grade` como numero 3, 4 o 5 (se rechazan `"4"`, `4.5`, booleanos, etc.), ambos validados en el servidor (`400`). |
| Que un docente cambie el grado de otro | `PUT /teacher/class/grade` usa el `id` del token, nunca uno enviado por el cliente (mismo criterio que el resto del panel docente). |
| Reinicio indebido del grado | `POST /staff/teachers/:id/reset-grade` esta limitado al rol `access_manager` (`requireStaff({ area: 'access', roles: ['access_manager'] })`); un `auditor` recibe `403` y los tokens de estudiante, docente o de MFA, `401`. La condicion `grade IS NOT NULL` del `UPDATE` evita reiniciar (y auditar) dos veces si hay carreras. |
| Reinicio sin trazabilidad | Todo reinicio queda en la auditoria como `staff.teacher.reset_grade`, con el docente y el motivo en el `target`: `teacher#<id>:<usuario>:motivo=<motivo>`. |
| Motivo que rompe o falsea el registro de auditoria | El motivo (`reason`) debe tener de 5 a 40 caracteres, sin `\|` y sin caracteres de control. Se valida **antes** de escribir nada. Los limites existen por dos razones: el `target` de la auditoria es `VARCHAR(100)` y `audit.record()` ignora sus propios errores, asi que un motivo largo podria hacer que el reinicio ocurriera sin quedar registrado (con el limite, el `target` mide como maximo unos 97 caracteres); y el hash de la cadena de auditoria une los campos con el separador `\|`, asi que un motivo que lo contenga podria confundir la verificacion. |

El reinicio no toca contrasena, MFA, sesiones ni el avance de los estudiantes.

## 3. Validacion de entrada

- `username`: 3-30 caracteres, solo `[A-Za-z0-9_.-]`.
- `password`: minimo 4, maximo 72 caracteres (bcrypt solo usa 72 bytes).
- `displayName` (docente): maximo 100 caracteres.
- `moduleSlug`: solo `vocabulary`, `grammar` o `reading`.
- `:id` de actividad: se convierte a numero; ids inexistentes responden `404`.
- `limit` del panel: se acota entre 1 y 50.
- `grade` y `confirm` (`PUT /teacher/class/grade`): `grade` debe ser el numero 3, 4 o 5 y `confirm` exactamente `true`.
- `reason` (`POST /staff/teachers/:id/reset-grade`): de 5 a 40 caracteres, sin `|` ni caracteres de control.
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
- [ ] Estudiante pide `GET /api/activities/:id/questions` o `POST /api/activities/:id/attempts` de una actividad de otro nivel -> `404` `La actividad no existe.` (igual que un id inexistente).
- [ ] Estudiante de una clase sin grado declarado -> listado `[]`, preguntas e intentos `404`.
- [ ] `PUT /api/teacher/class/grade` dos veces (o dos peticiones a la vez) -> la segunda da `409` con `code: "GRADE_LOCKED"`.
- [ ] `PUT /api/teacher/class/grade` sin `confirm: true` o con `grade` fuera de 3, 4 y 5 -> `400`.

**Cuentas de gestion**

- [ ] Un token de estudiante en `/api/staff/...` -> `401`.
- [ ] Un token de gestion en `/api/ranking` -> `401`.
- [ ] Login de gestion con TOTP incorrecto o vencido -> `401`.
- [ ] Un `access_manager` en `/api/staff/audit` -> `403`.
- [ ] Un `auditor` creando solicitudes de cambio -> `403`.
- [ ] Un `auditor` en `POST /api/staff/teachers/:id/reset-grade` -> `403`.
- [ ] `reset-grade` con un motivo de menos de 5 o mas de 40 caracteres, o con `|` -> `400` y el grado no cambia.
- [ ] `reset-grade` sobre una clase sin grado -> `409` con `code: "GRADE_NOT_SET"`.
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
