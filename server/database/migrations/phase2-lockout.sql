-- Segunda fase: bloqueo por intentos fallidos (3 intentos / 10 segundos) para las cuentas de
-- plataforma. Agrega `failed_attempts` y `locked_until` a `users`.
--
-- Valida en MySQL 8 y en MariaDB, y se puede repetir sin error (se comprueba information_schema;
-- "ADD COLUMN IF NOT EXISTS" solo existe en MariaDB). Para una base de produccion existente usar
-- prod-upgrade-users.sql, que incluye estas dos columnas y las demas.

SET NAMES utf8mb4;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'failed_attempts') = 0,
    'ALTER TABLE users ADD COLUMN failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'locked_until') = 0,
    'ALTER TABLE users ADD COLUMN locked_until DATETIME NULL',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
