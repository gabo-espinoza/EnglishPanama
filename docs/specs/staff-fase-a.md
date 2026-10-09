# Spec — Cuentas de gestión, Fase A (base de personal, MFA y auditoría)

Estado: **borrador para revisión**. Origen: diagrama "English Panamá" (usuarios, roles de gestión, arquitectura, modularidad y seguridad).

## 1. Decisiones ya tomadas

1. **Las cuentas de gestión se crean solo desde el servidor** (script CLI ejecutado por SSH). No existe endpoint para crearlas, ni registro público, ni invitaciones por API.
2. **Gestor de base de datos y Gestor de la aplicación no son cuentas de la app.** Son usuarios Linux en las VM, con permisos documentados en `docs/ops/vm-roles.md` (fuera de esta fase).
3. **Un gestor tiene exactamente un rol.** Así la separación de funciones se cumple por construcción.
4. Se trabaja por fases, con spec e implementación por fase.

## 2. Roles de la app

| Rol (`staff_role`) | Área (`aud` del token) | Fase |
|---|---|---|
| `access_manager` (Gestor de usuarios y accesos) | `access` | **A** |
| `auditor` | `audit` | **A** |
| `content_manager` | `content` | B |
| `content_reviewer` | `content` | B |
| `game_manager` | `game` | C |
| `support` | `support` | C |

`content_manager` y `content_reviewer` comparten área pero distinto rol; el middleware valida área **y** rol.

## 3. Alcance de la Fase A

- Tablas de personal, roles y estado de cuenta.
- Script de creación de cuentas de gestión (solo servidor).
- Login de personal con contraseña + TOTP, sesión corta, token con área.
- Middleware `requireStaff(area, roles?)` que revalida contra la base en cada petición.
- Registro de auditoría en una base aparte, solo-inserción.
- Rol **Gestor de usuarios y accesos**: crear cuentas de docente, proponer suspensión/activación de personal, métricas anónimas.
- Rol **Auditor**: consultar auditoría, aprobar/rechazar cambios a cuentas de personal.

Fuera de la fase: contenido y revisión (B), moderación y soporte (C), endpoints de sistema y `analytics` avanzado, foro.

## 4. Modelo de datos

Base principal (`englishpanama`), archivo nuevo `server/database/staff.sql`:

```sql
CREATE TABLE staff_accounts (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username         VARCHAR(50)  NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    role             ENUM('access_manager','auditor','content_manager',
                          'content_reviewer','game_manager','support') NOT NULL,
    status           ENUM('active','suspended') NOT NULL DEFAULT 'active',
    mfa_secret_enc   VARBINARY(255) NOT NULL COMMENT 'TOTP cifrado AES-256-GCM, clave en env',
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

`requireStaff(area, roles?)` en cada petición: verifica firma y `aud`, **consulta `staff_accounts`** (existe, `active`, rol coincide) y registra la acción en auditoría. Así una suspensión surte efecto de inmediato aunque el token siga vigente.

Enrolamiento TOTP: el script de creación imprime **una sola vez** el URI `otpauth://` (y opcionalmente un QR en terminal) para el celular del gestor. El secreto se guarda cifrado.

## 6. Script de creación (solo servidor)

`server/scripts/create-staff.js`:

```
node scripts/create-staff.js --username ana.gomez --role auditor
```

- Pide la contraseña por prompt interactivo (no por argumento, para no dejarla en el historial del shell). Exige mínimo 12 caracteres.
- Genera el secreto TOTP, lo cifra con `STAFF_MFA_KEY`, inserta la cuenta y muestra el URI `otpauth://`.
- Escribe en auditoría `actor_type='system'`, `action='staff.create'`, con el usuario Linux que lo ejecutó.
- Solo corre en la VM del servidor, con el `.env` de producción. No se expone por HTTP.
- Gemelos: `list-staff.js` (solo lectura) y `reset-staff-mfa.js` (regenera TOTP, queda en auditoría).

## 7. API (a agregar a `docs/api.md` antes de implementar)

Prefijo `/api/staff`. Todos devuelven errores `{ "error": "..." }`.

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `POST /staff/auth/login` | público | Login con contraseña + TOTP. `200 { token, role, expiresIn }` |
| `GET /staff/me` | cualquier gestor | Rol, área y estado de la cuenta |
| `GET /staff/accounts` | `access_manager`, `auditor` | Lista de cuentas de personal (sin secretos) |
| `POST /staff/change-requests` | `access_manager` | Body `{ targetId, action }` con `suspend` o `activate`. Crea solicitud `pending`. No puede apuntar a su propia cuenta. |
| `GET /staff/change-requests?status=` | `access_manager`, `auditor` | Lista solicitudes |
| `POST /staff/change-requests/:id/decision` | `auditor` | Body `{ decision: "approved" \| "rejected" }`. Si se aprueba, aplica el cambio en transacción. |
| `POST /staff/teachers` | `access_manager` | Crea cuenta de docente, devuelve contraseña temporal y `classCode` |
| `GET /staff/analytics/dashboard` | `access_manager` | Métricas agregadas y anónimas (totales de estudiantes, docentes, actividades; sin alias ni nombres) |
| `GET /staff/audit` | `auditor` | Consulta paginada y filtrable por actor, acción y fechas |
| `GET /staff/audit/verify` | `auditor` | Recorre la cadena de hashes y devuelve `{ ok, brokenAtId? }` |

Reglas de separación de funciones aplicadas:

- Quien solicita un cambio no puede decidirlo, y nadie decide sobre su propia cuenta.
- El `access_manager` no ve contraseñas ni datos personales de alumnos, ni toca contenido o servidor.
- El auditor solo escribe decisiones sobre solicitudes; no puede modificar ni borrar el registro.
- Ningún endpoint de personal permite darse permisos a sí mismo.

## 8. Estructura de código

```
server/src/
├── config/auditDb.js            Pool con credenciales audit_writer
├── middleware/staffAuth.js      requireStaff(area, roles?)
├── services/staffAuth.service.js    login, TOTP, bloqueo
├── services/audit.service.js        record(), list(), verify()
├── services/staffAccounts.service.js
├── controllers/ staff*.controller.js
└── routes/staff.routes.js       montado en routes/index.js bajo /staff
server/scripts/                  create-staff.js, list-staff.js, reset-staff-mfa.js
```

Dependencias nuevas: `otplib` (TOTP), `express-rate-limit` (límite por IP en login). El cifrado usa `crypto` de Node.

Variables nuevas en `env.example`: `STAFF_JWT_SECRET`, `STAFF_MFA_KEY` (32 bytes en base64), `AUDIT_DB_HOST`, `AUDIT_DB_USER`, `AUDIT_DB_PASSWORD`, `AUDIT_DB_NAME`.

## 9. Pruebas

- Login: credenciales inválidas, TOTP inválido, cuenta suspendida y bloqueo tras 5 fallos dan el mismo mensaje.
- Token de estudiante o docente rechazado en `/api/staff/*`; token de personal rechazado en rutas de estudiante y docente.
- Token de un área rechazado en otra área; rol incorrecto dentro de la misma área rechazado.
- Suspensión: con el token aún vigente, la siguiente petición da 403.
- Solicitud: no se puede apuntar a la propia cuenta ni decidir la propia solicitud; solo el auditor decide.
- Auditoría: cada acción del personal deja una fila; `verify` detecta una fila alterada a mano; `audit_writer` no puede hacer `UPDATE` ni `DELETE`.
- Script: la contraseña no queda en el historial; el secreto TOTP en BD no está en texto plano.

## 10. Entregables de la Fase A

1. `docs/api.md` actualizado con la sección de personal.
2. `server/database/staff.sql` y `audit.sql`, más las instrucciones de creación del usuario `audit_writer`.
3. Código de las secciones 5 a 8.
4. Pruebas de la sección 9.
5. `docs/ops/vm-roles.md` queda para la fase de operaciones, aquí solo se deja el enlace.

## 11. Preguntas abiertas

1. **¿La suspensión pasa por aprobación del auditor?** La spec asume que sí, porque el diagrama dice que cambiar una cuenta de gestor lo requiere. Si el profesor prefiere suspensión inmediata como medida de emergencia, se agrega con auditoría posterior.
2. **¿La base de auditoría va en la misma instancia MySQL (schema aparte) o en otra VM?** La spec asume el mismo servidor con schema y usuario aparte. Una VM distinta es más fuerte pero exige coordinar con el equipo de infraestructura.
3. **¿Contraseña temporal del docente creado por el gestor o correo de activación?** La spec asume contraseña temporal mostrada una sola vez, porque la app no tiene correo.
