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
