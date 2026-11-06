-- Fase 6: indice y unicidades que hoy solo se garantizan en los scripts de siembra.
--
-- *** NO APLICAR EN PRODUCCION SIN ANTES CORRER LOS SELECT DE VERIFICACION ***
-- Las tres restricciones UNIQUE fallan si ya existen filas duplicadas. Revisar con:
--
--   SELECT attempt_id, question_id, COUNT(*) AS n FROM attempt_answers
--     GROUP BY attempt_id, question_id HAVING n > 1;
--   SELECT position, COUNT(*) AS n FROM daily_challenges
--     GROUP BY position HAVING n > 1;
--   SELECT module_id, title, level, COUNT(*) AS n FROM activities
--     GROUP BY module_id, title, level HAVING n > 1;
--
-- *** NO HABILITAR uq_activity (module_id, title, level) DESPUES DE LA FASE 5 ***
-- Choca con el flujo de revision de contenido: content.service.revision() copia titulo,
-- modulo y nivel de la actividad publicada, asi que una revision en curso siempre
-- duplicaria esa clave (y aprobar/publicar tambien la rompe). Ademas no se puede crear si
-- ya hay revisiones aprobadas. Las otras dos restricciones si son compatibles.
--
-- El indice de activities.level NO cambia datos y si es seguro: activities se
-- filtra por nivel en activity.service, dailyChallenge.service y teacher.service.
-- Idempotente (comprueba information_schema), valido en MySQL 8 y MariaDB.

SET NAMES utf8mb4;

SET @sql := IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND INDEX_NAME = 'idx_activities_level') = 0,
    'CREATE INDEX idx_activities_level ON activities (level)',
    'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Descomentar SOLO despues de que los SELECT anteriores devuelvan 0 filas.
-- ALTER TABLE attempt_answers
--   ADD UNIQUE KEY uq_attempt_question (attempt_id, question_id);
-- ALTER TABLE daily_challenges
--   ADD UNIQUE KEY uq_daily_position (position);
-- NO descomentar (ver aviso arriba, choca con el flujo de revision de la fase 5):
-- ALTER TABLE activities
--   ADD UNIQUE KEY uq_activity (module_id, title, level);
