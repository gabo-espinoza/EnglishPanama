-- Segunda fase: segundo factor (TOTP) opcional para las cuentas de plataforma.
--
-- Anade a `users` (estudiantes y docentes) el secreto TOTP cifrado, el secreto en
-- periodo de vinculacion y su caducidad. El MFA queda DESACTIVADO (NULL) hasta que
-- el usuario confirma la vinculacion con un codigo valido desde la API.
--
-- Se ejecuta sobre la base principal `englishpanama`, despues de schema.sql:
--   mysql -u <usuario> -p englishpanama < database/migrations/phase2-platform-mfa.sql
--
-- MySQL 8 no admite "ADD COLUMN IF NOT EXISTS": se comprueba information_schema y
-- solo entonces se ejecuta el ALTER, para que la migracion se pueda repetir sin error.

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mfa_secret_enc') = 0,
    'ALTER TABLE users ADD COLUMN mfa_secret_enc VARBINARY(255) NULL COMMENT ''Secreto TOTP activo, cifrado con AES-256-GCM (clave en env). NULL = MFA desactivado''',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mfa_pending_enc') = 0,
    'ALTER TABLE users ADD COLUMN mfa_pending_enc VARBINARY(255) NULL COMMENT ''Secreto TOTP en vinculacion, pendiente de confirmar con un codigo''',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mfa_pending_expires_at') = 0,
    'ALTER TABLE users ADD COLUMN mfa_pending_expires_at DATETIME NULL',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
