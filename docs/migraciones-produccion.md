# Migración a producción — de `main` actual a `develop`

Guía para llevar a producción el backend MVP, la base de personal de gestión (roles, MFA, auditoría), la fase 2 de seguridad y el MFA obligatorio para docentes.

**Léela completa antes de empezar.** Las migraciones de base de datos son manuales (ver `docs/github-workflow.md`), y si se hace merge a `main` sin aplicarlas, el despliegue automático puede dejar el login caído.

## 0. Dónde va cada comando

Producción son **dos VM**. Cada bloque de comandos de este documento lleva una etiqueta:

| Etiqueta | Dónde se pega | Qué se hace ahí |
|---|---|---|
| **[VM-BD]** | VM de la base de datos (MySQL, IP privada `10.0.0.243` según `env.example`) | Respaldo, migraciones SQL, crear la base y el usuario de auditoría |
| **[VM-APP]** | VM de la aplicación (`150.136.50.253`) | Variables de entorno (`.env`), `pm2`, scripts de cuentas de gestión |
| **[TU PC]** | Tu computadora, dentro del clon del repositorio | Copiar los archivos SQL a la VM-BD, hacer el merge a `main` |

> La base de datos de producción solo es alcanzable desde la VM-APP. Por eso las migraciones se ejecutan **en la VM-BD** (con el administrador de MySQL), no desde la VM-APP ni desde tu PC.

## 1. Qué cambia en la base de datos

Producción tiene hoy el esquema de `main`. `develop` agrega:

| Cambio | Detalle | Archivo |
|---|---|---|
| 7 columnas nuevas en `users` | `is_active`, `token_version`, `failed_attempts`, `locked_until`, `mfa_secret_enc`, `mfa_pending_enc`, `mfa_pending_expires_at` | `migrations/prod-upgrade-users.sql` |
| 2 tablas nuevas | `staff_accounts`, `staff_change_requests` | `server/database/staff.sql` |
| Base nueva `englishpanama_audit` | tabla `audit_log` (solo anexar, con cadena de hashes) | `server/database/audit.sql` |
| Usuario nuevo `audit_writer` | solo `INSERT` y `SELECT` sobre `audit_log` | se crea a mano (paso 5.3) |

**Los tres primeros están reunidos en un único archivo, `server/database/migrations/prod-upgrade-all.sql`, que es lo que se ejecuta en producción** (paso 5).

**Propiedades de la migración** (comprobadas, ver sección 12):

- **Aditiva:** no borra ni modifica datos. Los usuarios existentes quedan con `is_active = 1`, `token_version = 0` y sin MFA.
- **Repetible:** `prod-upgrade-users.sql` se puede correr dos veces sin error.
- **Compatible hacia atrás:** el código actual de producción sigue funcionando con la base ya migrada (las columnas nuevas tienen valor por defecto). Por eso se migra la base **antes** de desplegar, y el rollback del código no requiere tocar la base.

> **No uses `phase2-lockout.sql` ni `phase2-platform-mfa.sql` en producción.** `prod-upgrade-users.sql` los reemplaza. (La versión anterior de `phase2-lockout.sql` usaba `ADD COLUMN IF NOT EXISTS`, que solo existe en MariaDB y falla en MySQL 8 con `ERROR 1064`; ya está corregida en el repositorio.) Tampoco corras `schema.sql`: crea tablas y falla sobre una base existente.

## 2. Orden de la operación

1. **Verificación previa** (solo lectura) — paso 3.
2. **Respaldo** de la base — paso 4.
3. **Migración de la base** — paso 5. *Punto de control A: la aplicación actual sigue funcionando.*
4. **Variables de entorno y configuración de nginx** en la VM-APP — paso 6 y 6.1.
5. **Despliegue** (merge `develop` → `main`) — paso 7. *Punto de control B.*
6. **Cuentas de gestión y primer docente** — paso 8 y 8.1.
7. **Verificación funcional** — paso 9.

No saltes pasos ni cambies el orden: el paso 6 debe estar **antes** del 7, porque con `NODE_ENV=production` el servidor se niega a arrancar sin las variables de auditoría.

## 3. Verificación previa (solo lectura)

Estos comandos **no modifican nada**. Pega la salida de cada uno para confirmar el estado real antes de migrar (no incluyas contraseñas ni claves).

**[VM-BD]**

```bash
# Versión de MySQL y zona horaria (las migraciones se probaron en MySQL 8.0)
sudo mysql -e "SELECT VERSION() AS version, @@global.time_zone AS tz_global, @@system_time_zone AS tz_sistema;"

# Bases existentes y puerto en el que escucha MySQL
sudo mysql -e "SHOW DATABASES;"
sudo ss -ltnp | grep mysqld

# Usuarios de MySQL y desde qué host pueden conectarse
sudo mysql -e "SELECT user, host FROM mysql.user WHERE user NOT LIKE 'mysql.%';"

# Estado actual de la tabla users y cuántos hay de cada rol
sudo mysql englishpanama -e "SHOW COLUMNS FROM users;"
sudo mysql englishpanama -e "SELECT role, COUNT(*) AS cantidad FROM users GROUP BY role;"

# Espacio en disco para el respaldo
df -h /var/lib/mysql ~
```

> Si `sudo mysql` pide contraseña o falla, usa `mysql -u root -p` en su lugar. Si tu base no se llama `englishpanama`, usa el nombre que tenga `DB_NAME` en el `.env` de la VM-APP.

**[VM-APP]**

```bash
# IP privada de esta VM (la necesitas para el usuario de auditoría)
hostname -I

# Versiones y estado de la API
node -v
pm2 list

# SOLO los NOMBRES de las variables del .env (no imprime los valores)
cd /var/www/englishpanama/api && grep -oE '^[A-Z_]+=' .env | tr -d '=' | sort

# Configuración EFECTIVA de nginx (no uses `grep -r` sobre sites-enabled: no sigue los enlaces simbólicos y da un falso negativo)
sudo nginx -T 2>/dev/null | grep -nE "server_name|listen|root |location|proxy_pass|proxy_set_header"
sudo ss -ltnp | grep -E ':80 |:443 |:3000 '
```

**Qué se espera de la salida:**

- `SHOW COLUMNS FROM users` debe mostrar solo `id, role, username, password_hash, created_at`. Si ya aparece alguna de las 7 columnas nuevas, avísalo: la migración las salta, pero hay que entender por qué.
- MySQL debe escuchar en el puerto **3306**. La aplicación ignora la variable `DB_PORT` (siempre usa el puerto por defecto), así que otro puerto no funcionaría.
- En el `.env` deben existir como mínimo `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `JWT_SECRET`.

### 3.1 Resultado de la verificación previa (producción, confirmado)

| Dato | Valor | Lectura |
|---|---|---|
| MySQL | 8.0.46 (Ubuntu 22.04), zona horaria `SYSTEM` = UTC | Misma versión mayor que las pruebas; la zona horaria es la esperada |
| Puerto de MySQL | `10.0.0.243:3306` (solo escucha en la IP privada, no en `127.0.0.1`) | Correcto: la aplicación usa el puerto 3306. `sudo mysql` entra por el socket local |
| Bases | `englishpanama` (no existe todavía `englishpanama_audit`) | Como se esperaba |
| Usuarios de MySQL | `app_user@10.0.0.186`, `root@localhost`, `debian-sys-maint@localhost` | `10.0.0.186` es la IP de la VM-APP: de ahí sale el host de `audit_writer` |
| Tabla `users` | `id, role, username, password_hash, created_at` | Es el esquema anterior: ninguna de las 7 columnas nuevas existe aún |
| Disco VM-BD | 39 GB libres de 45 GB | Sobra para el respaldo |
| VM-APP | IP `10.0.0.186`, Node v24.21.0, `pm2`: `api` en línea (18 días, 3 reinicios) | La API está sana |
| `.env` de la VM-APP | `DB_HOST DB_NAME DB_PASSWORD DB_USER DEMO_MODE JWT_SECRET PORT` | Faltan las variables nuevas del paso 6 (`NODE_ENV`, `TRUST_PROXY`, `STAFF_*`, `AUDIT_DB_*`) |
| nginx | activo; escucha en el puerto 80 (sin 443); `location /api/` hace `proxy_pass http://localhost:3000` y envía `Host` y `X-Real-IP`, **pero no `X-Forwarded-For`** | **Hay que corregirlo** (sección 6.1): Express usa `X-Forwarded-For`, no `X-Real-IP` |
| API (puerto 3000) | el proceso `node` escucha en `*:3000`, es decir, en **todas** las interfaces, no solo en localhost | Hay que comprobar que desde fuera no se alcance (sección 10) |
| Tabla `users` | **0 filas** (confirmado) | No hay cuentas que migrar: los docentes y estudiantes se crean desde cero con el flujo nuevo |

Notas:

- Con la tabla `users` vacía, la consulta de verificación 2 del paso 5.4 no imprime filas: es lo normal.
- La VM-APP corre Node 24 y el flujo de despliegue compila con Node 20. Las dependencias del servidor no tienen binarios dependientes de la versión de Node, y la API ya corre así hoy; no se espera ningún problema.

## 4. Respaldo

**[VM-BD]**

```bash
mkdir -p ~/backups
sudo mysqldump --single-transaction --routines --triggers englishpanama | gzip > ~/backups/englishpanama-$(date +%Y%m%d-%H%M).sql.gz

# Comprobar que el archivo existe, pesa algo y no está corrupto
ls -lh ~/backups/
gunzip -t ~/backups/englishpanama-*.sql.gz && echo "respaldo OK"
```

Recomendado: copia el respaldo **fuera** de la VM (por ejemplo, con `scp` a tu PC).

## 5. Migración de la base de datos

### 5.1 Llevar el archivo a la VM-BD

Toda la migración está en **un solo archivo**: `server/database/migrations/prod-upgrade-all.sql`. Es la concatenación, sin cambios, de `prod-upgrade-users.sql`, `staff.sql` y `audit.sql`.

**[TU PC]** (dentro del clon del repositorio, con la rama que contiene el archivo)

```bash
scp server/database/migrations/prod-upgrade-all.sql TU_USUARIO@IP_VM_BD:~/migracion-produccion.sql
```

Usa tu método habitual para llegar a la VM-BD (si solo se entra a través de la VM-APP, agrega `-o ProxyJump=TU_USUARIO@150.136.50.253`).

**Alternativa sin `scp`:** en la VM-BD ejecuta `cat > ~/migracion-produccion.sql`, pega el contenido del archivo y termina con `Ctrl+D`.

**[VM-BD]** — comprobar que el archivo llegó completo:

```bash
wc -l ~/migracion-produccion.sql        # esperado: 177 líneas
head -3 ~/migracion-produccion.sql
```

### 5.2 Aplicar la migración

**[VM-BD]**

```bash
sudo mysql < ~/migracion-produccion.sql && echo "MIGRACION OK"
```

El archivo selecciona él mismo cada base (`USE`), así que no hay que indicarla en el comando. Crea la base `englishpanama_audit` si no existe. Es repetible: si se interrumpe, se puede correr de nuevo.

### 5.3 Usuario de auditoría (solo `INSERT` y `SELECT`)

El host es la IP privada de la VM-APP (`10.0.0.186`, la misma que usa `app_user`). **No uses `'%'`**: así solo la VM-APP puede conectarse con este usuario.

**[VM-BD]**

```bash
# Genera una clave segura y MUESTRALA una sola vez: la copiarás al .env de la VM-APP (paso 6)
AUDIT_PASS=$(openssl rand -hex 24)
echo "Clave de audit_writer (cópiala ahora): $AUDIT_PASS"

# La clave viaja por stdin, no queda en la lista de procesos
sudo mysql <<SQL
CREATE USER IF NOT EXISTS 'audit_writer'@'10.0.0.186' IDENTIFIED BY '${AUDIT_PASS}';
GRANT INSERT, SELECT ON englishpanama_audit.audit_log TO 'audit_writer'@'10.0.0.186';
FLUSH PRIVILEGES;
SQL

unset AUDIT_PASS
```

### 5.4 Verificar

**[VM-BD]**

```bash
# 1) Las 7 columnas nuevas existen
sudo mysql englishpanama -e "SHOW COLUMNS FROM users;" | cut -f1 | tr '\n' ' '; echo
#   esperado: id role username password_hash is_active token_version failed_attempts locked_until mfa_secret_enc mfa_pending_enc mfa_pending_expires_at created_at

# 2) Los usuarios existentes siguen activos y sin MFA (nadie quedó fuera)
sudo mysql englishpanama -e "SELECT role, COUNT(*) AS total, SUM(is_active) AS activos, SUM(mfa_secret_enc IS NOT NULL) AS con_mfa FROM users GROUP BY role;"

# 3) Las tablas de personal y de auditoría existen
sudo mysql englishpanama -e "SHOW TABLES LIKE 'staff%';"
sudo mysql englishpanama_audit -e "SHOW TABLES;"

# 4) El usuario de auditoría SOLO puede insertar y leer
sudo mysql -e "SHOW GRANTS FOR 'audit_writer'@'10.0.0.186';"
#   esperado: GRANT USAGE ON *.* ... y GRANT SELECT, INSERT ON `englishpanama_audit`.`audit_log` ...
```

Si la tabla `users` está vacía, la consulta 2 no imprime filas: es normal.

### Punto de control A — la aplicación actual debe seguir funcionando

La base ya está migrada pero **todavía corre el código viejo**. Compruébalo antes de seguir.

**[VM-APP]**

```bash
curl -s localhost:3000/api/health
pm2 logs api --lines 20 --nostream
```

Esperado: `{"status":"ok","db":"connected"}` y sin errores nuevos en los logs. Entra además con un estudiante desde la página. Si algo falla aquí, **detente**: el código viejo no debería notar la migración, y hay que entender por qué antes de continuar.

## 6. Variables de entorno (VM-APP)

El despliegue **no toca** el `.env` (el `rsync` lo excluye), así que se edita a mano **antes** del despliegue.

**[VM-APP]**

```bash
cd /var/www/englishpanama/api

# Respaldo del .env actual
cp .env ~/env-backup-$(date +%Y%m%d)
chmod 600 .env ~/env-backup-*

# Secretos nuevos (se agregan sin imprimirlos en pantalla)
printf '\nSTAFF_JWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
printf 'STAFF_MFA_KEY=%s\n' "$(openssl rand -base64 32)" >> .env

# Variables restantes: edita el archivo y completa los valores
nano .env
```

Variables que deben quedar en el `.env`:

| Variable | Valor | Notas |
|---|---|---|
| `NODE_ENV` | `production` | Con esto el servidor **exige** las variables `AUDIT_DB_*` y los scripts de demostración se niegan a correr (`seed-demo-content.js` solo con `--allow-production`, sección 14.1) |
| `TRUST_PROXY` | `true` | **Imprescindible detrás de nginx**, junto con el cambio de la sección 6.1 |
| `JWT_SECRET` | *(ya existe)* | No la cambies: invalidaría todas las sesiones |
| `STAFF_JWT_SECRET` | *(generada arriba)* | Debe ser **distinta** de `JWT_SECRET` |
| `STAFF_MFA_KEY` | *(generada arriba)* | 32 bytes en base64. **Respáldala fuera de la VM** (ver abajo) |
| `AUDIT_DB_HOST` | `10.0.0.243` | IP privada de la VM-BD |
| `AUDIT_DB_USER` | `audit_writer` | |
| `AUDIT_DB_PASSWORD` | *(la clave del paso 5.3)* | |
| `AUDIT_DB_NAME` | `englishpanama_audit` | |
| `DEMO_MODE` | `false` | Pon `true` solo para la presentación |
| `CORS_ORIGIN` | origen del sitio, por ejemplo `http://150.136.50.253` | Si queda vacío, la API acepta peticiones de cualquier origen |

> **Guarda `STAFF_MFA_KEY` en un lugar seguro, separado de los respaldos de la base.** Cifra todos los secretos de MFA. Si se pierde, ningún código TOTP podrá verificarse: todo el personal y todos los docentes tendrían que volver a vincular su autenticador.

Verifica los nombres (sin valores) y los permisos:

```bash
grep -oE '^[A-Z_]+=' .env | tr -d '=' | sort
ls -l .env     # esperado: -rw------- (600)
```

### 6.1 Configuración de nginx (VM-APP)

`TRUST_PROXY=true` **no basta**: la API solo mira la cabecera `X-Forwarded-For`, y la configuración actual de nginx no la envía (solo envía `X-Real-IP`). Hay que agregarla. Se probó con la configuración exacta de producción (ver sección 12).

**[VM-APP]**

```bash
# 1) Encontrar el archivo que contiene el bloque (puede estar en sites-available, sites-enabled o nginx.conf)
sudo grep -Rl "proxy_pass http://localhost:3000" /etc/nginx/
```

Usa el archivo que aparezca (aquí `ARCHIVO`; si salen dos rutas que apuntan al mismo archivo por un enlace simbólico, edita el original de `sites-available`).

```bash
# 2) Respaldo
sudo cp -a ARCHIVO ~/nginx-backup-$(date +%Y%m%d)

# 3) Agregar la cabecera una sola vez, debajo de X-Real-IP (si ya existe, no hace nada)
sudo grep -q "X-Forwarded-For" ARCHIVO || sudo sed -i '/proxy_set_header X-Real-IP \$remote_addr;/a\            proxy_set_header X-Forwarded-For $remote_addr;' ARCHIVO

# 4) Revisar el cambio y validar la configuración ANTES de recargar
sudo nginx -t
sudo nginx -T 2>/dev/null | grep -n "proxy_set_header"
```

Esperado: `nginx -t` dice `syntax is ok` y `test is successful`, y la lista de `proxy_set_header` ahora incluye `X-Forwarded-For $remote_addr`.

```bash
# 5) Recargar (no corta las conexiones en curso)
sudo systemctl reload nginx
```

Se usa `$remote_addr` y no `$proxy_add_x_forwarded_for` a propósito: así nginx **sobrescribe** cualquier `X-Forwarded-For` que traiga el cliente y nadie puede inventarse su IP. Si algo falla, restaura el respaldo y recarga: `sudo cp -a ~/nginx-backup-<fecha> ARCHIVO && sudo nginx -t && sudo systemctl reload nginx`.

Este cambio es independiente del despliegue y compatible con el código actual: se puede hacer antes, sin riesgo.

## 7. Despliegue

El despliegue se dispara solo al hacer push a `main` (los cambios que solo tocan `docs/**` o `*.md` no lo disparan).

**Antes de empezar**, confirma que ya hiciste los pasos 4, 5 y 6, y que el PR #8 (MFA obligatorio para docentes, que ya incluye el trabajo de #7) ya está en `develop`.

**[TU PC]**

Por convención no se hace push directo a `main` (hoy GitHub no tiene activada la protección de rama). En GitHub, abre un Pull Request de `develop` hacia `main`, revísalo y mergéalo. Ese merge es lo que dispara el despliegue.

Sigue el despliegue en la pestaña **Actions** del repositorio. Termina reiniciando la API con `pm2 restart api`.

### Punto de control B — la API arrancó

**[VM-APP]**

```bash
pm2 status
pm2 logs api --lines 30 --nostream
curl -s localhost:3000/api/health
```

Esperado: `api` en estado `online` y `{"status":"ok","db":"connected"}`.

**Si `api` entra en bucle de reinicios:** casi seguro falta una variable. Los logs dirán, por ejemplo, `Auditoria mal configurada para produccion. Falta: AUDIT_DB_HOST...`. Corrige el `.env` y ejecuta `pm2 restart api`. Si no se resuelve rápido, usa el rollback de la sección 11.

## 8. Cuentas de gestión

Las cuentas de gestión **solo se crean desde el servidor**, por decisión de diseño. Se hace en la VM-APP, con los scripts del repositorio ya desplegados.

**[VM-APP]**

```bash
cd /var/www/englishpanama/api

# La contraseña se pide por teclado (no queda en el historial). Mínimo 12 caracteres.
node scripts/create-staff.js <usuario> <rol>
```

Roles disponibles: `access_manager`, `auditor`, `content_manager`, `content_reviewer`, `game_manager`, `support`, `analyst`, `moderator`.

Crea primero **un `access_manager` y un `auditor`**, que son los que se necesitan para operar los accesos y revisar la auditoría. El script muestra **una sola vez** un enlace `otpauth://...`. Para vincular el autenticador del celular:

- En la app de autenticación elige **"ingresar clave manualmente"** y copia el valor que aparece después de `secret=` en el enlace; o
- genera un QR en la terminal con `qrencode` (`sudo apt install qrencode` y luego `qrencode -t ANSIUTF8 '<enlace otpauth>'`).

Otros scripts útiles en la misma carpeta: `list-staff.js` (lista las cuentas, sin secretos) y `reset-staff-mfa.js` (regenera el MFA de una cuenta de gestión).

> **Nunca** corras `seed-demo-staff.js` ni `seed-demo-student.js` en producción: crean cuentas de demostración. Con `NODE_ENV=production` se niegan a correr. `seed-demo-content.js` no crea cuentas (siembra actividades de ejemplo) y solo corre en producción con `--allow-production`, a mano (sección 14.1).

### 8.1 Crear el primer docente

Los docentes **no se registran**: los crea el gestor de accesos con la API (todavía no hay interfaz para el personal). Se hace desde la VM-APP contra `localhost:3000`, así la contraseña no viaja por internet. Necesitas el código de 6 dígitos de la app de autenticación del `access_manager`.

**[VM-APP]**

```bash
read -rp "Usuario de gestión: " U; read -rsp "Contraseña: " P; echo; read -rp "Código TOTP de 6 dígitos: " C

TOKEN=$(curl -s -X POST http://localhost:3000/api/staff/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"password\":\"$P\",\"totp\":\"$C\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
echo "token: ${TOKEN:0:12}..."     # si sale "undefined", el usuario, la contraseña o el código son incorrectos

curl -s -X POST http://localhost:3000/api/staff/teachers \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"username":"usuario.docente","displayName":"Nombre del Docente"}'
unset P TOKEN
```

La respuesta trae el `classCode` y una `temporaryPassword` que **se muestra una sola vez**: anótala y entrégala al docente por un medio seguro. El código de TOTP dura 30 segundos; si el login falla, escribe uno nuevo.

El docente iniciará sesión con esa contraseña temporal y, en su primer ingreso, **deberá crear su propia contraseña** (pantalla `/password/initial`; no obtiene sesión hasta hacerlo) y luego vinculará su autenticador (obligatorio). Esto requiere la migración de la sección 13.

## 9. Verificación funcional

Desde el navegador, en `http://150.136.50.253`:

Como la tabla `users` está vacía, no hay cuentas previas: se prueba con las que se creen.

1. **Docente:** crea uno (sección 8.1) e inicia sesión con la contraseña temporal. Primero debe aparecer **"Crea tu contraseña"**; al guardarla, aparece la pantalla **"Protege tu cuenta"** (vinculación obligatoria del autenticador). Tras escanear el QR y escribir el código, entra a `/teacher`.
2. **Estudiante:** regístrate desde `/register` con el código de clase del docente. Debe entrar directo a `/student`.
3. **Registro de docentes deshabilitado:** `POST /api/auth/register/teacher` responde 403. Las cuentas de docente las crea el gestor de accesos.

**[VM-APP]** — revisar que el registro de auditoría esté funcionando:

```bash
pm2 logs api --lines 50 --nostream | grep -i "auditoria" || echo "sin errores de auditoria"
```

Y con una cuenta `auditor`, `GET /api/staff/audit/verify` debe responder `{ "ok": true, ... }`.

## 10. Riesgos conocidos

**Límite de intentos y nginx (importante).** Los endpoints de autenticación permiten 20 intentos cada 15 minutos **por IP**. Si la API no conoce la IP real del cliente, ve a todos los usuarios con la IP de nginx (`127.0.0.1`): el límite se comparte y, tras 20 intentos de login de cualquier persona, **nadie más puede entrar** durante 15 minutos. Se comprobó con nginx 1.24 real delante de la API, 22 clientes con IPs distintas:

| nginx | `TRUST_PROXY` | Resultado |
|---|---|---|
| **el actual** (`X-Real-IP`, sin `X-Forwarded-For`) | `true` | cliente 21 y 22: **429** (bucket compartido: el problema sigue) |
| con `X-Forwarded-For $remote_addr` | `true` | los 22 pasan (**correcto**) |
| con `X-Forwarded-For $remote_addr` | `false` | cliente 21 y 22: **429** (bucket compartido) |

Hacen falta **las dos cosas**: el cambio de nginx (sección 6.1) y `TRUST_PROXY=true` (sección 6). Con la configuración corregida, un atacante que inventa cabeceras `X-Forwarded-For` desde una sola IP sigue topando con el límite (429 al intento 21), porque nginx sobrescribe la cabecera.

**La API escucha en todas las interfaces.** El proceso `node` escucha en `*:3000`, no solo en localhost. Si el puerto 3000 se alcanzara desde internet, alguien podría saltarse nginx y, con `TRUST_PROXY=true`, inventar su IP con `X-Forwarded-For` para evadir el límite por IP (se comprobó: 22 IP inventadas pasan sin bloqueo). Compruébalo desde **fuera** de la VM:

**[TU PC]**

```bash
curl -m 5 -s -o /dev/null -w "%{http_code}\n" http://150.136.50.253:3000/api/health
```

Lo correcto es que **no responda** (tiempo agotado o conexión rechazada). Si devuelve `200`, hay que cerrar el puerto 3000 en el firewall de la VM y en la lista de seguridad de Oracle Cloud (el único puerto público de la aplicación debe ser el 80, o el 443 con HTTPS).

**Todo el tráfico va sin cifrar.** nginx solo escucha en el puerto 80 (HTTP): las contraseñas, los códigos de MFA y los tokens de sesión viajan en texto claro por internet. Para uso real con alumnos conviene un dominio y un certificado gratuito (Let's Encrypt con `certbot`) y redirigir el 80 al 443. No bloquea esta migración, pero es el mayor riesgo que queda.

**Bloqueo por intentos.** Hoy es de 3 intentos y 10 segundos, también para el personal de gestión. Es más laxo que lo ideal para cuentas de gestión; está registrado como decisión pendiente en `docs/specs/staff-fase-a.md`.

**Contraseña temporal de los docentes.** El primer ingreso exige crear una contraseña propia (`POST /api/auth/set-initial-password`, migración de la sección 13): la temporal deja de servir en cuanto se reemplaza. Hasta entonces, quien crea la cuenta la conoce.

**Sin interfaz para el personal de gestión.** Las acciones de gestión (crear docentes, solicitar suspensiones, consultar la auditoría) son solo API por ahora.

**Comentarios de columnas.** La base de producción conserva los comentarios de columna con acentos del esquema original; el esquema nuevo los trae sin acentos. Es solo cosmético y no afecta nada.

## 11. Rollback

El código se puede revertir sin tocar la base, porque la migración es compatible hacia atrás.

1. **Código — [TU PC]:** deshaz el merge con un Pull Request de reversión hacia `main` (por convención no se hace push directo a `main`); al mergearlo, el despliegue automático lo aplica.
   ```bash
   git checkout main && git pull origin main
   git checkout -b revert/migracion-develop
   git revert -m 1 <hash-del-merge-a-main>
   git push origin revert/migracion-develop      # y abre el PR hacia main
   ```
2. **Variables — [VM-APP]:** si el problema fue una variable, restaura el respaldo y reinicia.
   ```bash
   cp ~/env-backup-<fecha> /var/www/englishpanama/api/.env && pm2 restart api
   ```
3. **Base de datos — [VM-BD]:** normalmente **no hace falta**. Restaurar el respaldo reemplaza las tablas y **pierde lo escrito desde el respaldo**; hazlo solo si la base quedó dañada.
   ```bash
   gunzip -c ~/backups/<archivo>.sql.gz | sudo mysql englishpanama
   ```

## 12. Qué se probó y qué no

**Probado**, contra un **MySQL 8.0.46 real** con una base que replica el estado actual de producción (esquema de `main` con usuarios, docente, estudiantes, actividad y un intento de ejemplo):

- `prod-upgrade-all.sql` (el archivo único) corre sin errores, **dos veces seguidas** y sin indicar la base en el comando, y los datos existentes quedan intactos (`is_active = 1`, `token_version = 0`, sin MFA).
- El esquema resultante es **idéntico** al de una instalación nueva con `schema.sql` + `staff.sql`: columnas, orden, tipos, valores por defecto, índices y claves foráneas. Solo difieren 4 comentarios de columna.
- `staff.sql` y `audit.sql` corren sin errores; el usuario `audit_writer` con host restringido queda solo con `SELECT, INSERT`, y el motor rechaza `UPDATE` y `DELETE` (`ER_TABLEACCESS_DENIED_ERROR`).
- El `INSERT` y el `SELECT` del código **anterior** funcionan sobre la base migrada.
- La suite de pruebas del backend (**71 pruebas**, rama `feat/teacher-mfa-enrollment`) pasa completa contra la base migrada.
- Con `NODE_ENV=production`, el servidor se niega a arrancar sin `AUDIT_DB_*` y arranca con ellas.
- Con **nginx 1.24 real** delante de la API: la configuración actual de producción no resuelve el límite compartido ni con `TRUST_PROXY=true`; con `X-Forwarded-For $remote_addr` sí, y no se puede falsificar la IP desde fuera (sección 10). El `sed` de la sección 6.1 se aplicó sobre una copia de esa configuración: agrega una línea, `nginx -t` pasa y la condición `grep -q` evita duplicarla.
- Procedimiento de la sección 8 en **modo producción** (`NODE_ENV=production` con el `.env` completo): el servidor arranca, `create-staff.js` crea la cuenta, el login del gestor con TOTP devuelve token y `POST /staff/teachers` crea el docente (sección 8.1).
- `phase2-lockout.sql` original falla en MySQL 8 con `ERROR 1064`; la versión corregida funciona.

**No probado** (depende de tu entorno real): el firewall y la lista de seguridad de Oracle Cloud (si el puerto 3000 es alcanzable desde fuera), `pm2` en tu VM, los permisos de tu cuenta de SSH, y el comportamiento de una app de autenticación real en un celular. El estado de MySQL, de `users` y de nginx ya se verificó con tus salidas (sección 3.1).

## 13. Migración incremental: cambio obligatorio de contraseña

Este cambio agrega a `users` la columna `must_change_password` (`TINYINT(1) NOT NULL DEFAULT 0`). Vale `1` para los docentes que cree el gestor de accesos desde ahora; los usuarios existentes quedan en `0` y no notan nada. Archivo: `server/database/migrations/phase3-must-change-password.sql`. Es aditiva y repetible (comprueba `information_schema` antes del `ALTER`).

> **Esta migración se aplica ANTES de desplegar el código.** El código nuevo lee `must_change_password` en el login y en cada petición autenticada; si la columna no existe, falla con `ER_BAD_FIELD_ERROR` y el login queda caído. El código viejo, en cambio, ignora la columna, así que migrar antes es seguro.

Si estás haciendo la migración completa de las secciones 4 y 5, aplica esta justo después de `prod-upgrade-all.sql` y antes del despliegue (sección 7). Si la base ya estaba migrada, hazla por separado como sigue.

**1. Respaldo — [VM-BD]** (mismo procedimiento de la sección 4)

```bash
mkdir -p ~/backups
BACKUP=~/backups/englishpanama-$(date +%Y%m%d-%H%M).sql.gz
sudo mysqldump --single-transaction --routines --triggers englishpanama | gzip > "$BACKUP"
gunzip -t "$BACKUP" && echo "respaldo OK: $BACKUP"
```

Recomendado: copia el respaldo **fuera** de la VM (por ejemplo, con `scp` a tu PC).

**2. Llevar el archivo a la VM-BD — [TU PC]** (dentro del clon del repositorio, con la rama que contiene el archivo)

```bash
scp server/database/migrations/phase3-must-change-password.sql TU_USUARIO@IP_VM_BD:~/phase3-must-change-password.sql
```

Igual que en la sección 5.1, si solo se entra a través de la VM-APP agrega `-o ProxyJump=TU_USUARIO@150.136.50.253`.

**3. Aplicar — [VM-BD]** (es la base principal; el archivo usa `DATABASE()`, por eso se indica en el comando)

```bash
sudo mysql englishpanama < ~/phase3-must-change-password.sql && echo "MIGRACION OK"
```

**4. Verificar — [VM-BD]**

```bash
# La columna existe
sudo mysql englishpanama -e "SHOW COLUMNS FROM users LIKE 'must_change_password';"

# Los usuarios existentes quedan con 0
sudo mysql englishpanama -e "SELECT must_change_password, COUNT(*) FROM users GROUP BY must_change_password;"
#   esperado: solo la fila con valor 0 (ninguna con 1 hasta que se cree un docente nuevo)
```

Si la tabla `users` está vacía, la segunda consulta no imprime filas: es normal.

**5. Desplegar** el código (sección 7) y comprobar el flujo con un docente nuevo (sección 9).

**Rollback.** El código se revierte como en la sección 11. La columna se puede **dejar en su sitio**: es inofensiva para el código anterior (tiene valor por defecto y nadie la lee), así que no hace falta quitarla. Un docente que ya hubiera sido creado con la bandera en `1` entraría, bajo el código viejo, con su contraseña temporal. Solo si hubiera una razón para eliminarla, es `ALTER TABLE users DROP COLUMN must_change_password;` en la VM-BD (después de revertir el código).

## 14. Migración incremental: grado de la clase

Este cambio agrega el **grado de la clase** (3, 4 o 5) y el **nivel** de las actividades (A1.1, A1.2 o A1.3). El docente declara el grado una sola vez y sus estudiantes solo ven las actividades de ese nivel. Archivo: `server/database/migrations/phase4-class-grade.sql`. Es aditiva y repetible (comprueba `information_schema` antes de cada `ALTER`).

| Tabla | Columna nueva | Valor para las filas existentes |
|---|---|---|
| `teachers` | `grade` (`TINYINT UNSIGNED NULL`) | `NULL`: el docente aún no ha declarado el grado |
| `teachers` | `grade_locked_at` (`TIMESTAMP NULL`) | `NULL` |
| `activities` | `level` (`ENUM('A1.1','A1.2','A1.3') NOT NULL DEFAULT 'A1.1'`) | `A1.1` |
| `activities` | `is_example` (`TINYINT(1) NOT NULL DEFAULT 0`) | `0`: no es un ejemplo |

> **Esta migración se aplica ANTES de desplegar el código.** El código nuevo lee `teachers.grade` y `activities.level` en el perfil, en las actividades y en el panel docente; si las columnas no existen, esas rutas fallan con `ER_BAD_FIELD_ERROR`. El código viejo, en cambio, ignora las columnas nuevas (tienen valor por defecto o aceptan `NULL`), así que migrar antes es seguro.

Si estás haciendo la migración completa de las secciones 4 y 5, aplica esta después de `prod-upgrade-all.sql` y de la sección 13, y antes del despliegue (sección 7). Si la base ya estaba migrada, hazla por separado como sigue.

**1. Respaldo — [VM-BD]** (mismo procedimiento de la sección 4)

```bash
mkdir -p ~/backups
BACKUP=~/backups/englishpanama-$(date +%Y%m%d-%H%M).sql.gz
sudo mysqldump --single-transaction --routines --triggers englishpanama | gzip > "$BACKUP"
gunzip -t "$BACKUP" && echo "respaldo OK: $BACKUP"
```

Recomendado: copia el respaldo **fuera** de la VM (por ejemplo, con `scp` a tu PC).

**2. Llevar el archivo a la VM-BD — [TU PC]** (dentro del clon del repositorio, con la rama que contiene el archivo)

```bash
scp server/database/migrations/phase4-class-grade.sql TU_USUARIO@IP_VM_BD:~/phase4-class-grade.sql
```

Igual que en la sección 5.1, si solo se entra a través de la VM-APP agrega `-o ProxyJump=TU_USUARIO@150.136.50.253`.

**3. Aplicar — [VM-BD]** (es la base principal; el archivo usa `DATABASE()`, por eso se indica en el comando)

```bash
sudo mysql englishpanama < ~/phase4-class-grade.sql && echo "MIGRACION OK"
```

**4. Verificar — [VM-BD]**

```bash
# Las columnas del docente existen
sudo mysql englishpanama -e "SHOW COLUMNS FROM teachers LIKE 'grade%';"
#   esperado: dos filas, grade y grade_locked_at

# Las columnas de las actividades existen
sudo mysql englishpanama -e "SHOW COLUMNS FROM activities LIKE 'level';"
sudo mysql englishpanama -e "SHOW COLUMNS FROM activities LIKE 'is_example';"

# Las actividades existentes quedan en A1.1
sudo mysql englishpanama -e "SELECT level, COUNT(*) FROM activities GROUP BY level;"
```

Qué esperar en producción:

- Si `activities` está vacía, la última consulta no imprime filas: es normal (la verificación previa de la sección 3.1 solo confirmó que `users` tiene 0 filas; el contenido de `activities` no se revisó).
- Si ya hubiera actividades, todas salen en `A1.1` (y con `is_example = 0`). Revisa si realmente son de ese nivel: solo las clases de 3.er grado las verán.
- Todo docente (los existentes y los que cree el gestor de accesos) empieza con `grade` en `NULL`. Hasta que declare el grado de su clase en su panel, sus estudiantes **no ven actividades** (el listado sale vacío): es el comportamiento esperado, no un error. Avisa a los docentes de que ese es su primer paso.

**5. Desplegar** el código (sección 7) y comprobar el flujo: un docente declara el grado en su panel y sus estudiantes ven las actividades de ese nivel (sección 9).

**Rollback.** El código se revierte como en la sección 11. Las columnas se pueden **dejar en su sitio**: son inofensivas para el código anterior (tienen valor por defecto o aceptan `NULL` y nadie las lee), así que no hace falta quitarlas. Solo si hubiera una razón para eliminarlas, en la VM-BD y después de revertir el código:

```sql
ALTER TABLE teachers DROP COLUMN grade, DROP COLUMN grade_locked_at;
ALTER TABLE activities DROP COLUMN level, DROP COLUMN is_example;
```

Eso pierde el grado declarado por los docentes y la marca de los ejemplos; restaurar el respaldo (sección 11) además pierde lo escrito desde que se hizo.

### 14.1 Cargar las actividades de ejemplo en producción (acción manual)

Mientras no haya contenido oficial, y para que los estudiantes puedan probar la plataforma, `server/scripts/seed-demo-content.js` puede sembrar actividades de **ejemplo** de los tres niveles (A1.1, A1.2 y A1.3) en los módulos `vocabulary`, `grammar` y `reading`. Todas quedan con `is_example = 1` y el panel del estudiante las marca con la etiqueta "Ejemplo"; no son contenido oficial.

> **Esta carga es una acción MANUAL del líder técnico. No forma parte del despliegue** ni de ningún flujo automático: nada la ejecuta salvo que alguien corra el comando a propósito.

Con `NODE_ENV=production` el script se niega a correr, salvo que el comando incluya el indicador `--allow-production`. Solo ese indicador de la línea de comandos lo habilita: ninguna variable de entorno lo hace. Requiere que la migración de esta sección ya esté aplicada.

**[VM-APP]**

```bash
cd /var/www/englishpanama/api
node scripts/seed-demo-content.js --allow-production
```

- Es **repetible**: si una actividad (módulo, título y nivel) ya existe, no se duplica y solo se agregan sus preguntas si no tenía ninguna.
- Si encuentra una actividad sembrada antes de que existiera `is_example` (mismo módulo, título y nivel), la marca como ejemplo en vez de duplicarla.
- También agrega a `daily_challenges` hasta 7 preguntas de ejemplo (una por posición libre; no pisa posiciones ya ocupadas).
- No crea cuentas.

**Retirar los ejemplos.** Cuando haya contenido oficial, en la **[VM-BD]**:

```bash
# Antes de borrar: cuántos ejemplos hay
sudo mysql englishpanama -e "SELECT level, COUNT(*) FROM activities WHERE is_example = 1 GROUP BY level;"

# Borrarlos
sudo mysql englishpanama -e "DELETE FROM activities WHERE is_example = 1;"
```

> **Advertencia: el borrado es en cascada.** Al borrar una actividad también se borran sus preguntas, **todos los intentos de los estudiantes sobre ella** (y sus respuestas) y los **retos diarios ligados a esas preguntas** (con sus registros de completado). Los estudiantes pierden ese historial y el XP no se recalcula. Haz un respaldo (paso 1) antes de borrar.

`seed-demo-student.js` y `seed-demo-staff.js` **siguen siendo solo de desarrollo**: crean cuentas de demostración y no aceptan `--allow-production`.

## Lista de verificación

- [ ] Verificación previa pegada y revisada (sección 3)
- [ ] Respaldo hecho y verificado, copia fuera de la VM (sección 4)
- [ ] `prod-upgrade-all.sql` copiado a la VM-BD y aplicado (secciones 5.1 y 5.2)
- [ ] Usuario `audit_writer` creado con la IP de la VM-APP (`10.0.0.186`), no con `%` (sección 5.3)
- [ ] Verificaciones 5.4 correctas y **punto de control A** superado
- [ ] `phase3-must-change-password.sql` aplicado en la VM-BD **antes** del despliegue; `SELECT must_change_password, COUNT(*) FROM users GROUP BY must_change_password;` muestra solo `0` (sección 13)
- [ ] `phase4-class-grade.sql` aplicado en la VM-BD **antes** del despliegue; `SHOW COLUMNS FROM teachers LIKE 'grade%'` muestra `grade` y `grade_locked_at`, y `SHOW COLUMNS FROM activities LIKE 'level'` / `'is_example'` muestran las columnas (sección 14)
- [ ] Docentes avisados de que deben declarar el grado de su clase al entrar; ejemplos cargados **a mano** con `node scripts/seed-demo-content.js --allow-production` solo si se decidió (sección 14.1)
- [ ] nginx envía `X-Forwarded-For $remote_addr` (sección 6.1) y `nginx -t` pasa antes de recargar
- [ ] Desde fuera, `http://150.136.50.253:3000` **no** responde (sección 10)
- [ ] `.env` actualizado: `NODE_ENV`, `TRUST_PROXY=true`, `STAFF_*`, `AUDIT_DB_*`; respaldo de `STAFF_MFA_KEY` fuera de la VM (sección 6)
- [ ] PR #8 (MFA docente, que incluye #7) en `develop`; merge `develop` → `main` y Actions en verde (sección 7)
- [ ] **Punto de control B** superado (`pm2` online, `/api/health` OK)
- [ ] Cuentas `access_manager` y `auditor` creadas (sección 8) y primer docente creado (sección 8.1)
- [ ] Verificación funcional (sección 9)
