import { FIELD, Field } from '../ui';
import { GAME_LABELS, LEVELS, MAX_PASSAGE, MAX_TITLE, MODULE_LABELS } from './constants';

// Campos de una actividad (título, módulo, tipo de juego, nivel y texto de lectura).
// Se usa al crear y al editar un borrador. `form` y `onChange(campo, valor)` los maneja quien lo usa.
export default function ActivityFields({ idPrefix, form, errors = {}, disabled = false, onChange }) {
    const showPassage = form.moduleSlug === 'reading' || Boolean(form.passageText);
    const describedBy = (name, helpId) => (errors[name] ? `${helpId} ${idPrefix}-${name}-error` : helpId);
    const fieldError = (name) =>
        errors[name] ? (
            <p id={`${idPrefix}-${name}-error`} role="alert" className="mt-1 text-xs font-bold text-red-600">{errors[name]}</p>
        ) : null;

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
                <Field id={`${idPrefix}-title`} label="Título" hint={`Hasta ${MAX_TITLE} caracteres.`}>
                    <input
                        id={`${idPrefix}-title`}
                        type="text"
                        className={FIELD}
                        value={form.title}
                        maxLength={MAX_TITLE}
                        disabled={disabled}
                        aria-invalid={errors.title ? 'true' : undefined}
                        aria-describedby={describedBy('title', `${idPrefix}-title-help`)}
                        onChange={(e) => onChange('title', e.target.value)}
                    />
                </Field>
                {fieldError('title')}
            </div>
            <Field id={`${idPrefix}-module`} label="Módulo">
                <select
                    id={`${idPrefix}-module`}
                    className={FIELD}
                    value={form.moduleSlug}
                    disabled={disabled}
                    onChange={(e) => onChange('moduleSlug', e.target.value)}
                >
                    {Object.entries(MODULE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </Field>
            <Field id={`${idPrefix}-game`} label="Tipo de juego">
                <select
                    id={`${idPrefix}-game`}
                    className={FIELD}
                    value={form.gameType}
                    disabled={disabled}
                    onChange={(e) => onChange('gameType', e.target.value)}
                >
                    {Object.entries(GAME_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </Field>
            <Field id={`${idPrefix}-level`} label="Nivel">
                <select
                    id={`${idPrefix}-level`}
                    className={FIELD}
                    value={form.level}
                    disabled={disabled}
                    onChange={(e) => onChange('level', e.target.value)}
                >
                    {LEVELS.map((level) => (
                        <option key={level} value={level}>{level}</option>
                    ))}
                </select>
            </Field>
            {showPassage && (
                <div className="sm:col-span-2">
                    <Field
                        id={`${idPrefix}-passage`}
                        label="Texto de lectura (opcional)"
                        hint={`Hasta ${MAX_PASSAGE} caracteres, en un solo párrafo: el servidor no admite saltos de línea ni los signos < y >. (${form.passageText.length}/${MAX_PASSAGE})`}
                    >
                        <textarea
                            id={`${idPrefix}-passage`}
                            rows={5}
                            className={FIELD}
                            value={form.passageText}
                            maxLength={MAX_PASSAGE}
                            disabled={disabled}
                            aria-invalid={errors.passageText ? 'true' : undefined}
                            aria-describedby={describedBy('passageText', `${idPrefix}-passage-help`)}
                            onChange={(e) => onChange('passageText', e.target.value)}
                        />
                    </Field>
                    {fieldError('passageText')}
                </div>
            )}
        </div>
    );
}
