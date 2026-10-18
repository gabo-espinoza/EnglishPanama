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
4. **Variables de entorno** en la VM-APP — paso 6.
5. **Despliegue** (merge `develop` → `main`) — paso 7. *Punto de control B.*
6. **Cuentas de gestión** — paso 8.
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

# ¿nginx reenvía la IP real del cliente? (importa para el límite de intentos, ver sección 10)
grep -rn "proxy_set_header\|X-Forwarded-For" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
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
| nginx | la búsqueda de `proxy_set_header` / `X-Forwarded-For` en `sites-enabled` y `conf.d` **no encontró nada** | Pendiente: hay que ver la configuración efectiva (ver sección 10) |

Notas:

- El conteo de usuarios por rol no mostró filas. En modo no interactivo `mysql` no imprime nada cuando el resultado está vacío, así que la tabla `users` parece estar **vacía**. Confírmalo con `sudo mysql englishpanama -e "SELECT COUNT(*) FROM users;"`. Si está vacía, no hay cuentas que migrar y los docentes empiezan ya con el flujo nuevo.
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
| `NODE_ENV` | `production` | Con esto el servidor **exige** las variables `AUDIT_DB_*` y los scripts de demostración se niegan a correr |
| `TRUST_PROXY` | `true` | **Imprescindible detrás de nginx** (ver sección 10) |
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

## 7. Despliegue

El despliegue se dispara solo al hacer push a `main` (los cambios que solo tocan `docs/**` o `*.md` no lo disparan).

**Antes de empezar**, confirma que ya hiciste los pasos 4, 5 y 6, y que los PR pendientes (`registroEst-login` y `feat/teacher-mfa-enrollment`) ya están en `develop`.

**[TU PC]**

`main` está protegida (según `BRANCHING.md`): no se hace push directo. En GitHub, abre un Pull Request de `develop` hacia `main`, revísalo y mergéalo. Ese merge es lo que dispara el despliegue.

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

> **Nunca** corras `seed-demo-staff.js`, `seed-demo-student.js` ni `seed-demo-content.js` en producción: crean cuentas de demostración. Con `NODE_ENV=production` se niegan a correr.

## 9. Verificación funcional

Desde el navegador, en `http://150.136.50.253`:

1. **Estudiante existente:** inicia sesión con una cuenta real. Debe entrar directo a `/student`.
2. **Docente existente:** al iniciar sesión debe aparecer la pantalla **"Protege tu cuenta"** (vinculación obligatoria del autenticador). Tras escanear el QR y escribir el código, entra a `/teacher`. Los docentes que ya existían **no pierden la cuenta**: solo vinculan el autenticador en su primer ingreso.
3. **Registro de docentes deshabilitado:** `POST /api/auth/register/teacher` responde 403. Las cuentas de docente las crea el gestor de accesos.

**[VM-APP]** — revisar que el registro de auditoría esté funcionando:

```bash
pm2 logs api --lines 50 --nostream | grep -i "auditoria" || echo "sin errores de auditoria"
```

Y con una cuenta `auditor`, `GET /api/staff/audit/verify` debe responder `{ "ok": true, ... }`.

## 10. Riesgos conocidos

**Límite de intentos y nginx (importante).** Los endpoints de autenticación permiten 20 intentos cada 15 minutos **por IP**. Detrás de nginx, sin `TRUST_PROXY=true`, la API ve a todos los usuarios con la IP de nginx: el límite se comparte entre todos y, tras 20 intentos de login de cualquier persona, **nadie más puede entrar** durante 15 minutos. Se comprobó: con `TRUST_PROXY=false` y 22 clientes distintos, el cliente 21 recibe `429`; con `TRUST_PROXY=true` los 22 pasan. Además, nginx debe enviar la cabecera `X-Forwarded-For` (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`); en la verificación previa **no apareció ningún `proxy_set_header`** en `sites-enabled` ni `conf.d`. Falta ver la configuración efectiva de nginx, que puede estar en otro archivo (`sudo nginx -T`), y confirmar que la API se sirve realmente detrás de nginx.

**Bloqueo por intentos.** Hoy es de 3 intentos y 10 segundos, también para el personal de gestión. Es más laxo que lo ideal para cuentas de gestión; está registrado como decisión pendiente en `docs/specs/staff-fase-a.md`.

**Contraseña temporal de los docentes.** Existe `POST /api/auth/change-password`, pero todavía no hay pantalla que la exija en el primer ingreso. Quien crea la cuenta conoce la contraseña temporal hasta que el docente la cambie.

**Sin interfaz para el personal de gestión.** Las acciones de gestión (crear docentes, solicitar suspensiones, consultar la auditoría) son solo API por ahora.

**Comentarios de columnas.** La base de producción conserva los comentarios de columna con acentos del esquema original; el esquema nuevo los trae sin acentos. Es solo cosmético y no afecta nada.

## 11. Rollback

El código se puede revertir sin tocar la base, porque la migración es compatible hacia atrás.

1. **Código — [TU PC]:** deshaz el merge con un Pull Request de reversión hacia `main` (la rama está protegida); al mergearlo, el despliegue automático lo aplica.
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
- El efecto de `TRUST_PROXY` sobre el límite de intentos (sección 10).
- `phase2-lockout.sql` original falla en MySQL 8 con `ERROR 1064`; la versión corregida funciona.

**No probado** (depende de tu entorno real): tu versión exacta de MySQL y su configuración, el estado real de tu tabla `users` y de los usuarios de MySQL, la configuración de nginx y de `pm2`, los permisos de tu cuenta de SSH, y el comportamiento de una app de autenticación real en un celular. Por eso existe la verificación previa de la sección 3: pega su salida y confirmamos el estado antes de tocar nada.

## Lista de verificación

- [ ] Verificación previa pegada y revisada (sección 3)
- [ ] Respaldo hecho y verificado, copia fuera de la VM (sección 4)
- [ ] `prod-upgrade-all.sql` copiado a la VM-BD y aplicado (secciones 5.1 y 5.2)
- [ ] Usuario `audit_writer` creado con la IP de la VM-APP (`10.0.0.186`), no con `%` (sección 5.3)
- [ ] Verificaciones 5.4 correctas y **punto de control A** superado
- [ ] `.env` actualizado: `NODE_ENV`, `TRUST_PROXY=true`, `STAFF_*`, `AUDIT_DB_*`; respaldo de `STAFF_MFA_KEY` fuera de la VM (sección 6)
- [ ] PR pendientes en `develop`; merge `develop` → `main` y Actions en verde (sección 7)
- [ ] **Punto de control B** superado (`pm2` online, `/api/health` OK)
- [ ] Cuentas `access_manager` y `auditor` creadas (sección 8)
- [ ] Verificación funcional (sección 9)
