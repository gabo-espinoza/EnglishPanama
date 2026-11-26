-- Fase 7: una pregunta solo puede estar UNA vez en el pool del reto diario.
--
-- Agrega UNIQUE (question_id) a daily_challenges (indice uq_daily_challenges_question).
-- Hasta ahora lo garantizaba solo el codigo (game.service.addDailyChallenge, con una
-- transaccion que bloquea la fila de la pregunta); con el indice lo garantiza tambien la base,
-- aunque alguien inserte filas a mano o desde otro script. El codigo traduce el error de
-- duplicado (ER_DUP_ENTRY) al mismo 409 QUESTION_ALREADY_IN_POOL de siempre.
--
-- *** ANTES DE APLICAR, CORRER ESTA VERIFICACION (debe devolver 0 filas) ***
--
--   SELECT question_id, COUNT(*) AS n, GROUP_CONCAT(id ORDER BY id) AS ids
--     FROM daily_challenges GROUP BY question_id HAVING n > 1;
--
-- Si devuelve filas, la migracion NO crea el indice y termina con un error cuyo texto empieza
-- con "HAY_PREGUNTAS_REPETIDAS_EN_daily_challenges". No borra nada por su cuenta: hay que
-- decidir a mano que fila de cada pregunta se queda (ojo: daily_completions tiene
-- ON DELETE CASCADE hacia daily_challenges, borrar un reto borra sus completados) y volver a
-- correrla. Guia: docs/migraciones-produccion.md, seccion 18.
--
-- Idempotente: si el indice ya existe no hace nada. Valida en MySQL 8 y MariaDB.
-- Vuelta atras: DROP INDEX uq_daily_challenges_question ON daily_challenges;

SET NAMES utf8mb4;

SET @ep_has_index := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daily_challenges'
      AND INDEX_NAME = 'uq_daily_challenges_question');

SET @ep_dups := (
    SELECT COUNT(*) FROM (
        SELECT question_id FROM daily_challenges GROUP BY question_id HAVING COUNT(*) > 1
    ) AS repetidas);

-- Con duplicados se ejecuta, a proposito, una consulta a una tabla que no existe (su nombre es
-- el aviso; maximo 64 caracteres): el cliente mysql se detiene con ese error sin tocar datos.
SET @sql := IF(@ep_has_index > 0,
    'DO 0',
    IF(@ep_dups > 0,
        'SELECT * FROM `HAY_PREGUNTAS_REPETIDAS_EN_daily_challenges_ver_encabezado`',
        'ALTER TABLE daily_challenges ADD UNIQUE KEY uq_daily_challenges_question (question_id)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
