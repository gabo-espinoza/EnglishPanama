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
utils/        Utilidades compartidas (AppError, totp, mfaCrypto, answers, day)
```

Regla de oro: **una ruta nunca habla directo a la base**. El flujo es siempre
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
DEMO_STAFF_PASSWORD='<12+ caracteres>' node scripts/seed-demo-staff.js   # 24 cuentas demo; solo desarrollo, no corre en produccion
npm run dev              # http://localhost:3000/api/health
```

Variables principales (ver `env.example`): `NODE_ENV`, `DB_HOST`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `DEMO_MODE`, `CORS_ORIGIN`, `TRUST_PROXY`,
`AUTH_RATE_LIMIT_MAX`, `STAFF_JWT_SECRET`, `STAFF_MFA_KEY`, `AUDIT_DB_HOST`,
`AUDIT_DB_USER`, `AUDIT_DB_PASSWORD`, `AUDIT_DB_NAME`. No existe `DB_PORT`:
el pool usa el puerto por defecto de MySQL (3306).

## Pruebas

```bash
npm test
```

`node --test` descubre automaticamente todos los `tests/*.test.js` (25 archivos).
Ademas de las pruebas de integracion (`api.test.js`, `staff.test.js`,
`mfa-platform.test.js`, `mfa-teacher.test.js`, `class-grade.test.js`,
`daily-challenge.test.js`, `demo-accounts.test.js`, ...), hay pruebas unitarias
sin base de datos para las reglas puras: `day.test.js`, `xp.service.test.js`, `answers.test.js`, `answers-shape.test.js`, `display-name.test.js`, `totp.test.js`, `totp-replay.test.js`, `ranking.test.js` y `security-inputs.test.js`.

Las pruebas cargan `.env` si existe; las que necesitan MySQL o `STAFF_MFA_KEY` se omiten
solas cuando faltan, asi que `npm test` tambien pasa en una maquina sin base.

## Documentacion

- [`../docs/api.md`](../docs/api.md) - contrato de endpoints y formatos.
- [`../docs/backend.md`](../docs/backend.md) - resumen de la implementacion.
- [`../docs/security.md`](../docs/security.md) - decisiones de seguridad.
