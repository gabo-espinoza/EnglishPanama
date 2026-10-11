# Backend - English Panama (MVP)

Resumen tecnico de la parte backend del MVP: que hay implementado, donde vive cada
archivo y como probarlo. El detalle de endpoints y formatos esta en [`api.md`](api.md);
las decisiones de seguridad, en [`security.md`](security.md).

## Arquitectura (capas)

```
routes/       Define endpoints y aplica middleware (auth, rol, rate limit)
controllers/  Recibe el request, delega en el service, arma la response
services/     Logica de negocio (XP, correccion, ranking, reto diario)
config/db.js  Pool de conexiones MySQL (acceso a datos)
middleware/   Auth (JWT + roles), errores, rate limit
utils/        Utilidades compartidas (AppError)
```

Regla: una ruta nunca habla directo con la base. Ruta -> controlador -> servicio -> `pool`.

## Archivos de esta entrega (rama `feat/backend-mvp`)

**Nuevos**

| Archivo | Rol |
|---|---|
| `src/utils/AppError.js` | Error con codigo HTTP, para responder 4xx en vez de 500. |
| `src/services/xp.service.js` | Reglas de XP, niveles y datos de la barra de progreso. |
| `src/services/settings.service.js` | Lectura/escritura de `app_settings` (offset demo). |
| `src/services/activity.service.js` | Listar actividades, preguntas y corregir intentos. |
| `src/services/dailyChallenge.service.js` | Reto diario y completado. |
| `src/services/demo.service.js` | Avance del dia en modo demo. |
| `src/services/ranking.service.js` | Ranking de la clase. |
| `src/services/teacher.service.js` | Panel docente (estudiantes y temas dificiles). |
| `src/services/user.service.js` | Perfil propio (`/users/me`): leer y editar avatar/XP o nombre. |
| `src/controllers/activity.controller.js` | Endpoints de actividades. |
| `src/controllers/dailyChallenge.controller.js` | Endpoints del reto diario. |
| `src/controllers/ranking.controller.js` | Endpoint de ranking. |
| `src/controllers/teacher.controller.js` | Endpoints del panel docente. |
| `src/controllers/demo.controller.js` | Endpoint de modo demo. |
| `src/controllers/user.controller.js` | Endpoints de usuarios (`/users/me`). |
| `src/routes/activities.routes.js` | Rutas de actividades. |
| `src/routes/dailyChallenge.routes.js` | Rutas del reto diario. |
| `src/routes/ranking.routes.js` | Ruta de ranking. |
| `src/routes/teacher.routes.js` | Rutas del panel docente. |
| `src/routes/demo.routes.js` | Ruta de modo demo. |
| `src/routes/users.routes.js` | Rutas de usuarios (`/users/me`). |
| `src/middleware/rateLimiter.js` | Limites de peticiones (general y auth). |
| `tests/api.test.js` | Pruebas de integracion (ver abajo). |

**Modificados**

| Archivo | Cambio |
|---|---|
| `src/routes/index.js` | Monta las rutas nuevas. |
| `src/app.js` | `helmet`, limite de body, CORS configurable, rate limit general. |
| `src/middleware/errorHandler.js` | Maneja JSON invalido (`400`) y body grande (`413`); no filtra trazas. |
| `src/routes/auth.routes.js` | Aplica el limite estricto a login/registro. |
| `src/services/auth.service.js` | Valida formato y largo de `username`/`password`/`displayName`. |
| `package.json` | Agrega `helmet` y `express-rate-limit`. |
| `env.example` | Agrega `CORS_ORIGIN`, `TRUST_PROXY` y las variables `STAFF_*` y `AUDIT_DB_*`. |
| `src/middleware/auth.js` | **Zero trust**: revalida la cuenta y la version de token contra la base en cada peticion. |
| `src/services/auth.service.js` | Emite tokens con `token_version` (`tv`) y 2 horas de vida; verifica `is_active`. |
| `src/routes/index.js` | Monta el modulo `/staff`. |
| `database/schema.sql` | Agrega `users.is_active` y `users.token_version`. |

### Base de personal de gestion (Fase A)

**Nuevos**

| Archivo | Rol |
|---|---|
| `src/config/staffRoles.js` | Define los 8 roles de gestion, sus areas y utilidades de permisos. |
| `src/config/auditDb.js` | Pool de la base de auditoria separada (con reserva a la base principal). |
| `src/utils/totp.js` | TOTP propio (Node `crypto`, sin dependencias): generar secreto y validar codigos. |
| `src/utils/mfaCrypto.js` | Cifra/descifra el secreto TOTP con AES-256-GCM (`STAFF_MFA_KEY`). |
| `src/middleware/staffAuth.js` | `requireStaff({ area, roles })`: revalida la cuenta y exige area + rol. |
| `src/services/audit.service.js` | Registro de auditoria con cadena de hashes SHA-256 y verificacion. |
| `src/services/staffAuth.service.js` | Login de personal: bcrypt + TOTP, bloqueo por intentos, emite token corto. |
| `src/services/staffAccounts.service.js` | Listar cuentas, crear docentes, solicitudes de cambio y decisiones. |
| `src/services/staffAnalytics.service.js` | Metricas agregadas y anonimas para el panel. |
| `src/controllers/staffAuth.controller.js` | `POST /staff/auth/login`. |
| `src/controllers/staffAccounts.controller.js` | Cuentas, solicitudes, docentes y metricas. |
| `src/controllers/staffAudit.controller.js` | Consulta y verificacion de la auditoria. |
| `src/routes/staff.routes.js` | Rutas `/staff` con su middleware de area/rol. |
| `database/staff.sql` | Tablas `staff_accounts` y `staff_change_requests`. |
| `database/audit.sql` | Base y tabla `audit_log` (solo anexar). |
| `scripts/create-staff.js` | Crea una cuenta de gestion (imprime el secreto TOTP una vez). |
| `scripts/seed-demo-staff.js` | Siembra las 24 cuentas de demostracion (3 por rol, 8 roles) de forma idempotente. |
| `scripts/list-staff.js` | Lista las cuentas de gestion (sin secretos). |
| `scripts/reset-staff-mfa.js` | Regenera el MFA de una cuenta de gestion. |
| `tests/staff.test.js` | Pruebas de login, permisos, separacion de funciones y auditoria. |

## Como correrlo localmente

```bash
cd server
cp env.example .env      # completar DB_*, JWT_SECRET, STAFF_JWT_SECRET, STAFF_MFA_KEY, AUDIT_DB_*
npm install
```

Preparar la base (una vez):

```bash
mysql -u root -p < database/schema.sql     # app de estudiantes/docentes
mysql -u root -p < database/staff.sql      # cuentas de gestion
mysql -u root -p < database/audit.sql      # base de auditoria (englishpanama_audit)
node scripts/create-staff.js ana.accesos access_manager   # imprime el secreto TOTP
node scripts/seed-demo-staff.js                           # 24 cuentas demo (3 por rol)
```

Arrancar:

```bash
npm run dev              # http://localhost:3000/api/health
```

## Como probarlo

```bash
cd server
npm test
```

`npm test` ejecuta dos archivos:

- `tests/api.test.js`: rutas protegidas sin token (`401`), rol equivocado (`403`), aislamiento
  entre el token de estudiante y el de gestion, validacion de entrada, `403` del modo demo
  apagado y formato de errores.
- `tests/staff.test.js`: login de gestion con TOTP, permisos por area/rol, separacion de
  funciones (solicitar / no decidir / suspender) y verificacion de la cadena de auditoria.

Ambos cargan `.env` si existe. Las pruebas que necesitan MySQL o `STAFF_MFA_KEY` **se omiten
solas** cuando no estan disponibles, asi que la suite corre igual en una maquina sin base.
Para pruebas manuales con datos reales, usar los `curl` de `api.md`.

