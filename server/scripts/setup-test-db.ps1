# English Panama - Base MySQL desechable para las pruebas del servidor (Docker), version PowerShell.
#
# Hace los pasos 1 a 4 de docs/guia-pruebas-con-docker.pdf:
#   1. crea el contenedor `ep-test-mysql` (MySQL 8.0, solo visible en 127.0.0.1:3306)
#   2. espera a que acepte conexiones
#   3. crea la base de auditoria y los usuarios app_user / audit_writer
#   4. carga schema.sql, staff.sql, las migraciones y audit.sql
#
# Uso (desde cualquier carpeta):
#   .\server\scripts\setup-test-db.ps1            crea la base (falla si ya existe)
#   .\server\scripts\setup-test-db.ps1 -Reset     la borra y la crea de nuevo, limpia
#   .\server\scripts\setup-test-db.ps1 -Env | Invoke-Expression
#                                                 define las variables de entorno en ESTA terminal
#
# Si PowerShell bloquea el script ("la ejecucion de scripts esta deshabilitada"), usa:
#   powershell -ExecutionPolicy Bypass -File .\server\scripts\setup-test-db.ps1
#
# Las claves de abajo son solo para esta base local y desechable: no reutilices contrasenas reales.
param(
    [switch]$Reset,
    [switch]$Env
)

$ErrorActionPreference = 'Stop'

$Name = 'ep-test-mysql'
$RootPw = 'ep-local-root'
$AppPw = 'ep-local-app'
$AuditPw = 'ep-local-audit'
$Port = 3306

if ($Env) {
    $key = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))"
    @(
        '$env:DB_HOST="127.0.0.1"',
        "`$env:DB_PORT=`"$Port`"",
        '$env:DB_USER="app_user"',
        "`$env:DB_PASSWORD=`"$AppPw`"",
        '$env:DB_NAME="englishpanama"',
        '$env:AUDIT_DB_HOST="127.0.0.1"',
        '$env:AUDIT_DB_USER="audit_writer"',
        "`$env:AUDIT_DB_PASSWORD=`"$AuditPw`"",
        '$env:AUDIT_DB_NAME="englishpanama_audit"',
        '$env:NODE_ENV="test"',
        '$env:JWT_SECRET="local-jwt-secret-local-jwt-secret"',
        '$env:STAFF_JWT_SECRET="local-staff-secret-local-staff-secret"',
        "`$env:STAFF_MFA_KEY=`"$key`""
    )
    return
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'No encuentro docker. Instala y abre Docker Desktop.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker no esta corriendo. Abre Docker Desktop y espera a que arranque.'
}

$DbDir = (Resolve-Path (Join-Path $PSScriptRoot '..\database')).Path
if (-not (Test-Path (Join-Path $DbDir 'schema.sql'))) { throw "No encuentro schema.sql en $DbDir" }

$existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $Name }
if ($existing) {
    if ($Reset) {
        Write-Host "Borrando el contenedor $Name..."
        docker rm -f $Name | Out-Null
    } else {
        throw "Ya existe el contenedor $Name. Usa -Reset para recrearlo desde cero, o 'docker start $Name' para encenderlo."
    }
}

Write-Host '1/4 Creando el contenedor (la primera vez descarga la imagen de MySQL)...'
docker run -d --name $Name -p "127.0.0.1:${Port}:3306" `
    -e "MYSQL_ROOT_PASSWORD=$RootPw" -e MYSQL_DATABASE=englishpanama `
    mysql:8.0 --default-time-zone=+00:00 --character-set-server=utf8mb4 `
    --collation-server=utf8mb4_0900_ai_ci | Out-Null
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el contenedor (puerto $Port ocupado?)." }

Write-Host '2/4 Esperando a MySQL (30 a 60 s la primera vez)...'
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    # Por TCP (-h127.0.0.1): el servidor temporal del arranque inicial solo acepta socket.
    docker exec $Name mysql -uroot "-p$RootPw" -h127.0.0.1 -e 'SELECT 1' *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 3
}
if (-not $ready) { throw "MySQL no respondio a tiempo. Mira: docker logs $Name" }

function Invoke-Sql([string]$Database, [string]$File) {
    $out = docker exec $Name sh -c "mysql -uroot -p$RootPw $Database < $File" 2>&1
    $out | Where-Object { "$_" -notmatch 'Using a password' } | ForEach-Object { Write-Host $_ }
}
function Invoke-Root([string]$Sql) {
    $out = docker exec $Name mysql -uroot "-p$RootPw" -e $Sql 2>&1
    $out | Where-Object { "$_" -notmatch 'Using a password' } | ForEach-Object { Write-Host $_ }
}

Write-Host '3/4 Creando la base de auditoria y los usuarios...'
Invoke-Root "CREATE DATABASE IF NOT EXISTS englishpanama_audit CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY '$AppPw'; GRANT ALL ON englishpanama.* TO 'app_user'@'%'; CREATE USER IF NOT EXISTS 'audit_writer'@'%' IDENTIFIED BY '$AuditPw'; FLUSH PRIVILEGES;"

Write-Host '4/4 Cargando esquema y migraciones...'
docker cp $DbDir "${Name}:/tmp/db"
Invoke-Sql 'englishpanama' '/tmp/db/schema.sql'
Invoke-Sql 'englishpanama' '/tmp/db/staff.sql'
Get-ChildItem (Join-Path $DbDir 'migrations') -Filter 'phase*.sql' | Sort-Object Name | ForEach-Object {
    # phase6-hardening.sql tiene una restriccion que choca con el flujo de revision de contenido.
    if ($_.Name -eq 'phase6-hardening.sql') { return }
    Write-Host "   - $($_.Name)"
    Invoke-Sql 'englishpanama' "/tmp/db/migrations/$($_.Name)"
}
Invoke-Sql 'englishpanama_audit' '/tmp/db/audit.sql'
Invoke-Root "GRANT INSERT, SELECT ON englishpanama_audit.audit_log TO 'audit_writer'@'%'; FLUSH PRIVILEGES;"

Write-Host ''
Write-Host "Listo. Base de pruebas en 127.0.0.1:$Port (contenedor $Name)."
Write-Host 'Siguiente paso, en la terminal donde vayas a probar:'
Write-Host '   .\server\scripts\setup-test-db.ps1 -Env | Invoke-Expression'
Write-Host '   cd server; npm ci; npm test'
