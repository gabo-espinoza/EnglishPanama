# Server — English Panamá (API REST)

Backend del MVP: Node.js + Express + MySQL, autenticado con JWT y roles
`student` / `teacher`.

## Arquitectura (capas)

```
routes/        Define endpoints y aplica middleware (auth, rol, rate limit)
controllers/   Recibe el request, delega en el service, arma la response
services/      Lógica de negocio (XP, corrección, ranking, reto diario, docente)
config/db.js   Pool de conexiones MySQL (acceso a datos)
middleware/    Auth (JWT + roles), errores, rate limit
utils/         Utilidades compartidas (AppError)
```

Regla de oro: **una ruta nunca habla directo con la base**. El flujo es siempre
`ruta → controlador → servicio → pool`. Toda consulta usa sentencias
parametrizadas (`?`), nunca concatenación de strings.

## Cómo correrlo localmente

```bash
cd server
cp env.example .env      # completar DB_*, JWT_SECRET; DEMO_MODE=true para demostrar
npm install
mysql -u root -p < database/schema.sql
npm run dev              # http://localhost:3000/api/health
```

Variables principales (ver `env.example`): `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `DEMO_MODE`, `CORS_ORIGIN`, `TRUST_PROXY`.

## Pruebas

```bash
npm test
```

`tests/api.test.js` verifica los casos que no dependen de la base de datos
(`401` sin token, `403` por rol, validación de entrada, cuerpo grande, modo demo
apagado). Para pruebas con datos reales, cargar un seed en MySQL y usar los
ejemplos de [`../docs/api.md`](../docs/api.md).

## Documentación

- [`../docs/api.md`](../docs/api.md) — contrato de endpoints y formatos.
- [`../docs/backend.md`](../docs/backend.md) — resumen de la implementación.
- [`../docs/security.md`](../docs/security.md) — decisiones de seguridad.
