#!/usr/bin/env bash
# English Panama - Base MySQL desechable para las pruebas del servidor (Docker).
#
# Hace los pasos 1 a 4 de docs/guia-pruebas-con-docker.pdf:
#   1. crea el contenedor `ep-test-mysql` (MySQL 8.0, solo visible en 127.0.0.1:3306)
#   2. espera a que acepte conexiones
#   3. crea la base de auditoria y los usuarios app_user / audit_writer
#   4. carga schema.sql, staff.sql, las migraciones y audit.sql
#
# Uso (desde cualquier carpeta; en Windows, desde Git Bash):
#   bash server/scripts/setup-test-db.sh            crea la base (falla si ya existe)
#   bash server/scripts/setup-test-db.sh --reset    la borra y la crea de nuevo, limpia
#   eval "$(bash server/scripts/setup-test-db.sh --env)"
#                                                    define las variables de entorno en ESTA terminal
#
# Las claves de abajo son solo para esta base local y desechable: no reutilices contrasenas reales.
# Es seguro correrlo: solo toca el contenedor `ep-test-mysql` en tu propio equipo.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash: que no reescriba rutas como /tmp/db

NAME=ep-test-mysql
ROOT_PW=ep-local-root
APP_PW=ep-local-app
AUDIT_PW=ep-local-audit
PORT=3306

print_env() {
    cat <<EOF
export DB_HOST=127.0.0.1
export DB_PORT=$PORT
export DB_USER=app_user
export DB_PASSWORD=$APP_PW
export DB_NAME=englishpanama
export AUDIT_DB_HOST=127.0.0.1
export AUDIT_DB_USER=audit_writer
export AUDIT_DB_PASSWORD=$AUDIT_PW
export AUDIT_DB_NAME=englishpanama_audit
export NODE_ENV=test
export JWT_SECRET=local-jwt-secret-local-jwt-secret
export STAFF_JWT_SECRET=local-staff-secret-local-staff-secret
export STAFF_MFA_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")"
EOF
}

if [ "${1:-}" = "--env" ]; then
    print_env
    exit 0
fi

command -v docker >/dev/null 2>&1 || { echo "No encuentro docker. Instala y abre Docker Desktop." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker no esta corriendo. Abre Docker Desktop y espera a que arranque." >&2; exit 1; }

DB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../database" && pwd)"
[ -f "$DB_DIR/schema.sql" ] || { echo "No encuentro schema.sql en $DB_DIR" >&2; exit 1; }

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
    if [ "${1:-}" = "--reset" ]; then
        echo "Borrando el contenedor $NAME..."
        docker rm -f "$NAME" >/dev/null
    else
        echo "Ya existe el contenedor $NAME. Usa --reset para recrearlo desde cero, o 'docker start $NAME' para encenderlo." >&2
        exit 1
    fi
fi

echo "1/4 Creando el contenedor (la primera vez descarga la imagen de MySQL)..."
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3306" \
    -e MYSQL_ROOT_PASSWORD="$ROOT_PW" -e MYSQL_DATABASE=englishpanama \
    mysql:8.0 --default-time-zone=+00:00 --character-set-server=utf8mb4 \
    --collation-server=utf8mb4_0900_ai_ci >/dev/null

echo "2/4 Esperando a MySQL (30 a 60 s la primera vez)..."
ready=0
for _ in $(seq 1 60); do
    # Por TCP (-h127.0.0.1): el servidor temporal del arranque inicial solo acepta socket.
    if docker exec "$NAME" mysql -uroot -p"$ROOT_PW" -h127.0.0.1 -e "SELECT 1" >/dev/null 2>&1; then
        ready=1; break
    fi
    sleep 3
done
[ "$ready" = 1 ] || { echo "MySQL no respondio a tiempo. Mira: docker logs $NAME" >&2; exit 1; }

run_sql() { # $1 = base, $2 = archivo dentro del contenedor
    docker exec "$NAME" sh -c "mysql -uroot -p$ROOT_PW $1 < $2" 2>&1 | grep -v "Using a password" || true
}
mysql_root() {
    docker exec "$NAME" mysql -uroot -p"$ROOT_PW" -e "$1" 2>&1 | grep -v "Using a password" || true
}

echo "3/4 Creando la base de auditoria y los usuarios..."
mysql_root "CREATE DATABASE IF NOT EXISTS englishpanama_audit CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY '$APP_PW'; GRANT ALL ON englishpanama.* TO 'app_user'@'%'; CREATE USER IF NOT EXISTS 'audit_writer'@'%' IDENTIFIED BY '$AUDIT_PW'; FLUSH PRIVILEGES;"

echo "4/4 Cargando esquema y migraciones..."
# Ruta relativa: docker.exe no entiende las rutas /c/... de Git Bash.
( cd "$DB_DIR" && docker cp . "$NAME:/tmp/db" )
run_sql englishpanama /tmp/db/schema.sql
run_sql englishpanama /tmp/db/staff.sql
for f in "$DB_DIR"/migrations/phase*.sql; do
    name="$(basename "$f")"
    # phase6-hardening.sql tiene una restriccion que choca con el flujo de revision de contenido.
    [ "$name" = "phase6-hardening.sql" ] && continue
    echo "   - $name"
    run_sql englishpanama "/tmp/db/migrations/$name"
done
run_sql englishpanama_audit /tmp/db/audit.sql
mysql_root "GRANT INSERT, SELECT ON englishpanama_audit.audit_log TO 'audit_writer'@'%'; FLUSH PRIVILEGES;"

echo
echo "Listo. Base de pruebas en 127.0.0.1:$PORT (contenedor $NAME)."
echo "Siguiente paso, en la terminal donde vayas a probar:"
echo "   eval \"\$(bash server/scripts/setup-test-db.sh --env)\""
echo "   cd server && npm ci && npm test"
