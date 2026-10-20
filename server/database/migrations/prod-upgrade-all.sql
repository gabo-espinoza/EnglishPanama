-- English Panama - MIGRACION COMPLETA A PRODUCCION (archivo unico)
--
-- Lleva una base creada con el esquema ANTERIOR (el de `main` antes del backend MVP) al esquema
-- actual de `develop`. Es la concatenacion, sin cambios, de tres archivos del repositorio:
--   1. migrations/prod-upgrade-users.sql   7 columnas nuevas en `users`
--   2. staff.sql                           tablas de personal de gestion
--   3. audit.sql                           tabla de auditoria, en la base `englishpanama_audit`
--
-- Se ejecuta UNA vez en la VM de la base de datos, con el administrador de MySQL:
--   sudo mysql < ~/migracion-produccion.sql
--
-- Es aditiva (no borra ni modifica datos) y repetible (se puede correr dos veces sin error).
-- NO crea el usuario `audit_writer`: eso va aparte, porque lleva clave (ver docs/migraciones-produccion.md).
-- Supone que la base principal se llama `englishpanama`.

SET NAMES utf8mb4;

-- ============================================================
-- 1/3  Columnas nuevas de `users`
-- ============================================================
USE englishpanama;

-- English Panama - Migracion de la tabla `users` para una base creada con el esquema ANTERIOR
-- (el de la rama `main` antes del backend MVP y la seguridad de la fase 2).
--
-- Agrega, en este orden y con el mismo diseno que `schema.sql`:
--   is_active, token_version                    revocacion de sesiones y cuentas suspendidas
--   failed_attempts, locked_until               bloqueo por intentos fallidos (3 intentos / 10 s)
--   mfa_secret_enc, mfa_pending_enc,
--   mfa_pending_expires_at                      segundo factor (TOTP) de estudiantes y docentes
--
-- Es ADITIVA y se puede repetir sin error: antes de cada ALTER se comprueba information_schema
-- (MySQL 8 no admite "ADD COLUMN IF NOT EXISTS"; esa sintaxis solo existe en MariaDB). Las filas
-- que ya existen quedan con is_active = 1, token_version = 0 y sin MFA, asi que nadie pierde el
-- acceso y el codigo anterior sigue funcionando con la base ya migrada.
--
-- Se ejecuta sobre la base principal, con un usuario administrador de MySQL:
--   mysql -u root -p englishpanama < server/database/migrations/prod-upgrade-users.sql
--
-- Reemplaza a phase2-lockout.sql y phase2-platform-mfa.sql para una base existente. Una base NUEVA
-- no necesita migraciones: schema.sql ya trae todas estas columnas.

SET NAMES utf8mb4;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active') = 0,
    'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''Cuenta activa; la revalida requireAuth en cada peticion'' AFTER password_hash',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version') = 0,
    'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''Cambiarla invalida los tokens ya emitidos (revocacion)'' AFTER is_active',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'failed_attempts') = 0,
    'ALTER TABLE users ADD COLUMN failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER token_version',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'locked_until') = 0,
    'ALTER TABLE users ADD COLUMN locked_until DATETIME NULL AFTER failed_attempts',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mfa_secret_enc') = 0,
    'ALTER TABLE users ADD COLUMN mfa_secret_enc VARBINARY(255) NULL COMMENT ''Secreto TOTP activo, cifrado con AES-256-GCM (clave en env). NULL = MFA desactivado'' AFTER locked_until',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mfa_pending_enc') = 0,
    'ALTER TABLE users ADD COLUMN mfa_pending_enc VARBINARY(255) NULL COMMENT ''Secreto TOTP en vinculacion, pendiente de confirmar con un codigo'' AFTER mfa_secret_enc',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mfa_pending_expires_at') = 0,
    'ALTER TABLE users ADD COLUMN mfa_pending_expires_at DATETIME NULL AFTER mfa_pending_enc',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 2/3  Personal de gestion (staff_accounts, staff_change_requests)
-- ============================================================
USE englishpanama;

-- English Panama - Cuentas de gestion (personal) y solicitudes de cambio.
-- Se ejecuta junto con schema.sql sobre la base principal `englishpanama`.
--
-- Los roles de gestion NO usan la tabla `users` (que es solo student/teacher):
-- viven aparte para que un gestor no pueda confundirse con un usuario de la app.
-- Cada cuenta tiene exactamente un rol (separacion de funciones por construccion).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS staff_accounts (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username         VARCHAR(50)  NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    role             ENUM('access_manager','auditor','content_manager',
                          'content_reviewer','game_manager','support',
                          'analyst','moderator') NOT NULL,
    status           ENUM('active','suspended') NOT NULL DEFAULT 'active',
    mfa_secret_enc   VARBINARY(255) NOT NULL COMMENT 'Secreto TOTP cifrado con AES-256-GCM (clave en env)',
    token_version    INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cambiarla revoca los tokens ya emitidos',
    failed_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until     DATETIME NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_staff_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Separacion de funciones: el gestor de accesos solicita, el auditor decide.
CREATE TABLE IF NOT EXISTS staff_change_requests (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_id     INT UNSIGNED NOT NULL,
    action        ENUM('suspend','activate') NOT NULL,
    requested_by  INT UNSIGNED NOT NULL,
    decided_by    INT UNSIGNED NULL,
    status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at    TIMESTAMP NULL,
    CONSTRAINT fk_scr_target FOREIGN KEY (target_id)    REFERENCES staff_accounts(id),
    CONSTRAINT fk_scr_req    FOREIGN KEY (requested_by) REFERENCES staff_accounts(id),
    CONSTRAINT fk_scr_dec    FOREIGN KEY (decided_by)   REFERENCES staff_accounts(id),
    KEY idx_scr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3/3  Base de auditoria (englishpanama_audit.audit_log)
-- ============================================================
CREATE DATABASE IF NOT EXISTS englishpanama_audit CHARACTER SET utf8mb4;
USE englishpanama_audit;

-- English Panama - Base de auditoria (separada de la base principal).
--
-- Se crea la base `englishpanama_audit` y el usuario `audit_writer`, que solo puede
-- INSERT y SELECT sobre audit_log: desde la app nadie puede editar ni borrar el
-- registro. El codigo usa las variables AUDIT_DB_* del .env.
--
-- Ejecutar con un usuario administrador de MySQL (una sola vez, en el servidor):
--
--   CREATE DATABASE IF NOT EXISTS englishpanama_audit CHARACTER SET utf8mb4;
--   CREATE USER IF NOT EXISTS 'audit_writer'@'%' IDENTIFIED BY 'CAMBIAR_ESTA_CLAVE';
--   GRANT INSERT, SELECT ON englishpanama_audit.audit_log TO 'audit_writer'@'%';
--   FLUSH PRIVILEGES;
--
-- (Sin UPDATE, DELETE ni TRUNCATE: el registro es de solo-insercion para la app.)

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    occurred_at DATETIME(3) NOT NULL,
    actor_type  ENUM('staff','teacher','student','system') NOT NULL,
    actor_id    INT UNSIGNED NULL,
    actor_role  VARCHAR(30) NULL,
    action      VARCHAR(60) NOT NULL,
    target      VARCHAR(100) NULL,
    outcome     ENUM('ok','denied','error') NOT NULL,
    ip          VARCHAR(45) NULL,
    prev_hash   CHAR(64) NOT NULL,
    row_hash    CHAR(64) NOT NULL COMMENT 'SHA-256(prev_hash || campos de la fila)',
    KEY idx_audit_time (occurred_at),
    KEY idx_audit_actor (actor_type, actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
