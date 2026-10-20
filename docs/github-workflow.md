# Flujo de trabajo en GitHub

Este documento explica como se mueve el codigo desde que alguien empieza una tarea hasta que queda en produccion. Leelo antes de tu primer PR.

## Ramas principales

- **`main`**: codigo en produccion. Cada push aqui dispara el despliegue automatico.
- **`develop`**: rama de integracion. Todos los PR apuntan aqui, no a `main`. Es la rama por defecto del repositorio.

Gabriel consolida `develop` en `main` una vez que verifica la integridad de los cambios acumulados. Ese merge a `main` es lo unico que dispara el despliegue a produccion - mergear a `develop` no despliega nada.

## 1. Antes de empezar una tarea

```bash
git checkout develop
git pull origin develop
git checkout -b tipo/descripcion-corta
```

El nombre de la rama sigue el formato de [`BRANCHING.md`](../BRANCHING.md) (por ejemplo `feat/vocabulary-memory-game`). Nunca se trabaja directo sobre `develop` ni sobre `main`.

## 2. Mientras se trabaja

- Commits en formato [Conventional Commits](https://www.conventionalcommits.org/), en minusculas: `feat: add xp service`, `fix: prevent duplicate daily completion`.
- Si la tarea agrega o cambia un endpoint, hay que actualizar [`docs/api.md`](api.md) en el mismo PR, no despues.
- Para probar localmente, se usa una base de datos **local**, nunca la de produccion (ver seccion 5).

## 3. Abrir el Pull Request

```bash
git push -u origin tipo/descripcion-corta
```

Desde GitHub, se abre el PR contra `develop` (es la rama que aparece por defecto al crear el PR). En la descripcion, hay que explicar que hace el cambio y como se probo. Si el cambio toca la base de datos, hay que indicar si hace falta correr algo en `server/database/schema.sql`.

## 4. Revision

- **Gabriel (Lider Tecnico)** revisa y aprueba antes de mergear a `develop`. Si no esta disponible, un revisor suplente designado puede aprobar.
- Se espera al menos una aprobacion antes de mergear - nadie aprueba su propio PR.
- Si la revision pide cambios, se actualiza la misma rama (no se abre un PR nuevo).

## 5. Desarrollo local (nunca contra la base de produccion)

La base de datos de produccion esta bloqueada por diseno: solo la VM de la aplicacion puede conectarse a ella. Cada integrante corre su propia base local:

```bash
git clone https://github.com/gabo-espinoza/EnglishPanama.git
cd EnglishPanama/server
npm install
cp env.example .env        # completar con DB_HOST=127.0.0.1 y datos locales
mysql -u root -p < database/schema.sql
npm run dev
```

```bash
cd ../client
npm install
npm run dev                # sirve en localhost:5173, con proxy a la API en :3000
```

## 6. Que pasa cuando Gabriel consolida `develop` en `main`

Esto es automatico, nadie lo dispara a mano:

1. GitHub Actions (`.github/workflows/deploy.yml`) compila el cliente (`client/dist`) y las dependencias de produccion del servidor.
2. Copia ambos por `rsync` a la VM de la aplicacion, **sin tocar** el `.env` que vive ahi.
3. Reinicia el proceso de la API con PM2.

Un push a `main` que solo modifique archivos de documentacion (`docs/**` o `*.md`) no dispara el despliegue - no tiene sentido reiniciar el servidor por un cambio de texto. Todo el proceso de despliegue real tarda menos de un minuto y se puede seguir en la pestana **Actions** del repositorio.

## 7. Reglas que no se negocian

- **Nadie edita archivos directo en la VM.** Cualquier cambio manual ahi se pierde en el proximo despliegue (el `rsync` usa `--delete`), y genera errores imposibles de explicar. Si hay que tocar algo de infraestructura (no de codigo), se coordina con Gabriel.
- **`develop` siempre tiene que quedar en un estado que se pueda consolidar a `main`.** Un PR que rompe el build es prioridad arreglarlo antes de seguir con otra cosa.
- **Las migraciones de base de datos son manuales, por ahora.** Si un cambio requiere modificar `schema.sql`, hay que avisarlo en el PR - alguien con acceso a la VM de la base lo aplica a mano (esto se puede automatizar mas adelante si hace falta). La guia paso a paso, con los comandos de cada VM, esta en [docs/migraciones-produccion.md](migraciones-produccion.md).

## 8. Si algo se rompe en produccion despues de un merge a `main`

1. Revisar la pestana **Actions** - si el despliegue fallo, ahi esta el registro.
2. Si el despliegue fue exitoso pero la aplicacion falla, `pm2 logs api` en la VM tiene el error real (esto lo revisa Gabriel, no hace falta acceso general).
3. La forma de revertir es un nuevo commit que deshaga el cambio (`git revert`), no editar la VM a mano - asi queda registrado en el historial y el siguiente despliegue automatico aplica la correccion.
