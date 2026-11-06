// Etiquetas, límites y validaciones de la pantalla de Contenido. Los límites y el criterio de
// texto son los de server/src/services/content.service.js (el servidor sigue siendo la autoridad).

export const MODULE_LABELS = { vocabulary: 'Vocabulario', grammar: 'Gramática', reading: 'Lectura' };

export const GAME_LABELS = {
    memory: 'Memoria',
    multiple_choice: 'Opción múltiple',
    sentence_order: 'Ordenar oraciones',
    fill_blank: 'Completar espacios'
};

export const GAME_HINTS = {
    memory: 'Cada pregunta es una pareja: el enunciado y su traducción (la opción correcta).',
    multiple_choice: 'Escribe de 2 a 8 opciones y marca la correcta.',
    sentence_order: 'Escribe las partes de la oración en el orden correcto; el juego las mostrará mezcladas.',
    fill_blank: 'Usa ___ en el enunciado para el espacio y marca la opción que lo completa.'
};

export const LEVELS = ['A1.1', 'A1.2', 'A1.3'];

export const STATUS_MAP = {
    draft: { label: 'Borrador', tone: 'gray' },
    in_review: { label: 'En revisión', tone: 'amber' },
    published: { label: 'Publicada', tone: 'green' },
    archived: { label: 'Archivada', tone: 'blue' }
};

export const REPORT_KIND_LABELS = { error: 'Error', inappropriate: 'Inadecuado' };
export const REPORTER_ROLE_LABELS = { student: 'Estudiante', teacher: 'Docente' };

export const MAX_TITLE = 100;
export const MAX_PASSAGE = 4000;
export const MAX_TOPIC = 50;
export const MAX_PROMPT = 500;
export const MAX_OPTION = 120;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;

// Mismo criterio que cleanText del servidor: sin caracteres de control (incluye saltos de línea) ni < >.
const FORBIDDEN = /[\x00-\x1f\x7f<>]/;

// Devuelve el texto del problema o '' si el valor es válido. `name` va con artículo ("El título").
export function textProblem(value, name, max, required = true) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return required ? `${name} es obligatorio.` : '';
    if (text.length > max) return `${name} no puede pasar de ${max} caracteres.`;
    if (FORBIDDEN.test(text)) return `${name} tiene caracteres no permitidos (<, >, saltos de línea o de control).`;
    return '';
}

// Espejo EXACTO de normalizeAnswer (server/src/utils/answers.js): quita espacios en los extremos y
// pasa a minúsculas; NO quita tildes ("café" y "cafe" son respuestas distintas). Los arreglos se
// unen con "|", como en las respuestas de sentence_order.
export function normalizeText(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(normalizeText).join('|');
    return String(value).trim().toLowerCase();
}

// Errores por campo del formulario de actividad: { title?, passageText? }.
export function activityFormErrors(form) {
    const errors = {};
    const title = textProblem(form.title, 'El título', MAX_TITLE);
    if (title) errors.title = title;
    const passage = textProblem(form.passageText, 'El texto de lectura', MAX_PASSAGE, false);
    if (passage) errors.passageText = passage;
    return errors;
}

// Los campos JSON pueden llegar ya como arreglo o como texto JSON.
export function asArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

// La respuesta correcta llega como texto o, en sentence_order, como arreglo.
export function answerParts(value) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map(String);
        } catch {
            // es texto simple
        }
    }
    return [];
}
