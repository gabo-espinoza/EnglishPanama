-- Cuarta fase: grado de la clase y nivel de las actividades.
--
-- Anade a `teachers` las columnas grade (3, 4 o 5; NULL = aun no declarado) y
-- grade_locked_at (marca de bloqueo del grado). Anade a `activities` las columnas
-- level (A1.1, A1.2 o A1.3) e is_example. Las actividades existentes quedan en
-- level = 'A1.1' e is_example = 0, y los docentes existentes con grade en NULL.
--
-- Se ejecuta sobre la base principal `englishpanama`, despues de schema.sql:
--   mysql -u <usuario> -p englishpanama < database/migrations/phase4-class-grade.sql
--
-- MySQL 8 no admite "ADD COLUMN IF NOT EXISTS": se comprueba information_schema y
-- solo entonces se ejecuta el ALTER, para que la migracion se pueda repetir sin error.

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND COLUMN_NAME = 'grade') = 0,
    'ALTER TABLE teachers ADD COLUMN grade TINYINT UNSIGNED NULL COMMENT ''Grado de la clase (3, 4 o 5); NULL = aun no declarado''',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND COLUMN_NAME = 'grade_locked_at') = 0,
    'ALTER TABLE teachers ADD COLUMN grade_locked_at TIMESTAMP NULL COMMENT ''Fecha en que el docente declaro el grado''',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'level') = 0,
    'ALTER TABLE activities ADD COLUMN level ENUM(''A1.1'', ''A1.2'', ''A1.3'') NOT NULL DEFAULT ''A1.1'' COMMENT ''Nivel de la actividad; el estudiante solo ve el de su clase''',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'is_example') = 0,
    'ALTER TABLE activities ADD COLUMN is_example TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1 = actividad de ejemplo sembrada, no es contenido oficial''',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
