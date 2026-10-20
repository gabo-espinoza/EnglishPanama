# Contrato de API - English Panama

Base URL en desarrollo local: `http://localhost:3000/api`
Base URL en produccion: `http://150.136.50.253/api`

Todas las respuestas son JSON. Los endpoints protegidos requieren el header:

```
Authorization: Bearer <token>
```

> **Estado:** los modulos de Auth, Usuarios, Actividades, Reto diario, Ranking,
> Panel docente y Modo demo estan **implementados**. Tambien esta implementada la
> **base de personal (Fase A)**: cuentas de gestion con roles, MFA, sesion corta y
> auditoria. Ver `docs/backend.md` y `docs/security.md`.

## Reglas de XP y niveles

| Regla | Valor |
|---|---|
| XP por respuesta correcta | 5 |
| XP por nivel | 100 |
| Nivel a partir de XP | `nivel = floor(xp / 100) + 1` |

Ejemplo: 8 aciertos -> 40 XP; si el estudiante tenia 100 XP, queda con 140 XP y sube a nivel 2.

Las respuestas que otorgan XP (intento de actividad y reto diario) y el ranking
incluyen ademas los datos para pintar la **barra de progreso**: `xpIntoLevel`
(XP dentro del nivel actual) y `xpForNextLevel` (XP que pide el siguiente nivel).

## Formato de errores

Cualquier error responde con este formato, con el codigo HTTP correspondiente:

```json
{ "error": "Descripcion legible del problema." }
```

Algunos errores agregan un campo `code`, un identificador estable que el cliente puede comparar sin
depender del texto del mensaje:

```json
{ "error": "Debes crear tu contrasena antes de continuar.", "code": "PASSWORD_CHANGE_REQUIRED" }
```

`code` solo aparece en errores `4xx` que lo definen expresamente; si falta, el cliente se guia por el
codigo HTTP. Codigos vigentes: `PASSWORD_CHANGE_REQUIRED` (`403`, la cuenta debe crear su contrasena antes
de usar la plataforma) y `PASSWORD_ALREADY_SET` (`409`, la contrasena inicial ya fue creada).

Codigos usados: `400` (datos invalidos), `401` (sin token o token invalido),
`403` (sin permiso / funcion desactivada), `404` (no encontrado),
`409` (conflicto, ej. usuario repetido o reto ya completado),
`413` (body demasiado grande), `429` (demasiadas peticiones), `500` (error inesperado).

> Los errores `500` nunca exponen la traza interna: responden con un mensaje generico
> y se registran solo en el servidor.

---

## Auth (implementado)

### `POST /auth/register/teacher` - deshabilitado

Las cuentas de **docente no se crean por registro**: las crea el gestor de accesos con
`POST /staff/teachers`, y el docente recibe su cuenta ya creada (usuario, contrasena temporal y codigo de
clase). Esta ruta responde siempre `403` con `{ "error": "El registro de docentes esta deshabilitado: ..." }`,
sin crear nada. En el primer inicio de sesion el docente **debe crear su propia contrasena**
(`POST /auth/set-initial-password`, ver mas abajo) y despues vincula su autenticador (MFA obligatorio).
La contrasena temporal deja de servir en cuanto la reemplaza.

### `POST /auth/register/student`

**Body:**
```json
{ "username": "string", "password": "string", "classCode": "string" }
```

**Respuesta 201:**
```json
{ "token": "jwt" }
```

### `POST /auth/login`

**Body:**
```json
{ "username": "string", "password": "string" }
```

**Respuesta 200** (cuatro casos, segun la cuenta):

1. **Sin MFA y rol con MFA opcional (estudiante):** la sesion normal.
   ```json
   { "token": "jwt", "role": "student" }
   ```
2. **Con MFA activo (estudiante o docente):** no hay sesion todavia, solo un reto de 5 minutos para el
   segundo paso (`POST /auth/login/mfa`).
   ```json
   { "mfaRequired": true, "mfaToken": "jwt", "expiresIn": 300 }
   ```
3. **Docente sin MFA vinculado (MFA obligatorio):** no hay sesion; se entrega un token de vinculacion
   de 15 minutos que solo sirve en `POST /auth/mfa/setup` y `POST /auth/mfa/confirm`.
   ```json
   { "mfaSetupRequired": true, "enrollToken": "jwt", "expiresIn": 900 }
   ```
4. **Docente recien creado por el gestor de accesos (`must_change_password = 1`):** se comprueba antes que
   cualquier otro caso, incluido el MFA. No hay sesion; se entrega un token restringido de 15 minutos
   (`typ: "pwd_change"`) que solo sirve en `POST /auth/set-initial-password`.
   ```json
   { "passwordChangeRequired": true, "passwordToken": "jwt", "expiresIn": 900 }
   ```

*Validaciones:* el `username` admite entre 3 y 30 caracteres (letras, numeros,
punto, guion o guion bajo) y la contrasena entre 4 y 72 caracteres.
`login` y `register` tienen limite de intentos (ver `docs/security.md`).

### `POST /auth/set-initial-password` - token `pwd_change`

Primer ingreso de un docente creado por el gestor de accesos: reemplaza la contrasena temporal por una
propia. Solo acepta el token restringido que devuelve `POST /auth/login` (`Authorization: Bearer <passwordToken>`);
una sesion normal, el reto de MFA o el token de vinculacion responden `401`. La ruta tiene el limite de
intentos de autenticacion.

**Body:**
```json
{ "newPassword": "string", "confirmPassword": "string" }
```

*Validaciones:* ambos campos son obligatorios; la contrasena nueva tiene entre 4 y 72 caracteres, debe
coincidir con `confirmPassword` y ser distinta de la temporal. Queda en la auditoria
(`user.password.initial_set`).

**Respuesta 200:** el mismo resultado que el login tras acertar la contrasena, segun la cuenta. Para un
docente sin autenticador es el token de vinculacion:
```json
{ "mfaSetupRequired": true, "enrollToken": "jwt", "expiresIn": 900 }
```
(con MFA activo devuelve `{ "mfaRequired": true, "mfaToken": "jwt", "expiresIn": 300 }`; en otro caso, la
sesion `{ "token": "jwt", "role": "..." }`).

El cambio sube la `token_version` de la cuenta: el `passwordToken` usado y cualquier sesion abierta con la
contrasena temporal quedan **revocados**. El token no se puede reutilizar: un segundo uso posterior recibe `401`
(la `token_version` ya no coincide). Si dos peticiones con el mismo token llegan a la vez, solo una gana y la
otra recibe `401` o `409` (`409` solo si lee la fila antes de que el primer `UPDATE` se confirme).

**Errores:** `400` faltan datos (o `newPassword`/`confirmPassword` no son texto), contrasena invalida, no coincide
con `confirmPassword` o igual a la temporal; `401` token vencido, invalido o revocado, o cuenta no disponible;
`429` cuenta bloqueada por intentos (el token sigue siendo valido; espera unos segundos y reintenta); `409` con
`code: "PASSWORD_ALREADY_SET"` si el token aun coincide pero la contrasena ya fue creada (bandera en 0).

> Mientras `must_change_password` siga en 1, **cualquier ruta protegida** con una sesion normal responde
> `403` con `code: "PASSWORD_CHANGE_REQUIRED"` (por ejemplo, una sesion emitida antes de que se creara la
> bandera para esa cuenta). El cliente descarta la sesion y lleva al login.

### `POST /auth/change-password` - sesion normal

Cambio de contrasena **propio** y voluntario, con la contrasena actual. (La contrasena temporal de un docente
nuevo se reemplaza con `POST /auth/set-initial-password`, no con esta ruta.) Body `{ "currentPassword": "string", "newPassword": "string" }`.

La contrasena actual es obligatoria: una sesion robada no basta para quedarse con la cuenta. La nueva
debe tener entre 4 y 72 caracteres y ser distinta de la actual. Un intento con la contrasena actual
incorrecta cuenta para el bloqueo de 3 intentos / 10 segundos, y la ruta tiene el limite de intentos de
autenticacion. Queda en la auditoria (`user.password.change`).

**Respuesta 200:** `{ "token": "jwt", "role": "teacher" }`. Todas las sesiones abiertas de la cuenta
(incluida la usada para el cambio) quedan **revocadas**; el `token` devuelto es la sesion nueva.

**Errores:** `400` faltan datos, contrasena nueva invalida o igual a la actual; `401` sin sesion, contrasena
actual incorrecta o cuenta bloqueada. El reto de MFA y el token de vinculacion no sirven aqui (`401`).

### MFA de plataforma (implementado)

Segundo factor **TOTP** (RFC 6238): codigo de 6 digitos que cambia cada 30 segundos, generado por una
app de autenticacion (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS, FreeOTP...). Es
**opcional para estudiantes** y **obligatorio para docentes**. Si un docente pierde el celular, el
gestor de accesos le reinicia el MFA (`POST /staff/teachers/:id/reset-mfa`) y debe vincular uno nuevo.

Un codigo incorrecto cuenta para el bloqueo de 3 intentos / 10 segundos. Estas rutas tienen el limite
de intentos de autenticacion.

#### `POST /auth/login/mfa` - publico

Segundo paso del login. Body `{ "mfaToken": "jwt", "totp": "123456" }`.

**Respuesta 200:** `{ "token": "jwt", "role": "teacher" }`.
**Errores 401:** reto vencido o invalido (hay que volver a iniciar sesion), cuenta revocada o codigo incorrecto.

#### `POST /auth/mfa/setup` - sesion normal **o** token de vinculacion

Genera un secreto nuevo y lo deja **pendiente** (vale 10 minutos). El cliente debe mostrar `otpauthUri`
como codigo QR y, de respaldo, el secreto en texto. Body `{}`; si la cuenta ya tenia MFA activo, hay que
mandar `{ "totp": "codigo actual" }` para volver a vincular.

**Respuesta 200:**
```json
{ "otpauthUri": "otpauth://totp/English%20Panama:profe1?secret=ABCD...&issuer=English%20Panama&algorithm=SHA1&digits=6&period=30", "expiresIn": 600 }
```
**Error 409** (solo con token de vinculacion): la cuenta ya tiene un autenticador vinculado.

#### `POST /auth/mfa/confirm` - sesion normal **o** token de vinculacion

Body `{ "totp": "123456" }`. Si el codigo coincide con el secreto pendiente, el MFA queda activo.

**Respuesta 200:**
- Con **sesion normal:** `{ "mfaEnabled": true }`.
- Con **token de vinculacion** (docente en su primer inicio de sesion): ademas entrega la sesion, para
  que no tenga que volver a iniciar sesion: `{ "mfaEnabled": true, "token": "jwt", "role": "teacher" }`.

**Errores:** `400` no hay vinculacion en curso; `401` codigo incorrecto o vinculacion vencida; `409`
(token de vinculacion) la cuenta ya tiene autenticador.

El token de vinculacion (`typ: "mfa_enroll"`) y el reto del segundo paso (`typ: "mfa_pending"`) **no abren
ninguna otra ruta protegida**: responden 401.

---

## Usuarios (implementado)

### `GET /users/me` - Protegido (cualquier rol)

Devuelve el **perfil del usuario autenticado**. Cada quien ve solo lo suyo: nunca
`password_hash` ni datos de otros usuarios (minimo privilegio).

**Respuesta 200 (estudiante):**
```json
{
  "id": 7,
  "role": "student",
  "alias": "dani_88",
  "avatar": "default",
  "xp": 140,
  "teacherId": 1,
  "classCode": "MGSP2Y",
  "level": 2,
  "xpIntoLevel": 40,
  "xpForNextLevel": 100
}
```

**Respuesta 200 (docente):**
```json
{
  "id": 1,
  "role": "teacher",
  "alias": "profe_daniel",
  "displayName": "Profe Daniel",
  "classCode": "MGSP2Y"
}
```

**Errores:** `404` si la cuenta ya no existe.

### `PATCH /users/me` - Protegido (cualquier rol)

Permite editar el **perfil propio**. El nombre de usuario (login) nunca se puede cambiar.

**Body (estudiante):**
```json
{ "avatar": "zorro-9" }
```
`avatar` es un identificador corto (letras, numeros, guion o guion bajo; hasta 50).

**Body (docente):**
```json
{ "displayName": "Profe Daniel" }
```
`displayName` admite de 1 a 100 caracteres.

**Respuesta 200:** el mismo perfil actualizado (igual formato que `GET /users/me`).

**Errores:** `400` si no hay campos validos o el formato es incorrecto; `404` si la cuenta no existe.

---

## Actividades (implementado)

### `GET /activities/:moduleSlug` - Protegido, rol `student`

Lista las actividades de un modulo (`vocabulary` | `grammar` | `reading`).

**Respuesta 200:**
```json
[
  { "id": 1, "title": "Animales", "gameType": "multiple_choice", "sortOrder": 1 }
]
```

**Errores:** `404` si el modulo no es valido o no existe.

### `GET /activities/:id/questions` - Protegido, rol `student`

Devuelve las preguntas de una actividad **sin** `correct_answer` - nunca se manda la respuesta correcta al cliente.

**Respuesta 200:**
```json
{
  "activityId": 5,
  "passageText": null,
  "questions": [
    { "id": 20, "prompt": "How do you say...?", "options": ["a", "b", "c"] }
  ]
}
```

**Errores:** `404` si la actividad no existe.

### `POST /activities/:id/attempts` - Protegido, rol `student`

Envia todas las respuestas de una actividad. El servidor corrige, calcula XP y guarda el intento.

**Body:**
```json
{ "answers": [{ "questionId": 20, "answer": "b" }] }
```

**Respuesta 201:**
```json
{ "score": 8, "xpEarned": 40, "totalXp": 140, "level": 2, "xpIntoLevel": 40, "xpForNextLevel": 100 }
```

*Notas:* la correccion y el calculo de XP ocurren **siempre en el servidor**;
lo que envie el cliente nunca se toma como puntaje. Solo se corrigen las preguntas
que pertenecen a la actividad (se ignoran ids ajenos) y faltantes cuentan como incorrectas.

**Errores:** `400` sin respuestas, `404` actividad/estudiante inexistente, `409` actividad sin preguntas.

---

## Reto diario (implementado)

### `GET /daily-challenge` - Protegido, rol `student`

Devuelve el reto de hoy (calculado por fecha + offset de modo demo) y si ya fue completado.

**Respuesta 200:**
```json
{
  "date": "2026-11-05",
  "challengeId": 3,
  "question": { "id": 42, "prompt": "...", "options": ["..."], "topic": "vocabulario" },
  "completed": false
}
```

### `POST /daily-challenge/complete` - Protegido, rol `student`

Marca el reto de hoy como completado y otorga **10 XP**. Falla con `409` si ya se completo en el dia.

**Respuesta 201:**
```json
{ "completed": true, "completedOn": "2026-11-05", "xpEarned": 10, "totalXp": 150, "level": 2, "xpIntoLevel": 50, "xpForNextLevel": 100 }
```

*Nota:* el reto de hoy se calcula como `pool[dayOfYear(fecha_efectiva) % total]`,
donde `fecha_efectiva = hoy + offset_demo`. El mismo calculo se usa para la fecha
de completado, de modo que el modo demo mueve las dos cosas a la vez.

---

## Ranking (implementado)

### `GET /ranking` - Protegido, rol `student`

Devuelve el ranking de la clase del estudiante autenticado (por `teacher_id`), ordenado por XP. Solo expone alias/avatar/XP/nivel, nunca datos personales.

**Respuesta 200:**
```json
[
  { "position": 1, "alias": "dani_88", "avatar": "default", "xp": 140, "level": 2, "xpIntoLevel": 40, "xpForNextLevel": 100 }
]
```

---

## Panel docente (implementado)

### `GET /teacher/students` - Protegido, rol `teacher`

Lista los estudiantes de la clase del docente autenticado, con nivel, XP, actividades completadas y promedio (%) por modulo.

**Respuesta 200:**
```json
[
  {
    "userId": 7,
    "alias": "dani_88",
    "avatar": "default",
    "xp": 140,
    "level": 2,
    "completedActivities": 3,
    "averages": { "vocabulary": 80, "grammar": 65.5, "reading": null }
  }
]
```

### `GET /teacher/difficult-topics` - Protegido, rol `teacher`

Lista los temas (`questions.topic`) con mayor tasa de error entre los estudiantes de la clase. Acepta `?limit=` (1-50, por defecto 10).

**Respuesta 200:**
```json
[
  { "topic": "verbos irregulares", "attempts": 25, "errors": 15, "errorRate": 60 }
]
```

---

## Modo demo (implementado)

### `POST /demo/advance-day` - Protegido (cualquier rol), requiere `DEMO_MODE=true`

Avanza el offset del reto diario en `app_settings`, para la presentacion.
Si `DEMO_MODE` no es `true`, responde `403` sin tocar nada.

**Respuesta 200:**
```json
{ "demoDayOffset": 1 }
```

---

## Personal de gestion (implementado, Fase A)

Las cuentas de gestion (personal) son **distintas** de estudiantes y docentes: viven en
`staff_accounts` y cada una tiene **exactamente un rol**. El token de gestion se firma con
`STAFF_JWT_SECRET` (distinto de `JWT_SECRET`), dura **20 minutos** y lleva el **area** (`aud`).
El middleware `requireStaff` revalida la cuenta contra la base en cada peticion.

| Rol (`staff_role`) | Area | Fase | Puede |
|---|---|---|---|
| `access_manager` | `access` | A | Listar cuentas, crear docentes y solicitar suspender/activar |
| `auditor` | `audit` | A | Ver y verificar la auditoria, aprobar/rechazar solicitudes |
| `analyst` | `analytics` | A | Ver metricas anonimas (solo lectura) |
| `content_manager` | `content` | B | Crear y estructurar contenido (queda pendiente de revision) |
| `content_reviewer` | `content` | B | Revisar y aprobar/rechazar el contenido |
| `game_manager` | `game` | C | Administrar reglas del juego y catalogo de alias |
| `moderator` | `moderation` | C | Atender reportes de la comunidad y aplicar sanciones |
| `support` | `support` | C | Atender reportes y consultas de los usuarios |

> El gestor de base de datos y el gestor de la aplicacion **no son cuentas de la app**:
> son usuarios del sistema operativo de las VM (se documentan en la fase de operaciones).

### `POST /staff/auth/login` - publico

Body `{ "username", "password", "totp" }`. La contrasena se verifica con bcrypt y el `totp`
es el codigo de 6 digitos de la app de autenticacion (ventana de +/- 30 s). Tras 3 fallos la
cuenta se bloquea 10 segundos.

**Respuesta 200:**
```json
{ "token": "eyJ...", "role": "access_manager", "area": "access", "expiresIn": 1200 }
```

**Error 401:** `{ "error": "Usuario, contrasena o codigo incorrectos." }` (mismo mensaje para
credencial invalida, TOTP invalido, cuenta suspendida o bloqueada).

### `POST /staff/teachers/:id/reset-mfa` - `access_manager`

Reinicia el MFA de un **docente** que perdio su celular. El gestor lo hace a mano, despues de verificar
su identidad por un medio ajeno a la app. Borra el autenticador vinculado, revoca las sesiones abiertas
del docente y limpia su bloqueo; en su siguiente inicio de sesion tendra que vincular un autenticador
nuevo. Queda en la auditoria (`staff.teacher.reset_mfa`).

**Respuesta 200:** `{ "id": 12, "username": "profe1", "mfaReset": true }`.
**Errores:** `400` identificador invalido; `404` el docente no existe (tambien si el id es de un estudiante).

### `GET /staff/me` - cualquier gestor

Devuelve el rol, el area y el estado de la propia cuenta (sin secretos).

### `GET /staff/accounts` - `access_manager`, `auditor`

Lista de cuentas de gestion (`id`, `username`, `role`, `status`, `createdAt`). Nunca incluye
secretos MFA ni hashes de contrasena.

### `POST /staff/change-requests` - `access_manager`

Body `{ "targetId": 8, "action": "suspend" }` (`suspend` o `activate`). No puede apuntar a su
propia cuenta (`400`). Crea una solicitud `pending` (`201`).

### `GET /staff/change-requests?status=` - `access_manager`, `auditor`

Lista de solicitudes (filtro opcional por `status`).

### `POST /staff/change-requests/:id/decision` - solo `auditor`

Body `{ "decision": "approved" }` o `{ "decision": "rejected" }`. Quien solicita no puede
decidir y nadie decide sobre su propia cuenta. Al aprobar se aplica el cambio en una
transaccion. `409` si la solicitud ya fue resuelta.

### `POST /staff/teachers` - `access_manager`

Body `{ "username", "displayName" }`. Crea la cuenta de docente y devuelve una
`temporaryPassword` (se muestra una sola vez) y el `classCode`. Es la **unica** forma de crear una cuenta
de docente (el registro esta deshabilitado). El docente entra con la contrasena temporal, la reemplaza por una propia con
`POST /auth/set-initial-password` (la cuenta nace con `must_change_password = 1`) y despues vincula su
autenticador (MFA obligatorio).

### `GET /staff/analytics/dashboard` - solo `analyst`

Metricas agregadas y anonimas (totales): estudiantes, docentes, actividades, preguntas,
intentos y personal por rol. Nunca alias ni nombres. Este endpoint pertenece al departamento
de Datos y Reportes (`analytics`); el `access_manager` ya **no** tiene acceso a el (`403`).

### `GET /staff/audit` - `auditor`

Registro de auditoria paginado y filtrable (`actorType`, `actorRole`, `action`, `from`, `to`,
`limit`, `offset`). Solo lectura.

### `GET /staff/audit/verify` - `auditor`

Recorre la cadena de hashes del registro:
```json
{ "ok": true, "checked": 42 }
```

---

## Convenciones para agregar un endpoint nuevo

1. Actualiza este archivo **antes** de escribir el codigo - asi el resto del equipo sabe que esperar sin leer la implementacion.
2. Sigue el patron de capas: ruta -> controlador -> servicio -> acceso a datos (ver `server/README.md`).
3. Nunca expongas `correct_answer`, `password_hash`, ni datos personales de otros estudiantes.
4. Toda consulta usa sentencias parametrizadas (`?`), nunca concatenacion de strings.
5. Todo error de validacion usa el formato `{ "error": "..." }` con el codigo HTTP correcto, no 500 generico.
