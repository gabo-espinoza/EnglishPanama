-- English Panamá — Esquema de base de datos (MVP)
-- Motor: MySQL 8.x
-- Ejecutar sobre la base `englishpanama` ya creada en la VM de MySQL.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- Usuarios y roles
-- ============================================================

CREATE TABLE users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role          ENUM('student', 'teacher') NOT NULL,
    username      VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE teachers (
    user_id      INT UNSIGNED PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    class_code   VARCHAR(10) NOT NULL,
    UNIQUE KEY uq_teachers_class_code (class_code),
    CONSTRAINT fk_teachers_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE students (
    user_id    INT UNSIGNED PRIMARY KEY,
    teacher_id INT UNSIGNED NOT NULL,
    avatar     VARCHAR(50) NOT NULL DEFAULT 'default',
    xp         INT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_students_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_students_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(user_id) ON DELETE CASCADE,
    KEY idx_students_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Contenido: módulos, actividades, preguntas
-- ============================================================

CREATE TABLE modules (
    id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug ENUM('vocabulary', 'grammar', 'reading') NOT NULL,
    name VARCHAR(50) NOT NULL,
    UNIQUE KEY uq_modules_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE activities (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    module_id     INT UNSIGNED NOT NULL,
    title         VARCHAR(100) NOT NULL,
    game_type     ENUM('memory', 'multiple_choice', 'sentence_order', 'fill_blank') NOT NULL,
    sort_order    INT UNSIGNED NOT NULL DEFAULT 0,
    passage_text  TEXT NULL COMMENT 'Solo se usa en actividades del módulo Reading',
    CONSTRAINT fk_activities_module
        FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    KEY idx_activities_module (module_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE questions (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    activity_id    INT UNSIGNED NOT NULL,
    topic          VARCHAR(50) NOT NULL COMMENT 'Ej: "verbos irregulares" — usado para el reporte de temas difíciles',
    prompt         TEXT NOT NULL,
    options        JSON NOT NULL COMMENT 'Nunca se envía correct_answer al cliente antes de responder',
    correct_answer JSON NOT NULL,
    CONSTRAINT fk_questions_activity
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    KEY idx_questions_activity (activity_id),
    KEY idx_questions_topic (topic)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Intentos y resultados (el nivel y el reporte docente salen de aquí)
-- ============================================================

CREATE TABLE attempts (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id   INT UNSIGNED NOT NULL,
    activity_id  INT UNSIGNED NOT NULL,
    score        INT UNSIGNED NOT NULL,
    xp_earned    INT UNSIGNED NOT NULL,
    completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attempts_student
        FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_attempts_activity
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    KEY idx_attempts_student (student_id),
    KEY idx_attempts_activity (activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE attempt_answers (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    attempt_id  INT UNSIGNED NOT NULL,
    question_id INT UNSIGNED NOT NULL,
    is_correct  BOOLEAN NOT NULL,
    CONSTRAINT fk_attempt_answers_attempt
        FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
    CONSTRAINT fk_attempt_answers_question
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    KEY idx_attempt_answers_attempt (attempt_id),
    KEY idx_attempt_answers_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Reto diario
-- ============================================================

CREATE TABLE daily_challenges (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id INT UNSIGNED NOT NULL,
    position    INT UNSIGNED NOT NULL COMMENT 'Posición en el pool; el reto de hoy = pool[(dayOfYear + offset) % total]',
    CONSTRAINT fk_daily_challenges_question
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE daily_completions (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id   INT UNSIGNED NOT NULL,
    challenge_id INT UNSIGNED NOT NULL,
    completed_on DATE NOT NULL COMMENT 'Fecha real o desplazada por el modo demo',
    CONSTRAINT fk_daily_completions_student
        FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_daily_completions_challenge
        FOREIGN KEY (challenge_id) REFERENCES daily_challenges(id) ON DELETE CASCADE,
    UNIQUE KEY uq_daily_completions_student_day (student_id, completed_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Configuración de la app (offset del modo demo, etc.)
-- ============================================================

CREATE TABLE app_settings (
    setting_key   VARCHAR(50) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_settings (setting_key, setting_value) VALUES ('demo_day_offset', '0');

SET FOREIGN_KEY_CHECKS = 1;
