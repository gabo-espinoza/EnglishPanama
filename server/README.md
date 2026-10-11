# Backend - English Panama

Servidor Express + MySQL del proyecto. Cubre dos mundos con controles separados:

- **App de estudiantes y docentes**: dos roles (`student`, `teacher`), token de 2 horas.
- **Personal de gestion (Fase A)**: 8 roles repartidos en 7 departamentos (areas), login con
  MFA (TOTP), token de 20 minutos y auditoria en una base aparte.

## Arquitectura (capas)

```
routes/       Define endpoints y aplica middleware (auth, area/rol, rate limit)
controllers/  Recibe el request, delega en el service, arma la response
services/     Logica de negocio (XP, correccion, ranking, reto diario, gestion)
config/db.js  Pool de conexiones MySQL (acceso a datos)
middleware/   Auth (JWT + roles), auth de gestion (area/rol), errores, rate limit
utils/        Utilidades compartidas (AppError, totp, mfaCrypto)
```

Regla de oro: **una ruta nunca habla directo con la base**. El flujo es siempre
`ruta -> controlador -> servicio -> pool`. Toda consulta usa sentencias
parametrizadas (`?`), nunca concatenacion de strings.

## Como correrlo localmente

```bash
cd server
cp env.example .env      # completar DB_*, JWT_SECRET, STAFF_JWT_SECRET, STAFF_MFA_KEY, AUDIT_DB_*
npm install
mysql -u root -p < database/schema.sql    # app de estudiantes/docentes
mysql -u root -p < database/staff.sql     # cuentas de gestion
mysql -u root -p < database/audit.sql     # base de auditoria
node scripts/create-staff.js ana.accesos access_manager   # imprime el secreto TOTP
node scripts/seed-demo-staff.js                           # 24 cuentas demo (3 por rol)
npm run dev              # http://localhost:3000/api/health
```

Variables principales (ver `env.example`): `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `DEMO_MODE`, `CORS_ORIGIN`, `TRUST_PROXY`,
`STAFF_JWT_SECRET`, `STAFF_MFA_KEY`, `AUDIT_DB_HOST`, `AUDIT_DB_USER`,
`AUDIT_DB_PASSWORD`, `AUDIT_DB_NAME`.

## Pruebas

```bash
npm test
```

- `tests/api.test.js`: `401` sin token, `403` por rol, aislamiento entre token de
  estudiante y de gestion, validacion de entrada, cuerpo grande y modo demo apagado.
- `tests/staff.test.js`: login de gestion con TOTP, permisos por area/rol, separacion
  de funciones y verificacion de la cadena de auditoria.

Las pruebas cargan `.env` si existe; las que necesitan MySQL o `STAFF_MFA_KEY` se omiten
solas cuando faltan, asi que `npm test` tambien pasa en una maquina sin base.

## Documentacion

- [`../docs/api.md`](../docs/api.md) - contrato de endpoints y formatos.
- [`../docs/backend.md`](../docs/backend.md) - resumen de la implementacion.
- [`../docs/security.md`](../docs/security.md) - decisiones de seguridad.
