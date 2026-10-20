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
