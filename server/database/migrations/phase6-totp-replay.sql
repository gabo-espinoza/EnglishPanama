-- Fase 6: anti-replay del segundo factor (diseno §5.2; pendiente conocido del PR #3).
--
-- Guarda el ultimo contador TOTP (paso de 30 s) aceptado por cada cuenta. El codigo
-- usa un UPDATE condicional atomico en auth.service.js / staffAuth.service.js:
--   ... WHERE id = ? AND (mfa_last_counter IS NULL OR mfa_last_counter < ?)
-- Si dos peticiones llegan con el mismo codigo, solo una ve affectedRows = 1.
--
-- *** APLICAR EN LA VM-BD ANTES DE DESPLEGAR EL CODIGO *** (ver
-- docs/migraciones-produccion.md: la migracion va antes del merge a main).
-- El codigo es tolerante: si la columna aun no existe, degradea a la verificacion
-- TOTP clasica y el login NO se rompe; solo se pierde la proteccion anti-replay.
--
-- Idempotente (comprueba information_schema) y valido en MySQL 8 y MariaDB:
-- "ADD COLUMN IF NOT EXISTS" solo existe en MariaDB.

SET NAMES utf8mb4;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mfa_last_counter') = 0,
    'ALTER TABLE users ADD COLUMN mfa_last_counter BIGINT UNSIGNED NULL DEFAULT NULL',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_accounts' AND COLUMN_NAME = 'mfa_last_counter') = 0,
    'ALTER TABLE staff_accounts ADD COLUMN mfa_last_counter BIGINT UNSIGNED NULL DEFAULT NULL',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
