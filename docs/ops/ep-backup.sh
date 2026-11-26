#!/bin/sh
# English Panamá - respaldo programado de las dos bases (principal y auditoría).
#
# Se instala en la VM-BD como /usr/local/bin/ep-backup.sh y lo ejecuta root desde
# /etc/cron.d/ep-backup (ver docs/ops/endurecimiento-produccion.md, paso 2).
# root entra a MySQL por auth_socket, así que el script no necesita contraseñas.
#
# - Un archivo .sql.gz por base y por ejecución, en /home/ubuntu/backups/auto/
# - --single-transaction: copia consistente sin bloquear las tablas InnoDB
# - Conserva 14 días; no toca los respaldos manuales que están en /home/ubuntu/backups/
set -eu

DIR=/home/ubuntu/backups/auto
TS=$(date -u +%Y%m%d-%H%M)
umask 077
mkdir -p "$DIR"

for db in englishpanama englishpanama_audit; do
    out="$DIR/$db-$TS.sql.gz"
    mysqldump --single-transaction --routines --triggers "$db" | gzip > "$out.tmp"
    mv "$out.tmp" "$out"
done

# Rotación: solo dentro de auto/, archivos de más de 14 días.
find "$DIR" -maxdepth 1 -name 'englishpanama*-*.sql.gz' -mtime +14 -delete

chown -R ubuntu:ubuntu "$DIR"
