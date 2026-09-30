# Flujo de trabajo en GitHub

Este documento explica cómo se mueve el código desde que alguien empieza una tarea hasta que queda en producción. Léelo antes de tu primer PR.

## 1. Antes de empezar una tarea

```bash
git checkout main
git pull origin main
git checkout -b tipo/descripcion-corta
```

El nombre de la rama sigue el formato de [`BRANCHING.md`](../BRANCHING.md) (por ejemplo `feat/vocabulary-memory-game`). Nunca se trabaja directo sobre `main`.

## 2. Mientras trabajás

- Commits en formato [Conventional Commits](https://www.conventionalcommits.org/), en minúsculas: `feat: add xp service`, `fix: prevent duplicate daily completion`.
- Si tu tarea agrega o cambia un endpoint, actualizá [`docs/api.md`](api.md) en el mismo PR — no después.
- Si necesitás una base de datos para probar, usá una **local**, no la de producción (ver sección 5).

## 3. Abrir el Pull Request

```bash
git push -u origin tipo/descripcion-corta
```

Desde GitHub, abrí el PR contra `main`. En la descripción, contá qué hace el cambio y cómo lo probaste. Si toca la base de datos, mencioná si hace falta correr algo en `server/database/schema.sql`.

## 4. Revisión

- **Gabriel (Líder Técnico)** revisa y aprueba antes de mergear. Si no está disponible, un revisor suplente designado puede aprobar.
- Se espera al menos una aprobación antes de mergear — no autoapruebes tu propio PR.
- Si la revisión pide cambios, actualizá la misma rama (no abras un PR nuevo).

## 5. Desarrollo local (nunca contra la base de producción)

La base de datos de producción está bloqueada por diseño: solo la VM de la aplicación puede conectarse a ella. Cada integrante corre su propia base local:

```bash
git clone https://github.com/gabo-espinoza/EnglishPanama.git
cd EnglishPanama/server
npm install
cp env.example .env        # completar con DB_HOST=127.0.0.1 y tus datos locales
mysql -u root -p < database/schema.sql
npm run dev
```

```bash
cd ../client
npm install
npm run dev                # sirve en localhost:5173, con proxy a la API en :3000
```

## 6. Qué pasa cuando el PR se mergea a `main`

Esto es automático, nadie lo dispara a mano:

1. GitHub Actions (`.github/workflows/deploy.yml`) compila el cliente (`client/dist`) y las dependencias de producción del servidor.
2. Copia ambos por `rsync` a la VM de la aplicación, **sin tocar** el `.env` que vive ahí.
3. Reinicia el proceso de la API con PM2.

Todo el proceso tarda menos de un minuto. Podés seguirlo en la pestaña **Actions** del repositorio.

## 7. Reglas que no se negocian

- **Nadie edita archivos directo en la VM.** Cualquier cambio manual ahí se pierde en el próximo despliegue (el `rsync` usa `--delete`), y genera bugs imposibles de explicar. Si hay que tocar algo de infraestructura (no de código), se coordina con Gabriel.
- **`main` siempre tiene que quedar desplegable.** Si tu PR rompe el build o el despliegue, es prioridad arreglarlo antes de seguir con otra cosa.
- **Las migraciones de base de datos son manuales, por ahora.** Si tu cambio requiere modificar `schema.sql`, avisá en el PR — alguien con acceso a la VM de la base tiene que aplicarlo a mano (esto se puede automatizar más adelante si hace falta).

## 8. Si algo se rompe en producción después de un merge

1. Revisá la pestaña **Actions** — si el despliegue falló, ahí está el log.
2. Si el despliegue fue exitoso pero la app falla, `pm2 logs api` en la VM tiene el error real (esto lo corre Gabriel, no hace falta acceso general).
3. La forma de revertir es un nuevo commit que deshaga el cambio (`git revert`), no editar la VM a mano — así queda registrado en el historial y el próximo despliegue automático aplica la corrección.
