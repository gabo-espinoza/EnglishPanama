import { useEffect, useRef, useState } from 'react';
import { BTN_PRIMARY, BTN_SECONDARY, FIELD, Field, LABEL } from '../ui';
import {
    GAME_HINTS,
    MAX_OPTION,
    MAX_OPTIONS,
    MAX_PROMPT,
    MAX_TOPIC,
    MIN_OPTIONS,
    answerParts,
    asArray,
    normalizeText,
    textProblem
} from './constants';

// El servidor valida con mensajes por campo ("El tema...", "El enunciado...", "La opcion...",
// "La respuesta..."): se usa el comienzo para mostrar el error junto al campo que corresponde.
function fieldForServerMessage(message) {
    if (/^El tema/i.test(message)) return 'topic';
    if (/^El enunciado/i.test(message)) return 'prompt';
    if (/^Las? opcion/i.test(message)) return 'options';
    if (/^La respuesta/i.test(message)) return 'answer';
    return 'form';
}

function initialOptions(gameType, question, nextKey) {
    let texts = [];
    if (question) {
        texts = gameType === 'sentence_order' && answerParts(question.correctAnswer).length >= 2
            ? answerParts(question.correctAnswer)
            : asArray(question.options).map(String);
    }
    while (texts.length < MIN_OPTIONS) texts.push('');
    return texts.map((text) => ({ key: nextKey(), text }));
}

function initialCorrect(options, question) {
    if (!question || Array.isArray(question.correctAnswer) || question.correctAnswer == null) return -1;
    const target = normalizeText(question.correctAnswer);
    return options.findIndex((o) => normalizeText(o.text) === target);
}

// Formulario de una pregunta (alta o edición) con la forma exacta que valida el servidor:
// { topic, prompt, options[2..8], correctAnswer }. En sentence_order, las opciones son las partes
// de la oración en el orden correcto y correctAnswer repite ese orden.
// `onSave(payload)` devuelve '' si salió bien o el mensaje de error del servidor.
export default function QuestionForm({ idPrefix, gameType, question, busy, onSave, onCancel }) {
    const keyCounter = useRef(0);
    const nextKey = () => {
        keyCounter.current += 1;
        return keyCounter.current;
    };
    const isOrder = gameType === 'sentence_order';
    const [topic, setTopic] = useState(question ? question.topic : '');
    const [prompt, setPrompt] = useState(question ? question.prompt : '');
    const [options, setOptions] = useState(() => initialOptions(gameType, question, nextKey));
    const [correct, setCorrect] = useState(() => initialCorrect(options, question));
    const [errors, setErrors] = useState({});
    const topicRef = useRef(null);

    useEffect(() => {
        if (topicRef.current) topicRef.current.focus();
    }, []);

    function setOptionText(key, text) {
        setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, text } : o)));
    }

    function addOption() {
        setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, { key: nextKey(), text: '' }]));
    }

    function removeOption(index) {
        if (options.length <= MIN_OPTIONS) return;
        setOptions((prev) => prev.filter((_, i) => i !== index));
        setCorrect((prev) => (prev === index ? -1 : prev > index ? prev - 1 : prev));
    }

    function moveOption(index, delta) {
        const target = index + delta;
        if (target < 0 || target >= options.length) return;
        setOptions((prev) => {
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    function validate() {
        const found = {};
        const topicProblem = textProblem(topic, 'El tema', MAX_TOPIC);
        if (topicProblem) found.topic = topicProblem;
        const promptProblem = textProblem(prompt, 'El enunciado', MAX_PROMPT);
        if (promptProblem) found.prompt = promptProblem;
        const optionProblem = options
            .map((o, i) => textProblem(o.text, `La opción ${i + 1}`, MAX_OPTION))
            .find(Boolean);
        if (optionProblem) {
            found.options = optionProblem;
        } else if (!isOrder) {
            const normalized = options.map((o) => normalizeText(o.text));
            if (new Set(normalized).size !== normalized.length) {
                found.options = 'Las opciones no pueden repetirse (se comparan sin distinguir mayúsculas ni espacios en los extremos).';
            }
        }
        if (!isOrder && correct < 0) found.answer = 'Marca cuál es la respuesta correcta.';
        return found;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (busy) return;
        const found = validate();
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        const texts = options.map((o) => o.text.trim());
        const payload = {
            topic: topic.trim(),
            prompt: prompt.trim(),
            options: texts,
            correctAnswer: isOrder ? texts : texts[correct]
        };
        const message = await onSave(payload);
        if (message) setErrors({ [fieldForServerMessage(message)]: message });
    }

    const err = (name) =>
        errors[name] ? (
            <p id={`${idPrefix}-${name}-error`} role="alert" className="mt-1 text-xs font-bold text-red-600">{errors[name]}</p>
        ) : null;

    return (
        <form onSubmit={handleSubmit} noValidate aria-label={question ? 'Editar pregunta' : 'Agregar pregunta'} className="space-y-4 rounded-2xl border-2 border-brand-100 bg-gray-50 p-4">
            <p className="text-sm text-gray-500">{GAME_HINTS[gameType]}</p>

            <div>
                <Field id={`${idPrefix}-topic`} label="Tema" hint={`Hasta ${MAX_TOPIC} caracteres.`}>
                    <input
                        id={`${idPrefix}-topic`}
                        ref={topicRef}
                        type="text"
                        className={FIELD}
                        value={topic}
                        maxLength={MAX_TOPIC}
                        disabled={busy}
                        aria-invalid={errors.topic ? 'true' : undefined}
                        aria-describedby={`${idPrefix}-topic-help${errors.topic ? ` ${idPrefix}-topic-error` : ''}`}
                        onChange={(e) => setTopic(e.target.value)}
                    />
                </Field>
                {err('topic')}
            </div>

            <div>
                <Field id={`${idPrefix}-prompt`} label="Enunciado" hint={`Hasta ${MAX_PROMPT} caracteres, en una sola línea.`}>
                    <input
                        id={`${idPrefix}-prompt`}
                        type="text"
                        className={FIELD}
                        value={prompt}
                        maxLength={MAX_PROMPT}
                        disabled={busy}
                        aria-invalid={errors.prompt ? 'true' : undefined}
                        aria-describedby={`${idPrefix}-prompt-help${errors.prompt ? ` ${idPrefix}-prompt-error` : ''}`}
                        onChange={(e) => setPrompt(e.target.value)}
                    />
                </Field>
                {err('prompt')}
            </div>

            <fieldset className="space-y-2" disabled={busy}>
                <legend className={LABEL}>
                    {isOrder ? `Partes de la oración, en el orden correcto (${MIN_OPTIONS} a ${MAX_OPTIONS})` : `Opciones (${MIN_OPTIONS} a ${MAX_OPTIONS})`}
                </legend>
                {options.map((option, index) => (
                    <div key={option.key} className="flex flex-wrap items-center gap-2">
                        {isOrder ? (
                            <span className="w-6 text-center text-sm font-bold text-gray-500" aria-hidden="true">{index + 1}</span>
                        ) : (
                            <input
                                type="radio"
                                name={`${idPrefix}-correct`}
                                checked={correct === index}
                                onChange={() => setCorrect(index)}
                                aria-label={`Marcar la opción ${index + 1} como la respuesta correcta`}
                                className="h-5 w-5 accent-brand-600"
                            />
                        )}
                        <input
                            type="text"
                            className={`${FIELD} min-w-0 flex-1`}
                            value={option.text}
                            maxLength={MAX_OPTION}
                            aria-label={isOrder ? `Parte ${index + 1}` : `Opción ${index + 1}`}
                            aria-invalid={errors.options ? 'true' : undefined}
                            aria-describedby={errors.options ? `${idPrefix}-options-error` : undefined}
                            onChange={(e) => setOptionText(option.key, e.target.value)}
                        />
                        {!isOrder && correct === index && <span className="text-xs font-bold text-green-700">Correcta</span>}
                        {isOrder && (
                            <>
                                <button type="button" className={BTN_SECONDARY} disabled={index === 0} onClick={() => moveOption(index, -1)} aria-label={`Subir la parte ${index + 1}`}>↑</button>
                                <button type="button" className={BTN_SECONDARY} disabled={index === options.length - 1} onClick={() => moveOption(index, 1)} aria-label={`Bajar la parte ${index + 1}`}>↓</button>
                            </>
                        )}
                        <button type="button" className={BTN_SECONDARY} disabled={options.length <= MIN_OPTIONS} onClick={() => removeOption(index)} aria-label={`Quitar ${isOrder ? 'la parte' : 'la opción'} ${index + 1}`}>
                            Quitar
                        </button>
                    </div>
                ))}
                {err('options')}
                {err('answer')}
                <button type="button" className={BTN_SECONDARY} disabled={options.length >= MAX_OPTIONS} onClick={addOption}>
                    {isOrder ? 'Agregar parte' : 'Agregar opción'}
                </button>
            </fieldset>

            {errors.form && <p role="alert" className="text-sm font-bold text-red-700">{errors.form}</p>}

            <div className="flex flex-wrap gap-2">
                <button type="submit" className={BTN_PRIMARY} disabled={busy}>
                    {busy ? 'Guardando...' : question ? 'Guardar pregunta' : 'Agregar pregunta'}
                </button>
                <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={onCancel}>Cancelar</button>
            </div>
        </form>
    );
}
