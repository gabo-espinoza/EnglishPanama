-- Fases B y C: ciclo de vida del contenido, reportes y alias ocultos.
-- Origen: diseno del proyecto §4.1 (modulos 6-9), §5.3 y
-- docs/specs/staff-fase-b.md (rama docs/spec-fase-b, propuesta para revision).
--
-- *** APLICAR EN LA VM-BD ANTES DE DESPLEGAR EL CODIGO ***
-- Idempotente: cada cambio se comprueba en information_schema, porque MySQL 8
-- no soporta "ADD COLUMN IF NOT EXISTS" (eso solo existe en MariaDB).
-- El valor por defecto 'published' deja TODO el contenido ya existente publicado:
-- los seeds y las consultas de estudiantes siguen funcionando sin tocar nada.

SET NAMES utf8mb4;

-- 1. Columnas del ciclo de vida en activities.
SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'status') = 0,
    'ALTER TABLE activities ADD COLUMN status ENUM('draft','in_review','published','archived') NOT NULL DEFAULT ''published''',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'author_id') = 0,
    'ALTER TABLE activities ADD COLUMN author_id INT UNSIGNED NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'reviewer_id') = 0,
    'ALTER TABLE activities ADD COLUMN reviewer_id INT UNSIGNED NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'reviewed_at') = 0,
    'ALTER TABLE activities ADD COLUMN reviewed_at TIMESTAMP NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'review_note') = 0,
    'ALTER TABLE activities ADD COLUMN review_note VARCHAR(500) NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'replaces_id') = 0,
    'ALTER TABLE activities ADD COLUMN replaces_id INT UNSIGNED NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'updated_at') = 0,
    'ALTER TABLE activities ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND INDEX_NAME = 'idx_activities_status') = 0,
    'CREATE INDEX idx_activities_status ON activities (status)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Llaves foraneas (el autor y el revisor son cuentas de gestion; la copia
--    de revision apunta a la actividad publicada que reemplazara).
SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND CONSTRAINT_NAME = 'fk_activities_author') = 0,
    'ALTER TABLE activities ADD CONSTRAINT fk_activities_author FOREIGN KEY (author_id) REFERENCES staff_accounts(id)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND CONSTRAINT_NAME = 'fk_activities_reviewer') = 0,
    'ALTER TABLE activities ADD CONSTRAINT fk_activities_reviewer FOREIGN KEY (reviewer_id) REFERENCES staff_accounts(id)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND CONSTRAINT_NAME = 'fk_activities_replaces') = 0,
    'ALTER TABLE activities ADD CONSTRAINT fk_activities_replaces FOREIGN KEY (replaces_id) REFERENCES activities(id) ON DELETE SET NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Reportes de contenido (Fase C, modulo 8 y 9).
CREATE TABLE IF NOT EXISTS content_reports (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind          ENUM('error','inappropriate') NOT NULL,
    activity_id   INT UNSIGNED NULL,
    question_id   INT UNSIGNED NULL,
    reporter_id   INT UNSIGNED NOT NULL,
    reporter_role ENUM('student','teacher') NOT NULL,
    note          VARCHAR(300) NULL,
    status        ENUM('open','escalated','resolved','dismissed') NOT NULL DEFAULT 'open',
    handled_by    INT UNSIGNED NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_reports_status (status),
    KEY idx_reports_kind (kind),
    KEY idx_reports_reporter (reporter_id, status),
    CONSTRAINT fk_reports_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_reports_handler FOREIGN KEY (handled_by) REFERENCES staff_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Marca para ocultar un alias del ranking (game_manager, Fase C).
SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'alias_hidden') = 0,
    'ALTER TABLE students ADD COLUMN alias_hidden TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
