# Endurecimiento de producción (hallazgos de las Fases 3 y 4 del SSDLC)

Guía para aplicar en las dos VM los arreglos de infraestructura que salieron del inventario de solo lectura del 24/11/2026 (Fase 4, sección 4.11). Cada paso es **independiente**, trae su **verificación** y su **vuelta atrás**. Hazlos de uno en uno y no sigas si una verificación falla.

| Paso | VM | Qué arregla | Riesgo del cambio |
|---|---|---|---|
| 1 | VM-APP | PM2 no vuelve a levantar la API tras un reinicio de la VM | Bajo: no reinicia la API |
| 2 | VM-BD | No hay respaldos programados (y la auditoría no se respaldaba) | Bajo |
| 3 | VM-BD | `ufw` inactivo: MySQL depende solo de la red de Oracle | Medio: un error de reglas corta la conexión de la API |
| 4 | VM-APP | El HTML del cliente sale sin cabeceras de seguridad y `nginx` muestra su versión (D-012 a D-016) | Medio: una CSP mal ajustada puede romper la página |
| 5 | Ambas | `PermitRootLogin without-password` (root puede entrar con llave) | Bajo si se valida con `sshd -t` |
| 6 | VM-APP | `AUTH_RATE_LIMIT_MAX=200` (valor de la demostración) | Bajo; hacerlo **después** de la demo |

Antes de empezar: ten abierta una sesión SSH de respaldo en cada VM (por si un cambio de red o de `sshd` corta la nueva) y confirma que la API responde: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health` en la VM-APP debe dar `200`.

---

## Paso 1. PM2 con arranque automático (VM-APP)

```bash
NB=$(dirname "$(command -v node)")
sudo env PATH="$PATH:$NB" "$(command -v pm2)" startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

**Verificación:** `systemctl is-enabled pm2-ubuntu` → `enabled`; `pm2 list` sigue mostrando `api` en línea; `/api/health` → `200`. (Opcional, en un momento tranquilo: `sudo reboot` y comprobar que la API vuelve sola.)

**Vuelta atrás:** `pm2 unstartup systemd` (imprime el comando con `sudo` a ejecutar).

## Paso 2. Respaldo programado de las dos bases (VM-BD)

El script está en el repositorio: `docs/ops/ep-backup.sh`. Respalda **`englishpanama` y `englishpanama_audit`**, guarda en `/home/ubuntu/backups/auto/`, conserva 14 días y no toca los respaldos manuales existentes.

```bash
# copiar el script a la VM-BD (desde tu equipo, saltando por la VM-APP) y luego en la VM-BD:
sudo install -m 750 -o root -g root ep-backup.sh /usr/local/bin/ep-backup.sh
echo '30 6 * * * root /usr/local/bin/ep-backup.sh' | sudo tee /etc/cron.d/ep-backup
sudo chmod 644 /etc/cron.d/ep-backup
sudo /usr/local/bin/ep-backup.sh        # primera ejecución manual
ls -la /home/ubuntu/backups/auto/
```

`30 6 * * *` es 06:30 UTC = 01:30 hora de Panamá, fuera del horario de clases.

**Prueba de restauración (obligatoria al menos una vez):**

```bash
F=$(ls -t /home/ubuntu/backups/auto/englishpanama-2*.sql.gz | head -1)
sudo mysql -e "CREATE DATABASE ep_restore_test"
zcat "$F" | sudo mysql ep_restore_test
sudo mysql -N -e "SELECT (SELECT COUNT(*) FROM englishpanama.users), (SELECT COUNT(*) FROM ep_restore_test.users), (SELECT COUNT(*) FROM englishpanama.activities), (SELECT COUNT(*) FROM ep_restore_test.activities)"
sudo mysql -e "DROP DATABASE ep_restore_test"
```

Los pares de conteos deben coincidir.

**Pendiente de decisión: copia fuera de la VM.** Hoy los respaldos quedan en la misma VM que la base; si se pierde la VM, se pierden ambos. Opciones: Oracle Object Storage (con `oci` CLI y una política de solo escritura) o copiar periódicamente a la VM-APP. Los respaldos contienen datos de menores (alias y progreso): donde se guarden, deben ir cifrados y con acceso restringido.

**Vuelta atrás:** `sudo rm /etc/cron.d/ep-backup /usr/local/bin/ep-backup.sh`.

## Paso 3. Cortafuegos `ufw` en la VM-BD

MySQL escucha solo en `10.0.0.243:3306` y los usuarios de la aplicación solo aceptan conexiones de `10.0.0.186` (VM-APP). El cortafuegos agrega una segunda barrera por si las reglas de red de Oracle cambian.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow from 10.0.0.186 to any port 3306 proto tcp
sudo ufw --force enable
sudo ufw status verbose
```

**Verificación (desde la VM-APP):** `nc -zv 10.0.0.243 3306` → `succeeded`; un login incorrecto contra la API debe responder `401` (y no `500`), lo que prueba que la API sigue llegando a la base:
`curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"username":"nadie","password":"x"}' http://127.0.0.1:3000/api/auth/login`.

**Vuelta atrás:** `sudo ufw disable`.

## Paso 4. Cabeceras de seguridad del cliente y `server_tokens off` (VM-APP)

Usa el snippet del repositorio `docs/nginx/englishpanama-cabeceras-seguridad.conf` (detalle en `docs/migraciones-produccion.md`, sección 17).

```bash
SITE=$(grep -l "englishpanama/client" /etc/nginx/sites-enabled/* | head -1); echo "$SITE"
sudo cp "$(readlink -f "$SITE")" /home/ubuntu/nginx-sitio.antes-cabeceras.bak
sudo cp /etc/nginx/nginx.conf /home/ubuntu/nginx.conf.antes-cabeceras.bak
sudo install -m 644 englishpanama-cabeceras-seguridad.conf /etc/nginx/snippets/
# en "$SITE", dentro de `location / { ... }` (NO en `location /api/`), agregar:
#     include snippets/englishpanama-cabeceras-seguridad.conf;
# en /etc/nginx/nginx.conf, dentro de `http { }`, descomentar o agregar:
#     server_tokens off;
sudo nginx -t && sudo systemctl reload nginx
```

**Verificación:** `curl -sI http://127.0.0.1/` debe mostrar `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` y `Server: nginx` **sin** versión; `curl -sI http://127.0.0.1/api/health` mantiene las cabeceras de helmet. Luego abrir el sitio en el navegador con la consola abierta y revisar `/`, `/login` y `/staff/login`: **no debe haber errores de CSP** y las fuentes deben verse.

**Vuelta atrás:** restaurar los dos `.bak` y `sudo nginx -t && sudo systemctl reload nginx`.

## Paso 5. Prohibir el acceso SSH de root (ambas VM)

```bash
sudo sshd -T | grep -i permitrootlogin            # hoy: without-password
grep -rn PermitRootLogin /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null
echo 'PermitRootLogin no' | sudo tee /etc/ssh/sshd_config.d/10-no-root.conf
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -i permitrootlogin            # ahora: no
```

Si `sshd_config` define `PermitRootLogin` **antes** del `Include` de `sshd_config.d`, la primera aparición gana: en ese caso cambia esa línea en `sshd_config`. **No cierres** la sesión de respaldo hasta comprobar que puedes abrir una nueva como `ubuntu`.

**Vuelta atrás:** `sudo rm /etc/ssh/sshd_config.d/10-no-root.conf && sudo systemctl reload ssh`.

## Paso 6. Límite de intentos de autenticación de vuelta a 20 (VM-APP, después de la demo)

En `/var/www/englishpanama/api/.env` cambiar `AUTH_RATE_LIMIT_MAX=200` por `AUTH_RATE_LIMIT_MAX=20` y `pm2 restart api`. Verificación: `/api/health` → `200`. Vuelta atrás: volver a 200 y reiniciar.

---

## Lo que esta guía no cubre (decisiones pendientes)

- **HTTPS (D-011):** necesita un nombre de dominio y un certificado (Let's Encrypt con `certbot --nginx`), redirección de 80 a 443 y luego HSTS. Sin dominio propio existen servicios de DNS por IP, pero cambian la URL del sitio.
- **Cifrado en reposo de MySQL:** requiere configurar un keyring y cifrar los tablespaces; planificarlo con respaldo previo.
- **TLS entre la API y MySQL:** el código ya lo admite de forma opcional (`DB_SSL_CA`, ver `docs/backend.md`); activarlo y luego exigirlo con `REQUIRE SSL` en los usuarios.
- **Ubuntu 20.04 en la VM-APP:** fuera del soporte estándar; planificar la migración a una versión con soporte.
- **Reglas de red de Oracle:** revisar en la consola las listas de seguridad y si la VM-BD tiene IP pública.
