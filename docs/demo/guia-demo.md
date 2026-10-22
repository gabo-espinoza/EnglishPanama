# Guía de la demostración: códigos MFA en pantalla

Esta guía explica cómo mostrar los códigos MFA (TOTP) en la pantalla de una laptop durante la demostración, sin pasar el celular de mano en mano. Archivo de apoyo: `docs/demo/codigos-totp.html`.

## Crear todas las cuentas con un comando

El responsable técnico puede crear (y después retirar) todo el juego de cuentas de demostración con **un solo comando**: `server/scripts/demo-accounts.js`. El MFA sigue **activo** en todas las cuentas que lo exigen (docente y los 8 roles de gestión): el script no debilita ni omite nada de la autenticación. Los códigos se muestran en la página `codigos-totp.html`, alimentada con los secretos que el script imprime una sola vez.

> **Decisión del responsable del proyecto:** todas las cuentas de demostración comparten **una misma contraseña**, y por eso es más débil que una contraseña por cuenta. Se acepta solo porque las cuentas viven unas horas. **Las cuentas deben retirarse el mismo día** con `remove` (ver abajo). No uses esa contraseña en ningún otro sitio ni la guardes en el repositorio.

### Dónde se ejecuta

El responsable técnico lo ejecuta en la **VM de la aplicación**, dentro de `/var/www/englishpanama/api` (el despliegue copia ahí la carpeta `server/`). El script estará disponible **después del próximo despliegue** de esta rama.

```bash
cd /var/www/englishpanama/api
```

### Crear las cuentas

```bash
# Contraseña por variable de entorno (queda en el historial del shell: bórralo después)...
DEMO_ACCOUNTS_PASSWORD='<contraseña compartida>' node scripts/demo-accounts.js create --allow-production

# ...o sin variable: el script la pide por entrada estándar.
node scripts/demo-accounts.js create --allow-production
```

- **Contraseña**: de 12 a 72 caracteres. Sale de la variable `DEMO_ACCOUNTS_PASSWORD` o, si no existe, se pide por entrada estándar. Nunca se imprime ni se registra.
- **Protección de producción**: con `NODE_ENV=production` (el caso de la VM) tanto `create` como `remove` **solo corren si el comando incluye `--allow-production`**. Una variable de entorno nunca lo habilita. Fuera de producción no hace falta el indicador. El error de la protección sale antes de conectar con la base.
- **Cuentas** (lista fija, todas empiezan con `demo.`):

| Cuenta | Rol | MFA |
|---|---|---|
| `demo.accesos` | access_manager | Sí |
| `demo.auditor` | auditor | Sí |
| `demo.analista` | analyst | Sí |
| `demo.contenido` | content_manager | Sí |
| `demo.revision` | content_reviewer | Sí |
| `demo.juego` | game_manager | Sí |
| `demo.moderacion` | moderator | Sí |
| `demo.soporte` | support | Sí |
| `demo.docente` | teacher («Docente de demostración») | Sí, activo desde el inicio |
| `demo.estudiante1`, `demo.estudiante2` | student, enlazados al docente demo | No (es opcional) |

- **Docente**: queda con el MFA activo, **sin** cambio obligatorio de contraseña, con un código de clase generado y con el **grado sin declarar** para que la demostración lo declare. El resumen imprime el código de clase.
- **Idempotente**: si una cuenta ya existe, se omite con una línea clara. Nunca se cambia la contraseña de una cuenta existente ni se vuelve a mostrar su secreto. Si un nombre `demo.*` de la lista existe con un rol distinto al esperado, el script se detiene con un error y no cambia nada.

### El bloque de secretos y dónde pegarlo

Al final, `create` imprime un bloque delimitado, con una línea por cada cuenta con MFA (las 8 de gestión y el docente), en el formato que acepta la página:

```text
# ---- INICIO del bloque para docs/demo/codigos-totp.html (se muestra UNA sola vez) ----
demo.accesos: <SECRETO_EN_BASE32>
demo.auditor: <SECRETO_EN_BASE32>
...
demo.docente: <SECRETO_EN_BASE32>
# ---- FIN del bloque ----
```

1. Copia el bloque (la página ignora las líneas que empiezan con `#`) y pégalo en el cuadro de `codigos-totp.html` (sección 2). Los códigos aparecen solos.
2. Los secretos se muestran **una sola vez** y no se pueden consultar después. Cuando los hayas pegado, **limpia la terminal y el historial** (`clear`, `history -c`).
3. Si pierdes un secreto, usa `--reissue` (siguiente apartado).

### Reemitir los secretos MFA (`--reissue`)

```bash
node scripts/demo-accounts.js create --reissue --allow-production
```

Para las cuentas demo que **ya existen**, genera un secreto MFA nuevo y lo imprime una sola vez (mismo bloque), sube `token_version` y, por tanto, revoca las sesiones abiertas de esas cuentas. El secreto anterior deja de servir. **No cambia contraseñas** y no crea las cuentas que falten (para eso, `create` sin la opción).

### Retirar las cuentas (`remove`)

```bash
# 1) Simulacro: muestra qué se borraría y no cambia nada
node scripts/demo-accounts.js remove --dry-run --allow-production

# 2) Borrado real
node scripts/demo-accounts.js remove --allow-production
```

- Borra **exactamente** la lista fija de 11 cuentas; nunca usa patrones como `LIKE 'demo.%'`.
- **Seguridad de la cascada**: las tablas `users`, `teachers` y `students` se enlazan con `ON DELETE CASCADE`, así que borrar al docente demo borraría **a cualquier estudiante registrado con su código de clase**. Antes de borrar, el script cuenta los estudiantes enlazados al docente que **no** son de la lista (con sus intentos y XP). Si hay alguno, **aborta sin borrar nada** y muestra quiénes y qué se perdería. Solo si de verdad quieres borrarlos, repite con `--include-linked-students`:

  ```bash
  node scripts/demo-accounts.js remove --include-linked-students --allow-production
  ```

- Las solicitudes de `staff_change_requests` que involucran a las cuentas de gestión demo (como objetivo, solicitante o quien decide) se borran **primero**, dentro de la misma transacción, y se informa cuántas fueron (y cuántas involucraban también a cuentas que no son de la demostración).
- Al final imprime un resumen con las filas borradas por tabla. Las filas de `audit_log` **no se borran**: la auditoría es de solo añadir por diseño. Cada `create`, `--reissue` y `remove` que cambia algo deja una entrada de auditoría (`demo.accounts.create`, `demo.accounts.reissue`, `demo.accounts.remove`).
- **Retira las cuentas el mismo día de la demostración.**

### Alternativa manual

Las secciones 3, 4 y 6 describen cómo crear y retirar las cuentas **una por una** (con `create-staff.js`, el alta de docentes desde el panel y sentencias SQL). Sigue siendo válido, por ejemplo si quieres cuentas con contraseñas distintas, pero el comando anterior es el camino recomendado para la demostración.

## 1. Para qué sirve y qué NO cambia

La página `codigos-totp.html` hace lo mismo que la app de autenticación del celular: con la clave de cada cuenta calcula el código de 6 dígitos que cambia cada 30 segundos. Solo **reemplaza el celular por una pantalla**.

Lo que **no** cambia:

- El MFA sigue activo y es obligatorio para docentes y cuentas de gestión. No hay excepciones en el código ni cuentas sin MFA.
- Los parámetros son los del servidor (`server/src/utils/totp.js`): SHA-1, 6 dígitos, 30 segundos.
- Esta guía y la página no debilitan ningún control de seguridad: no tocan el servidor, la base de datos ni el despliegue (`docs/**` no dispara el despliegue).
- Las cuentas de la demostración se crean y se retiran **por el responsable técnico**, no por quien presenta (secciones 3 y 6).

La página funciona sin conexión y no envía nada a ningún sitio (tiene una política CSP que lo impide). Funciona en Chrome, Edge, Firefox y Safari, abierta con doble clic o desde un servidor `http://`.

## 2. Cómo usar la página

1. **Abrir**: copia `codigos-totp.html` a la laptop (memoria USB o correo) y ábrelo con doble clic. No necesita instalar nada.
2. **Pegar las cuentas** en el cuadro de texto, una por línea. Los códigos aparecen solos. Formatos aceptados:
   - `Nombre: CLAVE`
   - `Nombre CLAVE`
   - solo `CLAVE` (la cuenta se llama «Cuenta 1», «Cuenta 2»…)
   - la dirección completa `otpauth://totp/Etiqueta?secret=CLAVE&issuer=...` (el nombre sale de la etiqueta)
   - Las líneas que empiezan con `#` y las líneas vacías se ignoran. Si una línea tiene un error, aparece en una lista con su número de línea y el resto sigue funcionando (nunca se muestra la clave).
3. **Leer el código**: cada cuenta es una tarjeta grande con el código agrupado (`123 456`), una barra con los segundos restantes (cambia de color en los últimos 5) y el botón **Copiar**. «Mostrar el código siguiente» sirve en el cambio de periodo.
4. **Proyector**: usa **Pantalla completa** y los botones **A-** / **A+**. Hay tema claro y oscuro.
5. **Otra laptop**: pulsa **Copiar la lista**, pega ese bloque de texto en la página abierta en la otra PC. El texto es el formato portátil; no hace falta nada más.
6. **Recordar** (opcional): la casilla «Recordar las cuentas en este navegador» guarda el texto en `localStorage` (clave `ep_demo_totp_v1`). Viene desmarcada. **No la uses en una PC compartida.** Al desmarcarla se borra lo guardado.
7. **Reloj**: los códigos dependen de la hora de la PC. La página muestra la hora del equipo; si un código no funciona, revisa que la hora esté en modo automático (zona horaria correcta y sincronización activa).
8. **Al terminar**: pulsa **Borrar todo** (vacía la lista y borra lo guardado) y cierra la pestaña.

> La página muestra códigos de acceso en vivo. Ábrela solo en las laptops de quienes presentan, y no pegues las claves en chats públicos.

## 3. Cómo obtener la clave de cada tipo de cuenta

Crear las cuentas en producción y ejecutar estos comandos lo hace **el responsable técnico**. Esta sección describe la **alternativa manual**, cuenta por cuenta; para la demostración lo más simple es el comando de la primera sección («Crear todas las cuentas con un comando»), que ya imprime los secretos listos para pegar.

### Cuenta de gestión (access_manager, auditor, analyst, etc.)

En la VM de la app, dentro de la carpeta `server` de la aplicación:

```bash
node scripts/create-staff.js <usuario> <rol>
```

- Pide la contraseña por entrada estándar (mínimo 12 caracteres; no se pasa como argumento).
- Al final **imprime una sola vez** una dirección `otpauth://...`. La clave es el valor del parámetro `secret=`. Pega esa dirección completa en la página (toma el nombre de la etiqueta) o escribe `Nombre: CLAVE` con solo la clave.
- Si se pierde, `node scripts/reset-staff-mfa.js <usuario>` genera un secreto nuevo, lo imprime una vez y revoca las sesiones de esa cuenta.
- `node scripts/list-staff.js` lista las cuentas (sin secretos) y sirve para comprobar el resultado.

### Docente

1. Un usuario con rol `access_manager` (gestor de accesos) entra a `/staff/access` y crea la cuenta del docente. La pantalla muestra **una sola vez** una contraseña temporal.
2. El docente inicia sesión con esa contraseña temporal y crea la suya.
3. Como el MFA es obligatorio para docentes, llega a la pantalla de vinculación del autenticador (`/mfa/setup`). Ahí aparece el código QR y, debajo, el texto «¿No puedes escanearlo? Escribe esta clave en la app:» con una **clave de respaldo** de 32 caracteres, en dos filas de grupos de 4.
4. **Esa clave es el secreto que se pega en la página.** Se puede pegar con los espacios (`Nombre: ABCD EFGH ...`); si copias las dos filas, júntalas en una sola línea.
5. Con la página abierta, escribe el código de 6 dígitos que muestra en la pantalla de vinculación y pulsa «Activar y entrar».

La clave de vinculación vence a los 10 minutos: prepara la página antes de empezar, y si vence, la pantalla ofrece «Generar un código nuevo».

### Estudiante

Los estudiantes **no necesitan MFA**: es opcional para ellos. Se registran con el código de clase del docente y ya pueden entrar. Si quieres mostrar el MFA opcional de un estudiante, usa la pantalla de vinculación (`/mfa/setup`) con su sesión y la clave de respaldo funciona igual.

## 4. Cuentas sugeridas para la demostración

Las cuentas que crea el comando (primera sección) son las de la tabla siguiente, con los nombres exactos que usa el script. Si las creas a mano, usa esos mismos nombres para poder retirarlas con `remove`.

Un estudiante (el script crea dos, `demo.estudiante1` y `demo.estudiante2`), un docente y una cuenta por cada rol de gestión. Usa nombres de usuario claramente de demostración (3 a 30 caracteres: letras, números, `_`, `.` o `-`).

| Cuenta | Rol | Observación |
|---|---|---|
| `demo.estudiante1`, `demo.estudiante2` | student | Sin MFA (opcional) |
| `demo.docente` | teacher | MFA obligatorio |
| `demo.accesos` | access_manager | Tiene panel (`/staff/access`) |
| `demo.auditor` | auditor | Tiene panel |
| `demo.analista` | analyst | Tiene panel |
| `demo.contenido` | content_manager | Sin panel todavía |
| `demo.revision` | content_reviewer | Sin panel todavía |
| `demo.juego` | game_manager | Sin panel todavía |
| `demo.soporte` | support | Sin panel todavía |
| `demo.moderacion` | moderator | Sin panel todavía |

Los 8 roles de gestión están definidos en `server/src/config/staffRoles.js`. Hoy solo `access_manager`, `auditor` y `analyst` tienen un panel; los demás pueden iniciar sesión pero no tienen pantallas propias.

Bloque de ejemplo para pegar en la página (las claves `CLAVE_…` son marcadores: reemplázalos por las claves reales de cada cuenta):

```text
# Demostración English Panamá
Docente: CLAVE_DEL_DOCENTE
Gestor de accesos: CLAVE_DE_ACCESOS
Auditor: CLAVE_DEL_AUDITOR
Analista: CLAVE_DEL_ANALISTA
```

Para comprobar la página antes de la demostración puedes usar la clave de prueba del RFC 6238, `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ` (ejemplo, no es una cuenta real).

## 5. Buenas prácticas

- Para cuentas reales, contraseña **única y fuerte por cuenta**. La excepción es la demostración con `demo-accounts.js`: una contraseña compartida y débil, por decisión del responsable del proyecto, aceptable solo porque las cuentas se retiran el mismo día.
- No guardes el bloque de claves en chats públicos, en correos reenviados ni en el repositorio.
- Usa nombres de usuario claramente de demostración (`demo.…`) para poder identificarlos y retirarlos.
- Si envías el HTML por correo, envía **solo la página**, nunca las claves: esas se pegan en cada laptop.
- Al terminar: **Borrar todo** en la página, cierra la pestaña y retira las cuentas (`remove`, o la sección 6 si las creaste a mano).

## 6. Cómo retirar las cuentas de demostración a mano

Si las cuentas se crearon con `demo-accounts.js`, lo recomendado es retirarlas con `node scripts/demo-accounts.js remove --allow-production` (primera sección), que ya hace las comprobaciones de abajo. Esta sección es el procedimiento **manual** con SQL.

Lo ejecuta **el responsable técnico**, en la VM de la base de datos. El procedimiento es siempre el mismo: respaldo, `SELECT` para ver qué se va a tocar, y recién entonces el cambio.

1. **Respaldo** previo: usa el comando de la sección 4 de `docs/migraciones-produccion.md` (no se repite aquí).
2. Entra a MySQL: `sudo mysql englishpanama`.

> **Advertencia:** ejecuta siempre primero el `SELECT` y revisa que sean solo cuentas de demostración. Un `DELETE` no se puede deshacer sin el respaldo. Si prefieres no borrar, **desactivar** la cuenta (`is_active = 0` o `status = 'suspended'`) también corta el acceso y conserva el historial.

### Estudiante y docente (tablas `users`, `teachers`, `students`)

Las claves foráneas tienen `ON DELETE CASCADE` (`server/database/schema.sql`): al borrar el usuario se borran su fila de `teachers` o `students`, y todo lo que depende de ellas (intentos, respuestas, retos diarios completados). **Cuidado:** al borrar un docente se borran también todos los estudiantes vinculados a él, incluso los que no sean de la demostración.

```sql
-- 1) Ver las cuentas
SELECT id, role, username, created_at FROM users WHERE username IN ('demo.estudiante1', 'demo.estudiante2', 'demo.docente');

-- 2) Ver qué estudiantes colgarían del docente de demostración (deben ser solo los de la demo)
SELECT s.user_id, u.username
FROM students s JOIN users u ON u.id = s.user_id
WHERE s.teacher_id IN (SELECT id FROM users WHERE username = 'demo.docente');

-- 3) Borrar (solo si lo anterior es correcto)
START TRANSACTION;
DELETE FROM users WHERE username IN ('demo.estudiante1', 'demo.estudiante2', 'demo.docente');
-- Revisa "Query OK, N rows affected" y vuelve a ejecutar el SELECT 1. Luego:
COMMIT;   -- o ROLLBACK; si algo no cuadra
```

Alternativa sin borrar: `UPDATE users SET is_active = 0 WHERE username IN ('demo.estudiante1', 'demo.estudiante2', 'demo.docente');`

### Cuentas de gestión (tabla `staff_accounts`)

Las solicitudes de suspensión o activación (`staff_change_requests`) apuntan a `staff_accounts` **sin** `ON DELETE CASCADE`: primero hay que quitar esas filas, o el borrado falla. Revisa también que ninguna solicitud de una cuenta real dependa de una cuenta de demostración.

```sql
-- 1) Ver las cuentas (el listado equivale a node scripts/list-staff.js)
SELECT id, username, role, status, created_at FROM staff_accounts WHERE username LIKE 'demo.%';

-- 2) Ver las solicitudes que las referencian
SELECT * FROM staff_change_requests
WHERE target_id    IN (SELECT id FROM staff_accounts WHERE username LIKE 'demo.%')
   OR requested_by IN (SELECT id FROM staff_accounts WHERE username LIKE 'demo.%')
   OR decided_by   IN (SELECT id FROM staff_accounts WHERE username LIKE 'demo.%');

-- 3) Borrar (solo si todas las solicitudes del paso 2 son de la demostración)
START TRANSACTION;
DELETE FROM staff_change_requests
WHERE target_id    IN (SELECT id FROM staff_accounts WHERE username LIKE 'demo.%')
   OR requested_by IN (SELECT id FROM staff_accounts WHERE username LIKE 'demo.%')
   OR decided_by   IN (SELECT id FROM staff_accounts WHERE username LIKE 'demo.%');
DELETE FROM staff_accounts WHERE username LIKE 'demo.%';
COMMIT;   -- o ROLLBACK;
```

Alternativa sin borrar: `UPDATE staff_accounts SET status = 'suspended' WHERE username LIKE 'demo.%';` (cualquier sesión abierta de esas cuentas deja de servir).

### Lo que permanece

El registro de auditoría vive en otra base (`englishpanama_audit`) y es de solo añadir: el usuario de auditoría solo puede insertar y leer. Por diseño, las filas de `audit_log` de las cuentas de demostración **permanecen** (inicios de sesión, creación de cuentas, etc.). Es el comportamiento esperado y no se debe intentar borrarlo.
