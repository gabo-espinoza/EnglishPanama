# Backend — English Panamá (MVP)

Resumen técnico de la parte backend del MVP: qué hay implementado, dónde vive cada
archivo y cómo probarlo. El detalle de endpoints y formatos está en [`api.md`](api.md);
las decisiones de seguridad, en [`security.md`](security.md).

## Arquitectura (capas)

```
routes/       Define endpoints y aplica middleware (auth, rol, rate limit)
controllers/  Recibe el request, delega en el service, arma la response
services/     Lógica de negocio (XP, corrección, ranking, reto diario)
config/db.js  Pool de conexiones MySQL (acceso a datos)
middleware/   Auth (JWT + roles), errores, rate limit
utils/        Utilidades compartidas (AppError)
```

Regla: una ruta nunca habla directo con la base. Ruta → controlador → servicio → `pool`.

## Archivos de esta entrega (rama `feat/backend-mvp`)

**Nuevos**

| Archivo | Rol |
|---|---|
| `src/utils/AppError.js` | Error con código HTTP, para responder 4xx en vez de 500. |
| `src/services/xp.service.js` | Reglas de XP, niveles y datos de la barra de progreso. |
| `src/services/settings.service.js` | Lectura/escritura de `app_settings` (offset demo). |
| `src/services/activity.service.js` | Listar actividades, preguntas y corregir intentos. |
| `src/services/dailyChallenge.service.js` | Reto diario y completado. |
| `src/services/demo.service.js` | Avance del día en modo demo. |
| `src/services/ranking.service.js` | Ranking de la clase. |
| `src/services/teacher.service.js` | Panel docente (estudiantes y temas difíciles). |
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
| `src/middleware/rateLimiter.js` | Límites de peticiones (general y auth). |
| `tests/api.test.js` | Pruebas de integración (ver abajo). |

**Modificados**

| Archivo | Cambio |
|---|---|
| `src/routes/index.js` | Monta las rutas nuevas. |
| `src/app.js` | `helmet`, límite de body, CORS configurable, rate limit general. |
| `src/middleware/errorHandler.js` | Maneja JSON inválido (`400`) y body grande (`413`); no filtra trazas. |
| `src/routes/auth.routes.js` | Aplica el límite estricto a login/registro. |
| `src/services/auth.service.js` | Valida formato y largo de `username`/`password`/`displayName`. |
| `package.json` | Agrega `helmet` y `express-rate-limit`. |
| `env.example` | Agrega `CORS_ORIGIN` y `TRUST_PROXY`. |

## Cómo correrlo localmente

```bash
cd server
cp env.example .env      # completar DB_*, JWT_SECRET; DEMO_MODE=true si vas a demostrar
npm install
npm run dev              # http://localhost:3000/api/health
```

## Cómo probarlo

```bash
cd server
npm test
```

Las pruebas (`tests/api.test.js`) levantan la app y verifican los casos que no dependen
de la base de datos: `401` sin token, `403` con rol equivocado, validación de entrada,
`403` del modo demo apagado y formato de errores. Para pruebas con datos reales,
cargar un seed en MySQL y usar los `curl` de `api.md`.
