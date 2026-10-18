-- English Panama - Cuentas de gestion (personal) y solicitudes de cambio.
-- Se ejecuta junto con schema.sql sobre la base principal `englishpanama`.
--
-- Los roles de gestion NO usan la tabla `users` (que es solo student/teacher):
-- viven aparte para que un gestor no pueda confundirse con un usuario de la app.
-- Cada cuenta tiene exactamente un rol (separacion de funciones por construccion).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS staff_accounts (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username         VARCHAR(50)  NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    role             ENUM('access_manager','auditor','content_manager',
                          'content_reviewer','game_manager','support',
                          'analyst','moderator') NOT NULL,
    status           ENUM('active','suspended') NOT NULL DEFAULT 'active',
    mfa_secret_enc   VARBINARY(255) NOT NULL COMMENT 'Secreto TOTP cifrado con AES-256-GCM (clave en env)',
    token_version    INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cambiarla revoca los tokens ya emitidos',
    failed_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until     DATETIME NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_staff_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Separacion de funciones: el gestor de accesos solicita, el auditor decide.
CREATE TABLE IF NOT EXISTS staff_change_requests (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_id     INT UNSIGNED NOT NULL,
    action        ENUM('suspend','activate') NOT NULL,
    requested_by  INT UNSIGNED NOT NULL,
    decided_by    INT UNSIGNED NULL,
    status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at    TIMESTAMP NULL,
    CONSTRAINT fk_scr_target FOREIGN KEY (target_id)    REFERENCES staff_accounts(id),
    CONSTRAINT fk_scr_req    FOREIGN KEY (requested_by) REFERENCES staff_accounts(id),
    CONSTRAINT fk_scr_dec    FOREIGN KEY (decided_by)   REFERENCES staff_accounts(id),
    KEY idx_scr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
