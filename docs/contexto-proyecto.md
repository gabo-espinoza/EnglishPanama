# English Panamá: contexto del proyecto y de esta conversación

Documento de traspaso para retomar el trabajo en otra sesión o con otra persona. Refleja el estado al **6 de noviembre de 2026**. No contiene contraseñas, llaves ni secretos.

## 1. Qué es el proyecto

- Plataforma web para reforzar el inglés de estudiantes de primaria de Panamá. Es un **proyecto académico** de un equipo de 9 personas, con entrega a **principios de diciembre de 2026**.
- Gabriel (`gabo-espinoza`) es el líder técnico. Establece las bases (base de datos, estructura, acceso); el equipo agrega funciones. El profesor pidió que el desarrollo sea **Top-Down** (pendiente de planificar).
- Alcance de niveles (decisión del equipo, según la tabla del MEDUCA): **solo 3.º, 4.º y 5.º grado = A1.1, A1.2 y A1.3**. Quedan fuera Pre-K a 2.º y A2 (se retoma solo si sobra tiempo).

## 2. Arquitectura y tecnologías

- **Cliente:** React 18 + Vite 5 + Tailwind 3 (`client/`). La paleta turquesa de marca es `brand` (100 a 600) y `blue` (redefinido como turquesa).
- **Servidor:** Node + Express 4 (`server/`), capas rutas → controladores → servicios → base de datos. MySQL 8.0, `mysql2`, JWT, `bcrypt`, `helmet`, `express-rate-limit`.
- **Autenticación:** JWT con `token_version` revalidado contra la base en cada petición. Tipos de token: sesión normal, `mfa_pending`, `mfa_enroll` y `pwd_change`. MFA (TOTP) **obligatorio para docentes y para todo el personal de gestión**; opcional para estudiantes. El código TOTP vale **una sola vez por cuenta** (anti-replay).
- **Personal de gestión (staff):** 8 roles con JWT y clave propios (sesión de 20 minutos), y una base de **auditoría aparte, de solo anexar y encadenada con hash** (`audit_log`, `audit_writer` solo con INSERT/SELECT).
- **Nombres de la API que conviene no confundir:** `level` es el **nivel de XP** (numérico); el nivel del plan del MEDUCA es `classLevel` (`A1.x`) y el grado es `classGrade`.
- **Día del reto diario:** es el de **Panamá (UTC−5, sin horario de verano)**, calculado en Node y pasado a MySQL como parámetro (`server/src/utils/day.js`). No depende de la zona horaria de las VM.
- **Contenido (fase B):** las actividades tienen ciclo de vida `draft → in_review → published → archived` (columna `activities.status`), con autor, revisor y nota de rechazo; los reportes de contenido (`content_reports`) los atienden soporte, moderación y el gestor de contenido según su bandeja.

## 3. Infraestructura y flujo de trabajo

- **Dos VM de Oracle** (requisito del profesor): VM-APP (Nginx, PM2 y la API, en `/var/www/englishpanama/`) y VM-BD (MySQL, solo por red privada). Los puertos 80/443 están abiertos; la API escucha en el 3000 detrás de Nginx.
- **Ramas:** las funciones salen de `develop` y los PR apuntan a `develop`. Para llevar a producción se abre un PR de **release `develop` → `main`** y se mergea con **merge commit** (no squash, por una divergencia previa). Los PR de funciones se mergean con squash.
- **Despliegue:** GitHub Actions con un `push` a `main` (ignora `docs/**` y `**.md`): compila el cliente, instala dependencias del servidor, copia con `rsync` y ejecuta `pm2 restart api`. Si el cliente no compila, el flujo falla **antes** de tocar la VM.
- **Migraciones manuales, siempre ANTES de desplegar el código** (el código nuevo falla sin la columna). Guía: `docs/migraciones-produccion.md` (respaldo, copiar el `.sql`, aplicar con `sudo mysql englishpanama < archivo`, verificar, rollback).
- **Instalación nueva:** `schema.sql` + `staff.sql` + `audit.sql` (desde el PR de B1 ya traen la estructura final); las migraciones son solo para **actualizar** una base existente.
- Documentación clave: `docs/api.md`, `docs/security.md`, `docs/frontend.md`, `docs/backend.md`, `docs/github-workflow.md`, `docs/revision-pr26.md`, `docs/guia-pruebas-con-docker.pdf`, `BRANCHING.md`, `PLANNING.md`, y los diseños y planes en `docs/superpowers/specs` y `docs/superpowers/plans` (incluido `2026-11-05-pantallas-gestion.md`, el contrato de las pantallas de gestión).

## 4. Qué se construyó (cronología resumida)

1. **Hosting, base del repositorio, login con MFA, cuentas de gestión y auditoría** (septiembre y octubre). Primer release a producción con migración de la base (`prod-upgrade-all.sql`).
2. **Revisión de hallazgos y seguimiento** (límite de intentos que solo cuenta errores, errores del cliente por estado HTTP, etc.).
3. **Pieza 1: cambio obligatorio de la contraseña temporal** (PR #12). Migración `phase3`.
4. **Arreglo de una prueba que colgaba la suite** (PR #13).
5. **Pieza 2: grado de la clase** (PR #15): el docente declara una sola vez el grado (3, 4 o 5); el servidor filtra por nivel; el gestor de cuentas puede reiniciarlo con motivo auditado; datos de ejemplo por nivel. Migración `phase4`.
6. **Lista de estudiantes en el panel docente** (PR #17).
7. **Rediseño de los paneles** (PR #20, release #21): diseño de Reyfernaan sobre datos reales: panel docente, panel del estudiante y área de gestión `/staff` con login TOTP y tres páginas (identidad y accesos, auditoría, analítica).
8. **Reto diario con respuesta** (PR #22) y **herramientas de la demostración** (PR #23: página local de códigos TOTP, `demo-accounts.js`, guía), más cierre de sesión por recarga e inactividad (#24 y #25). Todo desplegado: producción corre `main` en `c4eca4a`.
9. **Entrega del backend de Daniel, fases 1, 2, B y C** (PR #26, ya en `develop`): ciclo de vida del contenido, revisión, reportes, reglas del juego, alias ocultos, logout, anti-replay del TOTP, auditoría de logins fallidos. Migraciones `phase5-content-review.sql` y `phase6-totp-replay.sql`.
10. **Revisión del #26** (5 de noviembre, `docs/revision-pr26.md`): tres revisiones independientes por lectura, más la suite completa y la prueba de las migraciones sobre MySQL 8.0.46. Sin hallazgos críticos; 8 bloqueantes y varios importantes, que se corrigen en los PR de abajo.
11. **Guía en PDF y script para probar con una base propia en Docker** (para todo el equipo; Daniel no tiene acceso a la base final).

## 5. Estado actual

**Producción hoy:** `main` en `c4eca4a` (despliegue del 22 de octubre). Migraciones `prod-upgrade-all`, `phase3` y `phase4` aplicadas; 12 actividades de ejemplo. **`phase5-content-review.sql` y `phase6-totp-replay.sql` se aplicaron el 6 de noviembre de 2026** (con respaldo previo `~/backup-pre-phase5-20261106-1352.sql` en la VM-BD): las 12 actividades de ejemplo quedaron `published` y el código desplegado hoy sigue funcionando (API en línea). Siguen siendo obligatorias antes del release, y ya están hechas.

**PR abiertos (todos hacia `develop`, pendientes de mergear):**

| PR | Qué es | Base |
|---|---|---|
| #28 | Hallazgos bloqueantes del #26: alcance de los reportes por rol, límite por cuenta, reglas de juego parciales y atómicas, anti-replay que falla cerrado, bloqueo y anti-replay en `mfa/setup` y `mfa/confirm`, auditoría de login fallido sin diferencia de tiempos, `isMe` en el ranking, ids estrictos | `develop` |
| #29 | Guía en PDF y scripts `setup-test-db.sh` y `.ps1` | `develop` |
| #30 | `schema.sql` y `staff.sql` con la estructura final (hallazgo B1) | `develop` |
| #31 | Las cinco pantallas de gestión (`/staff/content`, `/staff/review`, `/staff/game`, `/staff/moderation`, `/staff/support`) y `GET /staff/game/questions` | #28 |
| #32 | El día del reto diario pasa a hora de Panamá (UTC−5) | #28 |
| #33 | La regla `xpPerLevel` se usa también en ranking, perfil y lista del docente | #28 |

Orden sugerido: #28 primero (los demás se retargan solos a `develop`); #29 y #30 son independientes. Los PR sobre la base #28 tocan algunos archivos en común (`game.service.js`, `docs/api.md`) y pueden pedir resolver conflictos menores.

**Cuentas de prueba existentes en producción:** gestión `gabriel.accesos` (gestor de accesos) y `ep26.auditor` (auditor); docentes `docente.prueba` y `usuario.docente` (con grado 3 declarado); estudiantes `alumno.prueba` y `prueba.lista`. Hay que decidir si se conservan o se borran.

## 6. Decisiones de diseño vigentes

- **El grado se declara una vez y queda bloqueado** todo el periodo escolar. El docente nunca puede cambiarlo; si se equivocó, el gestor de cuentas lo reinicia. El aviso exacto: "Este nivel no se puede cambiar durante todo el periodo escolar. Si te equivocas, deberás pedir ayuda al gestor de cuentas."
- **El servidor es la autoridad del filtro por nivel**: una actividad de otro nivel, o una clase sin grado, responde 404 (lista vacía en el listado); no se revela que el id existe.
- **Sin datos falsos en lo que se entrega**: sin `USE_MOCK`, sin éxitos simulados. Lo que no tiene backend se omite. Las cinco pantallas de gestión se construyeron sobre los endpoints reales (no se reutilizó el prototipo `PaginasWebs`).
- **Reto diario:** respuesta incorrecta devuelve `{correct:false}` sin escribir nada ni revelar la correcta; ya completado devuelve 409 antes de calificar; dos envíos simultáneos cobran XP una sola vez. **El día es el de Panamá (UTC−5).** Solo se admiten preguntas de actividades publicadas y que no sean de ordenar oraciones (se responden con un solo texto).
- **Separación de funciones en contenido:** el gestor de contenido crea y edita; el revisor aprueba o rechaza (con nota de 1 a 500); nadie aprueba su propio contenido. Aprobar una revisión archiva la original.
- **Reportes:** cada rol decide solo su bandeja (soporte: errores abiertos; moderador: contenido inadecuado abierto; gestor de contenido: lo escalado). **El alias del menor no se muestra en ninguna pantalla** aunque el servidor lo devuelva.
- **Demostración con MFA activo:** no se debilitó la autenticación. Los códigos se ven en pantalla con una página local.
- **Pieza 3 (pendiente):** el docente desbloquea módulos de uno en uno (por ejemplo, uno por trimestre); el estudiante no ve los cerrados ni los que aún no se abrieron.
- **Pieza 4 (pendiente):** cierre del año en dos etapas (el docente bloquea los módulos y califica, luego cierra la clase); el cierre **archiva** a los estudiantes (no borra datos de menores) y el código de clase deja de servir.

## 7. Reglas de trabajo acordadas

- **Idioma:** con Gabriel se puede hablar en español rioplatense; **todo lo que forma parte del proyecto** (interfaz, documentos, comentarios, mensajes de error, commits) va en **español latinoamericano neutro con "tú"**, sin voseo. El público es panameño. En el servidor los mensajes y el SQL van sin tildes; en el cliente y los documentos, con tildes.
- **Commits:** formato convencional, **sin** líneas `Co-Authored-By` ni atribución de IA.
- **No compilar** después de los cambios. Excepciones autorizadas: comprobar sintaxis e imports del cliente con esbuild **en una carpeta temporal fuera del repositorio**, y el 5 de noviembre, una **prueba de humo** con el servidor de desarrollo de Vite y la API locales, contra la base de pruebas.
- **Producción:** nunca se usa para pruebas de desarrollo. Las pruebas con base de datos corren en un contenedor Docker propio. **Crear cuentas y fijar credenciales en producción lo hace Gabriel**, no un agente.
- **Secretos:** nunca se imprimen ni se confirman en el repositorio.
- **Flujo con agentes:** un implementador por tarea y una revisión independiente después de cada una; modelos baratos (haiku) para lo básico y sonnet para lo difícil. Cada hallazgo importante se corrige antes de seguir. Las pruebas nuevas deben hablar con la base de datos y **fallar con el código anterior** (se comprueba revirtiendo solo el archivo corregido).
- **La llave SSH temporal** de las VM se borra cuando se llegue al tramo final del proyecto. **La clave anterior se perdió** (vivía en la carpeta temporal de una sesión, que se limpió). El 6 de noviembre se creó una nueva en `Escritorio\Claude SSH` (con un `LEEME.txt`), autorizada en ambas VM: se retira borrando de `~/.ssh/authorized_keys` la línea que termina en `claude-englishpanama-2026-11-06` y borrando esa carpeta.

## 8. Cómo probar

- **Cada persona del equipo monta su propia base** siguiendo `docs/guia-pruebas-con-docker.pdf`, o con un comando: `bash server/scripts/setup-test-db.sh` (Git Bash, macOS, Linux; `--reset` la recrea limpia; `eval "$(bash server/scripts/setup-test-db.sh --env)"` define las variables) o `server/scripts/setup-test-db.ps1` (PowerShell; **no se ejecutó nunca**, conviene probarlo en Windows).
- **Puerto 3306 obligatorio:** el servidor no admite otro puerto para la base de auditoría, y el test de `demo-accounts` no reenvía `DB_PORT`.
- **Suite:** `cd server && node --test` (cerca de un minuto). Con el contenido de los PR abiertos: entre **265 y 273 pruebas, 0 fallan, 0 a 2 omitidas** según la rama (en `develop` actual, 238 con 2 omitidas). Si salen decenas de pruebas "omitidas" o fallan los scripts, revisa que `node_modules` exista en `server/` del worktree y que las variables estén definidas.
- **Cliente:** `npm ci` en `client/` y `npx vite` para el servidor de desarrollo (proxy a `localhost:3000`). Comprobación sin compilar: la herramienta temporal de esbuild (`check.mjs`) en la carpeta temporal de la sesión.
- **Cuentas de gestión de demostración locales:** `node scripts/seed-demo-staff.js` (24 cuentas, `DEMO_STAFF_PASSWORD` de 12 caracteres o más, se niega con `NODE_ENV=production`). El secreto TOTP nunca se imprime: para probar localmente se genera el código leyendo el secreto cifrado de la base de pruebas.

## 9. Pendientes

1. **Revisar y mergear** #28, #29, #30, #32, #33 y #31 (orden de la sección 5).
2. ~~Aplicar `phase5` y `phase6-totp-replay`~~ **Hecho el 6 de noviembre.** Queda revisar `phase6-hardening.sql` (solo su índice simple; **no** habilitar `uq_activity`) y, cuando ya no haga falta, borrar el respaldo `backup-pre-phase5-*.sql` de la VM-BD.
3. **Verificar la `.env` de la VM-APP** (`NODE_ENV`, `JWT_SECRET`, `STAFF_JWT_SECRET`, `STAFF_MFA_KEY` de 32 bytes en base64, `AUDIT_DB_*`, `DEMO_MODE=false`) y decidir las **3 decisiones abiertas de `docs/specs/staff-fase-b.md`** (el archivo está en la rama `docs/spec-fase-b`, sin PR).
4. **Release `develop` → `main`** (merge commit). **Desplegar entre las 00:00 y las 19:00 hora de Panamá**: quien completó el reto entre las 19:00 y la medianoche ese día podrá completarlo una vez más (detalle en `docs/migraciones-produccion.md` §16).
5. **Cierre de privacidad (backend):** un revisor puede leer cualquier actividad por id (con la respuesta correcta); `GET /staff/reports` devuelve el alias del menor; las notas de los reportes no tienen retención ni borrado; índice único `daily_challenges(question_id)` (requiere migración).
6. **Otros hallazgos del #26 abiertos:** ciclo de vida del contenido (`archived` terminal, varias revisiones abiertas de la misma actividad), límite de intentos del reto diario (en memoria, cuenta todo tipo de petición), login de una cuenta bloqueada distinguible por tiempo, `activity.controller.js` y `staffAccounts.controller.js` con ids sin validar.
7. **QA:** checklist de 29 ítems de `docs/security.md` §5, `npm audit`, y pruebas con cada rol en el navegador (la prueba de humo del 5 de noviembre cubrió las cinco pantallas nuevas a 375 px, pero no un escritorio ancho, el cierre de sesión a los 20 minutos ni el bloqueo por tres intentos de TOTP).
8. **Demostración:** crear las cuentas con `node scripts/demo-accounts.js create --allow-production` en la VM (lo hace Gabriel), pegar el bloque en la página de códigos, y **retirarlas el mismo día** con `remove` (primero `--dry-run`). Abrir la página de códigos en Chrome antes. Nota: `POST /auth/logout` revoca todas las sesiones de la cuenta, lo que afecta a cuentas `demo.*` compartidas.
9. **Pieza 3** (módulos que desbloquea el docente) y **pieza 4** (cierre del año con archivado): requieren su propio diseño.
10. **Hallazgo 5 de la revisión:** tipografías autoalojadas en lugar de Google Fonts (`client/index.html`). **Contenido por nivel (A1.1, A1.2, A1.3)** a cargo del equipo y la **planificación Top-Down** que pidió el profesor.
11. **Orden y limpieza:** decidir qué cuentas de prueba de producción se conservan, borrar respaldos y archivos de migración sueltos en las VM, **retirar la llave SSH temporal de ambas VM al final**, evaluar la protección de ramas en `main` y `develop`, retirar los worktrees locales (`EnglishPanama-*`) y el contenedor de pruebas.
12. **Que Reyfernaan revise el rediseño** (#21), que se integró sin su revisión.

## 10. Verificaciones que no se pudieron hacer

- El cliente **nunca se compiló con Vite en modo producción**; se usó esbuild para sintaxis e imports y, el 5 de noviembre, el servidor de desarrollo en un navegador (a 375 px y a unos 800 px de ancho). Falta un escritorio ancho y la compilación real de Tailwind (valores arbitrarios, `peer-checked`).
- `setup-test-db.ps1` (PowerShell) no se ejecutó.
- El anti-replay y los bloqueos se probaron contra MySQL local, pero no el comportamiento con **varios procesos de Node** (el limitador de intentos del reto diario vive en memoria) ni con la zona horaria real de las VM.
- La protección contra aprobar el contenido propio se verificó en el servidor, pero no en el navegador (los roles de contenido y de revisión son disjuntos y no se pueden mezclar en una cuenta).

## 11. Cosas que conviene recordar

- Las herramientas de esta sesión pueden **convertir el texto de un escape unicode de un comando en el carácter real**. Eso dejó caracteres U+2028 escritos tal cual dentro de una expresión regular y habría roto la sintaxis de todo el cliente. Se revisa con `LC_ALL=C grep -rnP '\xe2\x80[\xa8\xa9]' client/src server/src` (debe salir vacío).
- `github.com` por HTTPS a veces rechaza un `git push` con "remote rejected" sin motivo, aunque `api.github.com` y `gh` respondan; basta reintentar.
- Al reiniciar la máquina, Docker Desktop puede no levantar el motor; se abre desde `AppData\Local\Programs\DockerDesktop` y luego `docker start ep-test-mysql`. Arrancan solos contenedores de otro proyecto (Greenbone): no son de English Panamá.
- Las pruebas que cambian el estado global (reglas de XP, módulos, actividades publicadas) rompen a las demás porque `node --test` corre los archivos en paralelo contra la misma base: las pruebas nuevas usan los fixtures de `server/tests/helpers/fixtures.js` (actividades en borrador) y funciones puras para lo que toca reglas globales.
- Hay varios **worktrees locales** de ramas de trabajo (`EnglishPanama-*`); el checkout principal está en la rama `docs/prod-migrations`, que está desactualizada respecto de `develop`.
