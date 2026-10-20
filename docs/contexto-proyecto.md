# English Panamá: contexto del proyecto y de esta conversación

Documento de traspaso para retomar el trabajo en otra sesión o con otra persona. Refleja el estado al **22 de octubre de 2026**. No contiene contraseñas, llaves ni secretos.

## 1. Qué es el proyecto

- Plataforma web para reforzar el inglés de estudiantes de primaria de Panamá. Es un **proyecto académico** de un equipo de 9 personas, con entrega a **principios de diciembre de 2026**.
- Gabriel (`gabo-espinoza`) es el líder técnico. Establece las bases (base de datos, estructura, acceso); el equipo agrega funciones. El profesor pidió que el desarrollo sea **Top-Down** (pendiente de planificar).
- Alcance de niveles (decisión del equipo, según la tabla del MEDUCA): **solo 3.º, 4.º y 5.º grado = A1.1, A1.2 y A1.3**. Quedan fuera Pre-K a 2.º y A2 (se retoma solo si sobra tiempo).

## 2. Arquitectura y tecnologías

- **Cliente:** React 18 + Vite 5 + Tailwind 3 (`client/`). La paleta turquesa de marca es `brand` (100 a 600) y `blue` (redefinido como turquesa).
- **Servidor:** Node + Express 4 (`server/`), capas rutas → controladores → servicios → base de datos. MySQL 8.0, `mysql2`, JWT, `bcrypt`, `helmet`, `express-rate-limit`.
- **Autenticación:** JWT con `token_version` revalidado contra la base en cada petición. Tipos de token: sesión normal, `mfa_pending`, `mfa_enroll` y `pwd_change`. MFA (TOTP) **obligatorio para docentes y para todo el personal de gestión**; opcional para estudiantes.
- **Personal de gestión (staff):** 8 roles con JWT y clave propios (sesión de 20 minutos), y una base de **auditoría aparte, de solo anexar y encadenada con hash** (`audit_log`, `audit_writer` solo con INSERT/SELECT).
- **Nombres de la API que conviene no confundir:** `level` es el **nivel de XP** (numérico); el nivel del plan del MEDUCA es `classLevel` (`A1.x`) y el grado es `classGrade`.

## 3. Infraestructura y flujo de trabajo

- **Dos VM de Oracle** (requisito del profesor): VM-APP (Nginx, PM2 y la API, en `/var/www/englishpanama/`) y VM-BD (MySQL, solo por red privada). Los puertos 80/443 están abiertos; la API escucha en el 3000 detrás de Nginx.
- **Ramas:** las funciones salen de `develop` y los PR apuntan a `develop`. Para llevar a producción se abre un PR de **release `develop` → `main`** y se mergea con **merge commit** (no squash, por una divergencia previa). Los PR de funciones se mergean con squash.
- **Despliegue:** GitHub Actions con un `push` a `main` (ignora `docs/**` y `**.md`): compila el cliente, instala dependencias del servidor, copia con `rsync` y ejecuta `pm2 restart api`. Si el cliente no compila, el flujo falla **antes** de tocar la VM.
- **Migraciones manuales, siempre ANTES de desplegar el código** (el código nuevo falla sin la columna). Guía: `docs/migraciones-produccion.md` (respaldo, copiar el `.sql`, aplicar con `sudo mysql englishpanama < archivo`, verificar, rollback).
- Documentación clave: `docs/api.md`, `docs/security.md`, `docs/frontend.md`, `docs/backend.md`, `docs/github-workflow.md`, `BRANCHING.md`, `PLANNING.md`, y los diseños y planes en `docs/superpowers/specs` y `docs/superpowers/plans`.

## 4. Qué se construyó (cronología resumida)

1. **Hosting, base del repositorio, login con MFA, cuentas de gestión y auditoría** (septiembre y octubre). Primer release a producción con migración de la base (`prod-upgrade-all.sql`).
2. **Revisión de hallazgos y seguimiento** (límite de intentos que solo cuenta errores, errores del cliente por estado HTTP, etc.).
3. **Pieza 1: cambio obligatorio de la contraseña temporal** (PR #12): columna `must_change_password`, token `pwd_change`, `POST /api/auth/set-initial-password`, campo `code` en los errores y pantalla `/password/initial`. Migración `phase3`.
4. **Arreglo de una prueba que colgaba la suite** (PR #13, `staff-hardening`).
5. **Pieza 2: grado de la clase** (PR #15): el docente declara **una sola vez** el grado (3, 4 o 5) con un `UPDATE` atómico; el servidor filtra por nivel actividades, preguntas, intentos, reto diario y panel docente; el gestor de cuentas puede reiniciarlo con motivo auditado (5 a 40 caracteres); datos de ejemplo por nivel (`is_example`) con `seed-demo-content.js --allow-production`. Migración `phase4`.
6. **Lista de estudiantes en el panel docente** (PR #17).
7. **Rediseño de los paneles** (PR #20): se integró el diseño de Reyfernaan (rama `PaginasWebs`, que era un prototipo con datos falsos y borraba las rutas de acceso) sobre datos reales: panel docente, panel del estudiante y área de gestión `/staff` con login TOTP, sesión propia y tres páginas conectadas (identidad y accesos, auditoría, analítica).
8. **Reto diario con respuesta** (PR #22, abierto): el servidor califica la respuesta antes de dar XP (antes `POST /daily-challenge/complete` daba XP sin respuesta).
9. **Herramientas de la demostración** (PR #23, abierto): página local de códigos TOTP, script `demo-accounts.js` (crea y retira cuentas de demo) y guía.

## 5. Estado actual

**PR abiertos:**

| PR | Qué es | Destino |
|---|---|---|
| #21 | Release del rediseño de paneles | `main` |
| #22 | Reto diario con respuesta | `develop` |
| #23 | Códigos TOTP en pantalla y cuentas de demo | `develop` |

Si el #22 y el #23 se mergean en `develop` antes del #21, el release los incluye. Ninguno requiere migración de base de datos.

**Producción hoy:** código del release de lista de estudiantes (el rediseño espera el #21). Migraciones `prod-upgrade-all`, `phase3` y `phase4` aplicadas. Ejemplos cargados (12 actividades). La API está sana (PM2 en línea, uptime estable).

**Cuentas de prueba existentes en producción:** gestión `gabriel.accesos` (gestor de accesos) y `ep26.auditor` (auditor); docentes `docente.prueba` y `usuario.docente` (con grado 3 declarado); estudiantes `alumno.prueba` y `prueba.lista`. Hay que decidir si se conservan o se borran.

## 6. Decisiones de diseño vigentes

- **El grado se declara una vez y queda bloqueado** todo el periodo escolar. El docente nunca puede cambiarlo; si se equivocó, el gestor de cuentas lo reinicia. El aviso exacto: "Este nivel no se puede cambiar durante todo el periodo escolar. Si te equivocas, deberás pedir ayuda al gestor de cuentas."
- **El servidor es la autoridad del filtro por nivel**: una actividad de otro nivel, o una clase sin grado, responde 404 (lista vacía en el listado); no se revela que el id existe.
- **Sin datos falsos en lo que se entrega**: sin `USE_MOCK`, sin éxitos simulados. Lo que no tiene backend se omite. Por eso **no entraron 5 páginas del prototipo** (contenido, revisión de contenido, juego, moderación y soporte); su diseño sigue en la rama `PaginasWebs`.
- **Reto diario:** respuesta incorrecta devuelve `{correct:false}` sin escribir nada ni revelar la correcta; ya completado devuelve 409 antes de calificar; dos envíos simultáneos cobran XP una sola vez.
- **Demostración con MFA activo:** no se debilitó la autenticación. Los códigos se ven en pantalla con una página local.
- **Pieza 3 (pendiente):** el docente desbloquea módulos de uno en uno (por ejemplo, uno por trimestre); el estudiante no ve los cerrados ni los que aún no se abrieron.
- **Pieza 4 (pendiente):** cierre del año en dos etapas (el docente bloquea los módulos y califica, luego cierra la clase); el cierre **archiva** a los estudiantes (no borra datos de menores) y el código de clase deja de servir.

## 7. Reglas de trabajo acordadas

- **Idioma:** con Gabriel se puede hablar en español rioplatense; **todo lo que forma parte del proyecto** (interfaz, documentos, comentarios, mensajes de error, commits) va en **español latinoamericano neutro con "tú"**, sin voseo. El público es panameño. En el servidor los mensajes y el SQL van sin tildes; en el cliente y los documentos, con tildes.
- **Commits:** formato convencional, **sin** líneas `Co-Authored-By` ni atribución de IA.
- **No compilar** después de los cambios. Excepción autorizada: comprobar la sintaxis del cliente con esbuild **en una carpeta temporal fuera del repositorio**, en memoria.
- **Producción:** nunca se usa para pruebas de desarrollo. Las pruebas con base de datos corren en un contenedor Docker. **Crear cuentas y fijar credenciales en producción lo hace Gabriel**, no un agente.
- **Secretos:** nunca se imprimen ni se confirman en el repositorio.
- **Flujo con agentes:** un implementador por tarea y una revisión independiente después de cada una; modelos baratos (haiku) para lo básico y sonnet para lo difícil. Cada hallazgo importante se corrige antes de seguir.
- **La llave SSH temporal** de las VM se borra cuando se llegue al tramo final del proyecto.

## 8. Cómo probar

- **Base de pruebas:** contenedor Docker `ep-test-mysql` (MySQL 8.0.46) en `127.0.0.1:3306`, con las bases `englishpanama` y `englishpanama_audit`. Si Docker Desktop está apagado, se abre desde `AppData\Local\Programs\DockerDesktop`; el contenedor se arranca con `docker start ep-test-mysql`.
- **Variables:** `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `AUDIT_DB_*`, `JWT_SECRET`, `STAFF_JWT_SECRET`, `STAFF_MFA_KEY` y `NODE_ENV=test`. Las contraseñas del contenedor están en la carpeta temporal de la sesión, no en el repositorio.
- **Suite:** `cd server && timeout 300 node --test` (unos 20 segundos, **173 pruebas: 171 pasan, 0 fallan, 2 se omiten** por una sonda de `api.test.js`, que ya existía).
- **Cliente:** no tiene pruebas automáticas ni `node_modules`. La sintaxis se comprueba con la herramienta temporal (`check.cjs` e `imports.cjs`) que está en la carpeta temporal de la sesión.

## 9. Pendientes

1. Mergear el **#22** y el **#23** en `develop`, y el release **#21** a `main` (merge commit); después, el punto de control del despliegue.
2. **Demostración:** crear las cuentas con `node scripts/demo-accounts.js create --allow-production` en la VM (lo hace Gabriel), pegar el bloque en la página de códigos, y **retirarlas el mismo día** con `remove` (primero `--dry-run`). Abrir la página en Chrome antes de la demo (nunca se probó en un navegador).
3. **Pieza 3** (módulos que desbloquea el docente) y **pieza 4** (cierre del año con archivado): requieren su propio diseño.
4. **Límite de intentos fallidos del reto diario** (hoy se puede probar opciones hasta acertar; máximo +10 XP por día por estudiante).
5. **Hallazgo 5 de la revisión:** tipografías autoalojadas en lugar de Google Fonts (`client/index.html`).
6. **Contenido por nivel (A1.1, A1.2, A1.3)** a cargo del equipo, y la **planificación Top-Down** que pidió el profesor.
7. **Orden y limpieza:** decidir qué cuentas de prueba se conservan, borrar respaldos y archivos de migración sueltos en las VM, evaluar la protección de ramas en `main` y `develop`, retirar los worktrees locales y el contenedor de pruebas cuando ya no hagan falta.
8. **Que Reyfernaan revise el #21:** el rediseño es su diseño y se integró sin su revisión.

## 10. Verificaciones que no se pudieron hacer

- El cliente **nunca se compiló con Vite ni se vio en un navegador**. Cada pieza se revisó leyendo el código contra el servidor real, y la sintaxis y los imports se comprobaron con esbuild, pero falta mirar las pantallas a 375 px y en escritorio.
- El ingreso de contraseña sin eco del script de demo no tiene prueba automática.
- Tailwind (valores arbitrarios, `peer-checked`) no se validó con una compilación real.

## 11. Cosas que conviene recordar

- Las herramientas de esta sesión pueden **convertir el texto ` ` de un comando en el carácter real**. Eso fue lo que dejó caracteres U+2028 escritos tal cual dentro de una expresión regular en una página, y habría roto la sintaxis de todo el cliente. Se revisa con `LC_ALL=C grep -rnP '\xe2\x80[\xa8\xa9]' client/src server/src` (debe salir vacío).
- `github.com` por HTTPS a veces no responde desde la máquina de desarrollo, aunque `api.github.com` sí. `git fetch` puede fallar y reintentarse; `gh` suele funcionar.
- El acceso SSH a las VM funciona con una llave temporal, y puede cortarse si cambia la red de origen.
- Hay varios **worktrees locales** de ramas de trabajo (`EnglishPanama-*`); el checkout principal está en la rama `docs/prod-migrations`, que está desactualizada respecto de `develop`.
