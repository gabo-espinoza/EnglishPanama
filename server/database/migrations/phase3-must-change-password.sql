-- Tercera fase: cambio obligatorio de contrasena en el primer inicio de sesion.
--
-- Anade a `users` la bandera must_change_password. Vale 1 para los docentes recien
-- creados por el gestor de accesos (que reciben una contrasena temporal): no obtienen
-- sesion hasta crear su propia contrasena. Las filas existentes quedan en 0, por lo que
-- nada cambia para las cuentas actuales.
--
-- Se ejecuta sobre la base principal `englishpanama`, despues de schema.sql:
--   mysql -u <usuario> -p englishpanama < database/migrations/phase3-must-change-password.sql
--
-- MySQL 8 no admite "ADD COLUMN IF NOT EXISTS": se comprueba information_schema y
-- solo entonces se ejecuta el ALTER, para que la migracion se pueda repetir sin error.

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password') = 0,
    'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1 = el usuario debe crear su contrasena antes de recibir sesion''',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
