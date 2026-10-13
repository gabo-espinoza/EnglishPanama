# Spec — Cuentas de gestión, Fase A (base de personal, MFA y auditoría)

Estado: **ajustado a la implementación del PR [#2](https://github.com/gabo-espinoza/EnglishPanama/pull/2)** (Daniel, `feat/backend-mvp`), más los arreglos de `fix/staff-hardening`. Origen: diagrama "English Panamá" (usuarios, roles de gestión, arquitectura, modularidad y seguridad).

## 1. Decisiones ya tomadas

1. **Las cuentas de gestión se crean solo desde el servidor** (script CLI ejecutado por SSH). No existe endpoint para crearlas, ni registro público, ni invitaciones por API.
2. **Gestor de base de datos y Gestor de la aplicación no son cuentas de la app.** Son usuarios Linux en las VM, con permisos documentados en `docs/ops/vm-roles.md` (fuera de esta fase).
3. **Un gestor tiene exactamente un rol.** Así la separación de funciones se cumple por construcción.
4. Se trabaja por fases, con spec e implementación por fase.
5. **Se mantienen 8 roles en la app**, dos más que los 6 que pedía el diagrama una vez quitados los de infraestructura. `analyst` sale del Gestor de usuarios y accesos (métricas) y `moderator` sale del Gestor de juego y ranking (moderación). Así cada rol tiene un solo tipo de poder: acceso a cuentas, datos, contenido, reglas del juego o moderación.

## 2. Roles de la app

| Rol (`staff_role`) | Área (`aud` del token) | Función | Estado |
|---|---|---|---|
| `access_manager` (Gestor de usuarios y accesos) | `access` | Listar cuentas de personal, solicitar suspensión o activación, crear cuentas de docente | Implementado (PR #2) |
| `auditor` | `audit` | Consultar y verificar la auditoría, decidir solicitudes de cambio de cuentas | Implementado (PR #2) |
| `analyst` | `analytics` | Métricas agregadas y anónimas (`GET /staff/analytics/dashboard`) | Implementado (PR #2) |
| `content_manager` | `content` | Crear cursos, lecciones, ejercicios y audios (`/courses`, `/media/upload`, `/quizzes`); corregir reportes escalados | **Fase B**: solo existe la cuenta |
| `content_reviewer` | `content` | Aprobar o rechazar lo que propone el gestor; nunca lo propio | **Fase B**: solo existe la cuenta |
| `game_manager` | `game` | Reglas de puntos, niveles y reto diario; ocultar alias del ranking | **Fase C**: solo existe la cuenta |
| `moderator` | `moderation` | Borrar spam o comentarios ofensivos, silenciar o restringir usuarios | **Fase C**: solo existe la cuenta |
| `support` | `support` | Ver alias y estado de cuenta, ver reportes de preguntas con error, escalarlos al gestor de contenido | **Fase C**: solo existe la cuenta |

`content_manager` y `content_reviewer` comparten área pero tienen rol distinto: el middleware valida área **y** rol.

Qué cambia respecto al diagrama original:

- Las **métricas anónimas** pasan del Gestor de usuarios y accesos al `analyst`. El `access_manager` ya no las ve.
- La **moderación** (borrar comentarios, restringir usuarios) pasa del Gestor de juego y ranking al `moderator`. El `game_manager` conserva las reglas del juego y los alias en el ranking.
- Los roles **Gestor de base de datos** y **Gestor de la aplicación** siguen fuera de la app (usuarios Linux en las VM).

## 3. Alcance por fase

**Fase A (implementada en el PR #2, con arreglos en `fix/staff-hardening`):**

- Tablas de personal, roles y estado de cuenta.
- Scripts de creación de cuentas de gestión (solo servidor).
- Login de personal con contraseña + TOTP, sesión corta, token con área.
- Middleware `requireStaff({ area, roles })` que revalida contra la base en cada petición.
- Registro de auditoría en una base aparte, solo-inserción y con cadena de hashes.
- Roles `access_manager`, `auditor` y `analyst` con sus endpoints.

**Fase B (siguiente):** `content_manager` y `content_reviewer`: endpoints de contenido y flujo de revisión (borrador, en revisión, publicado) con autor distinto del revisor. Depende de las tablas de actividades.

**Fase C:** `game_manager`, `moderator` y `support`: reglas del juego y alias, moderación y restricciones, reportes de preguntas con error y su escalamiento. El foro y los comentarios se incluyen aquí solo si el profesor lo exige.

**Fase de operaciones:** `docs/ops/vm-roles.md` con los usuarios Linux de las VM (Gestor de base de datos y Gestor de la aplicación) y sus permisos, además de `/system/logs` y `/system/maintenance` si se decide exponerlos.

### Endurecimiento posterior a la revisión del PR #2

Cuatro correcciones sobre la implementación inicial (`fix/staff-hardening`):

1. `requireStaff` pasa los fallos de la base a `next(err)`. En Express 4 un rechazo sin capturar podía tumbar el proceso.
2. La escritura de auditoría se serializa con `GET_LOCK`. Sin eso, dos peticiones simultáneas tomaban el mismo `prev_hash` y `verify()` reportaba una rotura falsa. No usa `FOR UPDATE` porque `audit_writer` no tiene `UPDATE`.
3. `seed-demo-staff.js` ya no tiene contraseña por defecto, exige `DEMO_STAFF_PASSWORD` de al menos 12 caracteres, se niega a correr con `NODE_ENV=production` y no modifica el esquema.
4. En producción las cuatro variables `AUDIT_DB_*` son obligatorias y el servidor no arranca sin ellas, para que la auditoría nunca caiga en silencio a la base principal.

Pendientes conocidos, fuera de esos cuatro: la auditoría nunca lanza (una acción sensible puede ejecutarse sin quedar registrada si la base de auditoría cae), no se corre bcrypt cuando el usuario no existe (diferencia de tiempo de respuesta) y un código TOTP puede reutilizarse dentro de su ventana.

## 4. Modelo de datos

Base principal (`englishpanama`), archivo nuevo `server/database/staff.sql`:

```sql
CREATE TABLE staff_accounts (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username         VARCHAR(50)  NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    role             ENUM('access_manager','auditor','content_manager',
                          'content_reviewer','game_manager','support',
                          'analyst','moderator') NOT NULL,
    status           ENUM('active','suspended') NOT NULL DEFAULT 'active',
    mfa_secret_enc   VARBINARY(255) NOT NULL COMMENT 'TOTP cifrado AES-256-GCM, clave en env',
    token_version    INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cambiarla revoca los tokens ya emitidos',
    failed_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until     DATETIME NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_staff_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE staff_change_requests (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_id     INT UNSIGNED NOT NULL,
    action        ENUM('suspend','activate') NOT NULL,
    requested_by  INT UNSIGNED NOT NULL,
    decided_by    INT UNSIGNED NULL,
    status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at    TIMESTAMP NULL,
    CONSTRAINT fk_scr_target FOREIGN KEY (target_id)    REFERENCES staff_accounts(id),
    CONSTRAINT fk_scr_req    FOREIGN KEY (requested_by) REFERENCES staff_accounts(id),
    CONSTRAINT fk_scr_dec    FOREIGN KEY (decided_by)   REFERENCES staff_accounts(id),
    KEY idx_scr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Los roles son fijos desde la creación: **no hay endpoint para cambiar el rol** de una cuenta (cambiarlo exige el script en el servidor).

Base de auditoría (`englishpanama_audit`, separada), archivo `server/database/audit.sql`:

```sql
CREATE TABLE audit_log (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    actor_type  ENUM('staff','teacher','student','system') NOT NULL,
    actor_id    INT UNSIGNED NULL,
    actor_role  VARCHAR(30) NULL,
    action      VARCHAR(60) NOT NULL,
    target      VARCHAR(100) NULL,
    outcome     ENUM('ok','denied','error') NOT NULL,
    ip          VARCHAR(45) NULL,
    prev_hash   CHAR(64) NOT NULL,
    row_hash    CHAR(64) NOT NULL COMMENT 'SHA-256(prev_hash || campos de la fila)',
    KEY idx_audit_time (occurred_at),
    KEY idx_audit_actor (actor_type, actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- Usuario de BD `audit_writer`: **solo `INSERT` y `SELECT`** sobre `audit_log`. Sin `UPDATE`, `DELETE` ni `TRUNCATE`. Solo el servidor conoce sus credenciales (`AUDIT_DB_*` en `.env`).
- La cadena de hashes hace detectable cualquier alteración o borrado hecho por alguien con acceso directo a la base. El auditor puede verificar la cadena (`GET /staff/audit/verify`).
- Nunca se guardan contraseñas, tokens, códigos TOTP ni cuerpos de request. Solo acción, objetivo y resultado.

## 5. Autenticación de personal

Login separado del de estudiantes y docentes: `POST /api/staff/auth/login`.

1. Valida `username`, `password` (bcrypt) y `totp` (ventana ±1 paso de 30 s).
2. Cuenta `suspended` o con `locked_until` vigente → 403/429 con el mismo mensaje genérico que una credencial inválida.
3. 5 fallos seguidos → bloqueo de 15 minutos. Cada intento (ok o fallido) se registra en auditoría.
4. Emite un JWT con `{ sub, typ: "staff", role, aud: <área> }`, **duración 20 minutos**, sin refresh: al expirar se vuelve a autenticar con contraseña y TOTP.
5. El secreto del token de personal es distinto al de usuarios (`STAFF_JWT_SECRET`). Un token de estudiante o docente no sirve en `/api/staff/*` y viceversa.

`requireStaff({ area, roles })` en cada petición: verifica firma y `typ`, **consulta `staff_accounts`** (existe, `active`, `token_version` igual al del token), valida área y rol, y registra los accesos denegados en auditoría. Así una suspensión surte efecto de inmediato aunque el token siga vigente: al aprobarla se incrementa `token_version`.

Enrolamiento TOTP: el script de creación imprime **una sola vez** el URI `otpauth://` (y opcionalmente un QR en terminal) para el celular del gestor. El secreto se guarda cifrado.

## 6. Script de creación (solo servidor)

`server/scripts/create-staff.js`:

```
node scripts/create-staff.js ana.accesos access_manager
```

- Pide la contraseña por prompt interactivo (no por argumento, para no dejarla en el historial del shell). Exige mínimo 12 caracteres.
- Genera el secreto TOTP, lo cifra con `STAFF_MFA_KEY`, inserta la cuenta y muestra el URI `otpauth://`.
- Escribe en auditoría `actor_type='system'`, `action='staff.create'`, con el usuario Linux que lo ejecutó.
- Solo corre en la VM del servidor, con el `.env` de producción. No se expone por HTTP.
- Gemelos: `list-staff.js` (solo lectura) y `reset-staff-mfa.js` (regenera TOTP, queda en auditoría).
- `seed-demo-staff.js` crea 24 cuentas de demostración (3 por rol). Es solo para desarrollo: exige `DEMO_STAFF_PASSWORD` y no corre con `NODE_ENV=production`.

## 7. API

Prefijo `/api/staff`. Todos devuelven errores `{ "error": "..." }`. Contrato detallado en `docs/api.md`.

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `POST /staff/auth/login` | público | Login con contraseña + TOTP. `200 { token, role, area, expiresIn }` |
| `GET /staff/me` | cualquier gestor | Rol, área y estado de la cuenta |
| `GET /staff/accounts` | `access_manager`, `auditor` | Lista de cuentas de personal (sin secretos) |
| `POST /staff/change-requests` | `access_manager` | Body `{ targetId, action }` con `suspend` o `activate`. No puede apuntar a su propia cuenta. |
| `GET /staff/change-requests?status=` | `access_manager`, `auditor` | Lista solicitudes |
| `POST /staff/change-requests/:id/decision` | `auditor` | Body `{ decision: "approved" \| "rejected" }`. Si se aprueba, aplica el cambio en transacción y revoca los tokens de esa cuenta. |
| `POST /staff/teachers` | `access_manager` | Crea cuenta de docente, devuelve contraseña temporal y `classCode` |
| `GET /staff/analytics/dashboard` | `analyst` | Métricas agregadas y anónimas |
| `GET /staff/audit` | `auditor` | Consulta paginada y filtrable |
| `GET /staff/audit/verify` | `auditor` | Recorre la cadena de hashes y devuelve `{ ok, brokenAtId? }` |

Reglas de separación de funciones aplicadas:

- Quien solicita un cambio no puede decidirlo, y nadie decide sobre su propia cuenta.
- El `access_manager` no ve contraseñas ni datos personales de alumnos, ni toca contenido, métricas o servidor.
- El auditor solo escribe decisiones sobre solicitudes; no puede modificar ni borrar el registro.
- Ningún endpoint de personal permite darse permisos a sí mismo.

## 8. Estructura de código

```
server/src/
├── config/auditDb.js            Pool con credenciales audit_writer
├── config/staffRoles.js         Rol -> área
├── middleware/staffAuth.js      requireStaff({ area, roles })
├── services/staffAuth.service.js    login, TOTP, bloqueo
├── services/audit.service.js        record(), list(), verify()
├── services/staffAccounts.service.js
├── utils/totp.js, mfaCrypto.js  TOTP (RFC 6238) y cifrado AES-256-GCM, solo con `crypto`
├── controllers/ staff*.controller.js
└── routes/staff.routes.js       montado en routes/index.js bajo /staff
server/scripts/                  create-staff.js, list-staff.js, reset-staff-mfa.js, seed-demo-staff.js
```

Dependencias nuevas: `helmet` y `express-rate-limit` (límite por IP). El TOTP y el cifrado se implementan con `crypto` de Node, sin `otplib`.

Variables nuevas en `env.example`: `STAFF_JWT_SECRET`, `STAFF_MFA_KEY` (32 bytes en base64), `AUDIT_DB_HOST`, `AUDIT_DB_USER`, `AUDIT_DB_PASSWORD`, `AUDIT_DB_NAME`.

## 9. Pruebas

- Login: credenciales inválidas, TOTP inválido, cuenta suspendida y bloqueo tras 5 fallos dan el mismo mensaje.
- Token de estudiante o docente rechazado en `/api/staff/*`; token de personal rechazado en rutas de estudiante y docente.
- Token de un área rechazado en otra área; rol incorrecto dentro de la misma área rechazado.
- Suspensión: con el token aún vigente, la siguiente petición da 403.
- Solicitud: no se puede apuntar a la propia cuenta ni decidir la propia solicitud; solo el auditor decide.
- Auditoría: cada acción del personal deja una fila; `verify` detecta una fila alterada a mano; `audit_writer` no puede hacer `UPDATE` ni `DELETE`.
- Script: la contraseña no queda en el historial; el secreto TOTP en BD no está en texto plano.
- Endurecimiento (`tests/staff-hardening.test.js`, sin MySQL): un fallo de la base en `requireStaff` llega a `next(err)`; la cadena de auditoría sigue válida con 40 escrituras concurrentes; el seed de demo se niega a correr en producción o sin contraseña; las variables `AUDIT_DB_*` son obligatorias en producción.

## 10. Entregables de la Fase A

1. `docs/api.md` actualizado con la sección de personal.
2. `server/database/staff.sql` y `audit.sql`, más las instrucciones de creación del usuario `audit_writer`.
3. Código de las secciones 5 a 8.
4. Pruebas de la sección 9.
5. `docs/ops/vm-roles.md` queda para la fase de operaciones, aquí solo se deja el enlace.

## 11. Decisiones tomadas y preguntas abiertas

Resueltas:

1. **Suspensión de personal:** pasa por aprobación del auditor, como dice el diagrama. Es lo implementado.
2. **Contraseña del docente creado por el gestor:** contraseña temporal mostrada una sola vez, porque la app no tiene correo.
3. **Roles `analyst` y `moderator`:** se mantienen (decisión del equipo).

Abiertas:

1. **Base de auditoría:** hoy es un schema aparte en el mismo servidor MySQL. ¿Se mueve a otra VM? Es más fuerte pero exige coordinar con infraestructura.
2. **Auditoría que no lanza:** ¿las acciones sensibles (decidir solicitudes, crear docentes) deben fallar si no se puede registrar la auditoría?
3. **Foro y comentarios:** el diagrama los menciona en el Gestor de juego. ¿Se construyen o solo se documentan como fase futura?
