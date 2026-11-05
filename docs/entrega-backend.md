# Entrega de backend — punto de partida para el resto del equipo

**Estado:** rama `feat/backend-hardening-daniel`, basada en `origin/main` (`c4eca4a`,
lo desplegado el 22-oct-2026). **Publicada en `origin`**; PR #26 en borrador hacia
`develop` e issue #27 abierto. Sin fusionar y sin desplegar. Ver sección 6.
**Backend completo:** incluye tambien las fases B y C (modulos 6 al 9 del diseno),
implementadas segun `docs/specs/staff-fase-b.md` (propuesta para revision del equipo).
**Alcance:** autenticación y usuarios · actividades, corrección, XP y niveles ·
ranking · reto diario · endpoints del panel docente · modo demo
(`PLANNING.md §3`, responsables Daniel, Carlos y Sebastián).

Este documento es el **contrato congelado** de la parte de backend. Los demás
equipos deben construir sobre lo que aquí se declara. Todo lo que NO esté en la
sección 2 **no existe todavía**: no crear pantallas ni consumir endpoints que no
figuren ahí.

---

## 1. Qué quedó entregado

| Área | Entregado | Fuente del requisito |
|---|---|---|
| Auth | Registro de estudiantes, login en dos pasos, MFA TOTP (setup/confirm/login-mfa), cambio de contraseña, contraseña inicial obligatoria, **logout con revocación real del token** | PDF diseño §5.2; PR #24/#25 |
| Auth | Bloqueo 3 intentos / 10 s también en `mfa/setup` y `mfa/confirm`; fallos de login y MFA registrados en auditoría | PDF diseño §5.2 |
| Auth | **Anti-replay del TOTP** (último contador por cuenta, `UPDATE` atómico) en plataforma y personal | PDF diseño §5.2; PR #3 |
| Auth | Validación de tipos y tamaños (`classCode`, `password`, `answers`) → `400` en vez de `500` | PDF diseño §5.6 |
| Seguridad | `GET /health` no expone `err.message`; CORS admite `PUT`; secretos validados al arranque en producción | PDF diseño §5.6; `docs/api.md` |
| Actividades | Corrección en servidor, `correct_answer` nunca sale, **XP una sola vez por actividad** (anti-trampa) | PDF diseño §3 |
| XP / niveles | Reglas 5 XP por acierto / 100 XP por nivel, con pruebas de límites | `docs/api.md` |
| Ranking | Solo alias/avatar/XP/nivel, sin datos personales; función pura con pruebas de empates | PDF diseño §2.1 |
| Reto diario | Califica la respuesta en servidor, 10 XP solo si es correcta, `409` si ya se completó, **fecha en UTC**, **límite de 10 intentos por estudiante y día** | PR #22; `docs/api.md` |
| Panel docente | `/teacher/class`, `/students`, `/difficult-topics`, `PUT /class/grade` (una vez, `GRADE_LOCKED`); **declarar el grado queda en auditoría** | PDF diseño §4.1 |
| Modo demo | `POST /demo/advance-day` con `DEMO_MODE=true`, incremento **atómico**, auditado y con límite de 30/día | PDF diseño §5.7 |
| Pruebas | 14 archivos sin base de datos (**66 pruebas**) y, con MySQL 8 local, la suite completa de **27 archivos: 238 pruebas, 237 aprobadas, 0 fallidas, 1 omitida**. Ver sección 6 | PDF diseño §5.6/§5.8 |
| Documentación | `docs/api.md`, `docs/security.md`, `docs/backend.md`, `server/README.md`, `server/env.example` al día | — |

---

## 2. Contrato congelado (lo que otros DEBEN consumir)

### 2.1 Endpoints existentes

Base: `/api`. Protegidos con `Authorization: Bearer <token>`.
Contrato completo y formas de respuesta: **`docs/api.md`**.

| Módulo | Endpoints | Rol |
|---|---|---|
| 1 Estudiante | `POST /auth/register/student`, `POST /auth/login`, `POST /auth/login/mfa`, `POST /auth/logout`, `GET`/`PATCH /users/me`, `GET /activities/:moduleSlug`, `GET /activities/:id/questions`, `POST /activities/:id/attempts`, `GET /ranking`, `GET /daily-challenge`, `POST /daily-challenge/complete`, `POST /auth/mfa/setup`, `POST /auth/mfa/confirm`, `POST /auth/change-password` | `student` |
| 2 Docente | `GET /teacher/class`, `GET /teacher/students`, `GET /teacher/difficult-topics`, `PUT /teacher/class/grade` | `teacher` |
| 3 Identidad y Acceso | `GET /staff/accounts`, `GET`/`POST /staff/change-requests`, `POST /staff/teachers`, `POST /staff/teachers/:id/reset-mfa`, `POST /staff/teachers/:id/reset-grade` | `access_manager` |
| 4 Auditoría | `GET /staff/audit`, `GET /staff/audit/verify`, `POST /staff/change-requests/:id/decision` | `auditor` |
| 5 Datos y Reportes | `GET /staff/analytics/dashboard` | `analyst` |
| 6 Gestion de Contenidos | `GET/POST/PUT/DELETE /staff/content/activities...` (14 endpoints) | `content_manager`, `content_reviewer` |
| 7 Gestion del Juego | `/staff/game/rules`, `/aliases`, `/daily-challenges` | `game_manager` |
| 8 Comunidad y Moderacion | `POST /reports`, `GET/PATCH /staff/reports` | `moderator` (y estudiantes/docentes al reportar) |
| 9 Soporte | `GET/PATCH /staff/reports` | `support` (y estudiantes/docentes al reportar) |
| Modo demo | `POST /demo/advance-day` (requiere `DEMO_MODE=true`) | cualquier rol autenticado |
| Salud | `GET /health` | público |

**Los 8 roles de gestion ya tienen endpoints propios.** Los estudiantes y docentes
pueden reportar contenido (`POST /api/reports`), como pide la matriz §4.2.

Login de personal: `POST /staff/auth/login` (usuario + contraseña + TOTP),
`GET /staff/me`.

### 2.2 Matriz rol → secciones que HOY existen

| Rol | Módulos del PDF §4.2 | Implementado en la página |
|---|---|---|
| `student` | 1, 8 (reportar), 9 (sus casos) | **1** (parcial: sin "jugar"); 8 y 9 no existen |
| `teacher` | 2, 5, 8, 9 | **2** y parte de **5**; 8 y 9 no existen |
| `access_manager` | 3, 9 (escalados) | **3** |
| `auditor` | 3, 4 | **3 y 4** |
| `analyst` | 5, 6, 7 (agregados) | **5** |
| `content_manager` | 6, 9 | **ninguno** |
| `content_reviewer` | 6 | **ninguno** |
| `game_manager` | 7 | **ninguno** |
| `moderator` | 8 | **ninguno** |
| `support` | 9 | **ninguno** |

`ROLE_SECTIONS` en `client/src/pages/staff/StaffLayout.jsx` solo define
`access_manager`, `auditor` y `analyst`. Por eso, aunque el backend ya sirve los
cinco modulos restantes, **la pagina desplegada sigue mostrando "Aún no hay
paneles para tu rol"** para esos cinco roles: faltan las pantallas del cliente.
Eso es exactamente la parte que sigue (ver seccion 3).

> **Aclaración importante:** el PDF §4.2 y su página 11 dicen explícitamente que
> *"el moderador o Soporte solo necesitan un módulo: es mínimo privilegio"*. Que
> el moderador tenga una sola opción **no es un error**: es el diseño. Los roles
> multi-módulo son docente, estudiante, analista, gestor de accesos, auditor y
> gestor de contenido.

---

## 3. Qué deben hacer los demás, y dónde se conecta

### Frontend (Fernando, Cristian, Heather)
- Consumir **solo** los endpoints de la sección 2.1; `docs/api.md` es la fuente.
- Construir las 5 pantallas que faltan (`/staff/content`, `/staff/review`,
  `/staff/game`, `/staff/moderation`, `/staff/support`) y ampliar `STAFF_SECTIONS`
  y `ROLE_SECTIONS` en `StaffLayout.jsx`. El backend ya esta listo y documentado.
- `POST /auth/logout` es nuevo: el cierre de sesión actual solo borra el token en
  memoria. Llamarlo invalida el token también en el servidor.
- El prototipo `PaginasWebs` usa datos falsos (`USE_MOCK`) y fue excluido en el
  PR #20: **no se debe reutilizar**, sino conectar las pantallas nuevas a los
  endpoints reales de la sección 2.1.
- La Fase B/C **ya esta implementada en el backend** siguiendo el spec
  `origin/docs/spec-fase-b`. Las 3 decisiones abiertas de ese spec se tomaron con
  los valores que el propio spec propone: el gestor archiva directamente con
  auditoria, cualquier `content_manager` puede editar cualquier borrador, y el
  orden fue servidor primero. Si el lider tecnico decide otra cosa, son cambios
  acotados en `content.service.js`.

### QA (Nathaniel, Isora)
- `docs/security.md §5` tiene **29 casillas de pentest sin marcar**. Ejecutarlas en
  el entorno de pruebas, no en producción.
- Las pruebas automáticas nuevas están en `server/tests/`: `day`, `xp.service`,
  `answers`, `answers-shape`, `display-name`, `totp`, `totp-replay`, `ranking`,
  `security-inputs`. Se corren con `npm test` sin necesidad de MySQL.
- `npm audit` ya se ejecutó (4 → 2 vulnerabilidades, ver sección 6). Quedan pendientes las 29 casillas del checklist de pentest y las pruebas de navegador.

### Infraestructura / líder técnico (Gabriel)
**Orden obligatorio antes de fusionar a `main`:**
1. Aplicar `server/database/migrations/phase5-content-review.sql` en la **VM-BD**
   (estado del contenido, `content_reports`, `alias_hidden`). **Sin esta migracion
   las consultas de estudiantes fallan**, porque filtran por `status = 'published'`.
2. Aplicar `server/database/migrations/phase6-totp-replay.sql` en la **VM-BD**
   (agrega `mfa_last_counter` a `users` y `staff_accounts`). El código degrada sin
   romperse si la columna falta, pero el anti-replay no actúa.
3. Revisar `server/database/migrations/phase6-hardening.sql`: el índice de
   `activities.level` es seguro; las tres restricciones `UNIQUE` están
   **comentadas** y traen `SELECT` de verificación previa. Ejecutarlos solo si no
   hay duplicados.
4. Verificar `.env`: `NODE_ENV`, `JWT_SECRET`, `STAFF_JWT_SECRET`, `STAFF_MFA_KEY`
   (32 bytes en base64), `AUDIT_DB_*` y `DEMO_MODE=false` fuera de la presentación.
   `server/env.example` es la plantilla.
5. Revisar y fusionar la rama; el despliegue a `main` es automático por
   `.github/workflows/deploy.yml`.

### Fase B/C (contenido, juego, moderación, soporte)
- No hay rutas, controladores, servicios ni tablas para esos módulos en `main`.
- El spec propuesto está en la rama `origin/docs/spec-fase-b` y **no está aprobado**.
- Decisiones abiertas de ese spec: quién archiva, quién puede editar un borrador y
  el orden de implementación.

---

## 4. Lo que queda abierto y quién lo decide

| Tema | Dueño de la decisión |
|---|---|
| MFA obligatorio en estudiantes (rompería las cuentas demo) | Grupo / profesor |
| Minijuegos y "jugar las actividades" | Frontend + grupo (excluido en PR #15/#20) |
| Fase B/C: aprobar las 3 decisiones abiertas del spec | Líder técnico |
| Las 5 pantallas de gestion que faltan | Frontend |
| Cuatro ojos en `reset-mfa` / `reset-grade` | Fase A (hoy es acción directa de `access_manager`) |
| `audit.record()` fail-closed si cae la BD de auditoría | Pregunta abierta `docs/specs/staff-fase-a.md:245` |
| HTTPS / CSP del HTML estático / cuenta de emergencia / alertas / respaldos cifrados | Infraestructura |
| `deploy.yml` con `npm test` como gate de CI | Líder técnico |
| Recuperación de contraseña, mínimo de 4 caracteres, rotación de `classCode` | Excluidos del MVP / pendientes de política |

---

## 5. Verificación de esta entrega

```bash
cd server
npm test                 # 66 pruebas sin base de datos, 0 fallidas
node --check src/**/*.js # sintaxis
```

Cambios verificados: 59 archivos (modificados y nuevos, en dos commits), sin `.env`, sin secretos en
el repositorio, sin push ni merge. El clon de trabajo del autor
(`feat/security-phase2`) no se tocó.

---

## 6. Cierre y verificación final (5 de noviembre de 2026)

Esta sección se añade sin modificar el contrato de las secciones 1 a 5, que sigue
siendo la referencia para los demás equipos.

### 6.1. Estado en GitHub

- Rama `feat/backend-hardening-daniel` publicada en `origin`.
- **PR #26** abierto en **borrador** hacia `develop`, estado `MERGEABLE`.
- **Issue #27** abierto con el traspaso a frontend, QA y líder técnico.
- `main` (`c4eca4a`) y `develop` (`03f1cae`) sin cambios: **no hay merge ni despliegue**.
  `develop` es idéntico a `main` (0 commits de diferencia), así que la rama basada en
  `main` no deja trabajo fuera del PR.
- No se modificó `.env` real ni se versionaron secretos; `server/env.example` es la
  plantilla (se añadió `DB_PORT=3306`).

### 6.2. Verificación con MySQL 8 local

Se levantó MySQL 8 en un contenedor Docker **sin datos de producción** y se aplicaron
`schema.sql`, `staff.sql`, las 9 migraciones y `audit.sql` sobre dos bases separadas,
más los seeds del repositorio. Resultado real, con el runner nativo `node:test` y sin
`--test-force-exit`:

| Verificación | Resultado |
|---|---|
| Archivos de prueba | 27 de 27, código de salida 0 |
| Pruebas | 238 (237 aprobadas, 0 fallidas, 1 omitida) |
| Migraciones en MySQL 8 | 9 archivos, 0 errores |
| Tablas | 14 en `englishpanama` y `audit_log` en `englishpanama_audit` |

### 6.3. Correcciones aplicadas en el cierre

- `migrations/phase5-content-review.sql`: duplicar las comillas internas del `ENUM`
  dentro del `SET @sql`. Sin esto MySQL 8 devolvía `ERROR 1064` y la migración no
  aplicaba. **Es obligatorio usar esta versión corregida en la VM-BD.**
- `src/config/db.js` y `src/config/auditDb.js`: respetar `DB_PORT` (antes se ignoraba).
- `tests/mfa-platform.test.js` y `tests/session.test.js`: cerrar el pool de auditoría
  en el hook final; sin eso el archivo no terminaba.
- `tests/session.test.js` y `tests/demo-accounts.test.js`: no reutilizar el mismo código
  TOTP dentro de la ventana de 30 s. El anti-replay (`mfa_last_counter`) rechaza la
  repetición correctamente; eran las pruebas las que debían limpiar el contador entre
  escenarios, **no** el backend el que debía debilitarse.
- `server/package-lock.json`: `npm audit fix --package-lock-only` redujo las
  vulnerabilidades de **4 a 2**. Las 2 restantes (`tar` y `@mapbox/node-pre-gyp`,
  dependencias de instalación de `bcrypt`) requieren `npm audit fix --force` (cambio
  de versión mayor) y quedan documentadas, **no aplicadas**.

### 6.4. Orden obligatorio antes de fusionar (sin cambios respecto de la sección 3)

1. Aplicar en la **VM-BD**, con la versión corregida: `phase5-content-review.sql`,
   `phase6-totp-replay.sql` y revisar `phase6-hardening.sql`.
2. Verificar `.env`: `NODE_ENV`, `JWT_SECRET`, `STAFF_JWT_SECRET`, `STAFF_MFA_KEY`
   (32 bytes en base64), `AUDIT_DB_*`, `DB_PORT` y `DEMO_MODE=false`.
3. Revisar y fusionar el PR #26; recién entonces `deploy.yml` despliega a `main`.
4. Frontend: las 5 pantallas de gestión. QA: las 29 casillas de pentest.
