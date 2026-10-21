#!/usr/bin/env node
// Siembra el contenido educativo para que las cuentas creadas por
// seed-demo-student.js tengan modulos de aprendizaje reales.
//
//   node scripts/seed-demo-content.js
//
// Crea (de forma idempotente) los tres modulos del proyecto (vocabulary,
// grammar y reading) con actividades y preguntas de demostracion de los tres
// niveles (A1.1, A1.2 y A1.3). Todas se marcan is_example = 1: son ejemplos,
// no contenido oficial. Si un modulo o una actividad (modulo, titulo, nivel)
// ya existe, no lo duplica; solo agrega las preguntas cuando la actividad
// todavia no tiene ninguna.
//
// Las respuestas correctas (correct_answer) se guardan SOLO en el servidor;
// el endpoint GET /activities/:id/questions nunca las devuelve.
//
// Solo para desarrollo/demostracion: con NODE_ENV=production se niega a correr, salvo
// que el comando incluya --allow-production (indicador de linea de comandos; ninguna
// variable de entorno lo habilita).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../src/config/db');

const MODULES = [
    { slug: 'vocabulary', name: 'Vocabulary' },
    { slug: 'grammar', name: 'Grammar' },
    { slug: 'reading', name: 'Reading' }
];

// Las actividades sin `level` son A1.1; todas son de ejemplo (is_example = 1).
const ACTIVITIES = [
    // --- Vocabulary ---
    {
        module: 'vocabulary',
        title: 'Saludos y presentaciones',
        gameType: 'memory',
        sortOrder: 1,
        questions: [
            { topic: 'saludos', prompt: 'Hello', options: ['Hola', 'Adios', 'Gracias', 'Por favor'], correctAnswer: 'Hola' },
            { topic: 'saludos', prompt: 'Good morning', options: ['Buenos dias', 'Buenas noches', 'Buenas tardes', 'Hasta luego'], correctAnswer: 'Buenos dias' },
            { topic: 'saludos', prompt: 'Thank you', options: ['Hola', 'Adios', 'Gracias', 'Por favor'], correctAnswer: 'Gracias' },
            { topic: 'saludos', prompt: 'Goodbye', options: ['Hola', 'Adios', 'Gracias', 'Bienvenido'], correctAnswer: 'Adios' }
        ]
    },
    {
        module: 'vocabulary',
        title: 'Numeros y colores',
        gameType: 'multiple_choice',
        sortOrder: 2,
        questions: [
            { topic: 'numeros', prompt: 'Como se dice "three" en espanol?', options: ['uno', 'dos', 'tres', 'cuatro'], correctAnswer: 'tres' },
            { topic: 'numeros', prompt: 'Which word means "siete"?', options: ['six', 'seven', 'eight', 'nine'], correctAnswer: 'seven' },
            { topic: 'colores', prompt: 'El color de "the sky" es:', options: ['azul', 'rojo', 'verde', 'negro'], correctAnswer: 'azul' },
            { topic: 'colores', prompt: 'El color de "the sun" es:', options: ['blue', 'yellow', 'green', 'black'], correctAnswer: 'yellow' }
        ]
    },

    // --- Grammar ---
    {
        module: 'grammar',
        title: 'Presente simple: verbo to be',
        gameType: 'fill_blank',
        sortOrder: 1,
        questions: [
            { topic: 'verbo to be', prompt: 'I ___ a student.', options: ['am', 'is', 'are'], correctAnswer: 'am' },
            { topic: 'verbo to be', prompt: 'She ___ a teacher.', options: ['am', 'is', 'are'], correctAnswer: 'is' },
            { topic: 'verbo to be', prompt: 'They ___ friends.', options: ['am', 'is', 'are'], correctAnswer: 'are' },
            { topic: 'verbo to be', prompt: 'We ___ in the classroom.', options: ['am', 'is', 'are'], correctAnswer: 'are' }
        ]
    },
    {
        module: 'grammar',
        title: 'Plurales en ingles',
        gameType: 'multiple_choice',
        sortOrder: 2,
        questions: [
            { topic: 'plurales', prompt: 'El plural de "child" es:', options: ['childs', 'children', 'childes'], correctAnswer: 'children' },
            { topic: 'plurales', prompt: 'El plural de "box" es:', options: ['boxs', 'boxes', 'boxen'], correctAnswer: 'boxes' },
            { topic: 'plurales', prompt: 'El plural de "city" es:', options: ['citys', 'cities', 'cityes'], correctAnswer: 'cities' }
        ]
    },
    // --- Reading ---
    {
        module: 'reading',
        title: 'A day at school',
        gameType: 'multiple_choice',
        sortOrder: 1,
        passageText: 'Ana is a student. She goes to school every morning at seven o clock. '
            + 'Her first class is English. She likes her teacher because he is funny. '
            + 'After class, she plays with her friends in the playground.',
        questions: [
            { topic: 'reading: school', prompt: 'What time does Ana go to school?', options: ['Six o clock', 'Seven o clock', 'Eight o clock'], correctAnswer: 'Seven o clock' },
            { topic: 'reading: school', prompt: 'What is her first class?', options: ['Math', 'English', 'Science'], correctAnswer: 'English' },
            { topic: 'reading: school', prompt: 'Why does she like her teacher?', options: ['He is funny', 'He is strict', 'He is tall'], correctAnswer: 'He is funny' }
        ]
    },
    {
        module: 'reading',
        title: 'My family',
        gameType: 'multiple_choice',
        sortOrder: 2,
        passageText: 'My name is Luis. I have two brothers and one sister. '
            + 'My father is a doctor and my mother is a nurse. '
            + 'Every Sunday we have lunch together at my grandmother s house.',
        questions: [
            { topic: 'reading: family', prompt: 'How many brothers does Luis have?', options: ['One', 'Two', 'Three'], correctAnswer: 'Two' },
            { topic: 'reading: family', prompt: 'What is his mother s job?', options: ['Teacher', 'Doctor', 'Nurse'], correctAnswer: 'Nurse' },
            { topic: 'reading: family', prompt: 'Where do they have lunch on Sunday?', options: ['At school', 'At a restaurant', 'At their grandmother s house'], correctAnswer: 'At their grandmother s house' }
        ]
    },

    // --- Ejemplos A1.2 ---
    {
        module: 'vocabulary',
        level: 'A1.2',
        title: '[Ejemplo A1.2] Animals and food',
        gameType: 'multiple_choice',
        sortOrder: 3,
        questions: [
            { topic: 'animals', prompt: 'Which animal says "meow"?', options: ['dog', 'cat', 'cow'], correctAnswer: 'cat' },
            { topic: 'food', prompt: 'Which one is a fruit?', options: ['apple', 'bread', 'rice'], correctAnswer: 'apple' },
            { topic: 'food', prompt: 'I drink ___ in the morning.', options: ['milk', 'chair', 'shoes'], correctAnswer: 'milk' }
        ]
    },
    {
        module: 'grammar',
        level: 'A1.2',
        title: '[Ejemplo A1.2] There is and there are',
        gameType: 'fill_blank',
        sortOrder: 3,
        questions: [
            { topic: 'there is / there are', prompt: 'There ___ a book on the desk.', options: ['is', 'are'], correctAnswer: 'is' },
            { topic: 'there is / there are', prompt: 'There ___ three pencils in my bag.', options: ['is', 'are'], correctAnswer: 'are' },
            { topic: 'there is / there are', prompt: 'There ___ two windows in the room.', options: ['is', 'are'], correctAnswer: 'are' }
        ]
    },
    {
        module: 'reading',
        level: 'A1.2',
        title: '[Ejemplo A1.2] My pet',
        gameType: 'multiple_choice',
        sortOrder: 3,
        passageText: 'I have a small dog. His name is Max. He is brown and white. '
            + 'Max likes to run in the park and eat chicken. '
            + 'At night he sleeps on my bed.',
        questions: [
            { topic: 'reading: pets', prompt: 'What is the dog name?', options: ['Max', 'Tom', 'Rex'], correctAnswer: 'Max' },
            { topic: 'reading: pets', prompt: 'What food does Max like?', options: ['Fish', 'Chicken', 'Cheese'], correctAnswer: 'Chicken' },
            { topic: 'reading: pets', prompt: 'Where does Max sleep?', options: ['On the bed', 'In the park', 'In the kitchen'], correctAnswer: 'On the bed' }
        ]
    },

    // --- Ejemplos A1.3 ---
    {
        module: 'vocabulary',
        level: 'A1.3',
        title: '[Ejemplo A1.3] Daily routines',
        gameType: 'multiple_choice',
        sortOrder: 4,
        questions: [
            { topic: 'routines', prompt: 'I ___ my teeth before bed.', options: ['brush', 'cook', 'drive'], correctAnswer: 'brush' },
            { topic: 'routines', prompt: 'We ___ breakfast at seven o clock.', options: ['have', 'wear', 'open'], correctAnswer: 'have' },
            { topic: 'places', prompt: 'You can borrow books at the ___.', options: ['library', 'bakery', 'stadium'], correctAnswer: 'library' }
        ]
    },
    {
        module: 'grammar',
        level: 'A1.3',
        title: '[Ejemplo A1.3] Simple present and questions',
        gameType: 'fill_blank',
        sortOrder: 4,
        questions: [
            { topic: 'present simple', prompt: 'He ___ football every Saturday.', options: ['play', 'plays', 'playing'], correctAnswer: 'plays' },
            { topic: 'present simple', prompt: '___ you like pizza?', options: ['Do', 'Does', 'Are'], correctAnswer: 'Do' },
            { topic: 'present simple', prompt: 'My sister ___ not eat meat.', options: ['do', 'does', 'is'], correctAnswer: 'does' }
        ]
    },
    {
        module: 'reading',
        level: 'A1.3',
        title: '[Ejemplo A1.3] Weekend plans',
        gameType: 'multiple_choice',
        sortOrder: 4,
        passageText: 'On Saturday morning, Sofia helps her mother at the market. '
            + 'They buy fruit and vegetables for the week. '
            + 'In the afternoon, she visits her cousin and they watch a movie. '
            + 'On Sunday, the whole family goes to the beach because the weather is usually hot.',
        questions: [
            { topic: 'reading: weekend', prompt: 'What does Sofia do on Saturday morning?', options: ['She helps her mother at the market', 'She goes to the beach', 'She does homework'], correctAnswer: 'She helps her mother at the market' },
            { topic: 'reading: weekend', prompt: 'Who does Sofia visit in the afternoon?', options: ['Her cousin', 'Her teacher', 'Her grandmother'], correctAnswer: 'Her cousin' },
            { topic: 'reading: weekend', prompt: 'Why does the family go to the beach on Sunday?', options: ['The weather is usually hot', 'It is a holiday', 'They like fish'], correctAnswer: 'The weather is usually hot' }
        ]
    }
];

async function main() {
    // El permiso para correr en produccion viaja SOLO en la linea de comandos.
    if (process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
        throw new Error(
            'Con NODE_ENV=production este script solo corre si el comando incluye --allow-production ' +
            '(siembra actividades de ejemplo; no es contenido oficial).'
        );
    }

    // 1) Modulos (3 filas fijas del proyecto).
    const moduleIdBySlug = {};
    for (const mod of MODULES) {
        await pool.query(
            'INSERT INTO modules (slug, name) VALUES (?, ?) ' +
            'ON DUPLICATE KEY UPDATE name = VALUES(name)',
            [mod.slug, mod.name]
        );
        const [rows] = await pool.query('SELECT id FROM modules WHERE slug = ?', [mod.slug]);
        moduleIdBySlug[mod.slug] = rows[0].id;
    }

    // 2) Actividades y preguntas (idempotente).
    let activitiesCreated = 0;
    let activitiesKept = 0;
    let questionsCreated = 0;

    for (const act of ACTIVITIES) {
        const moduleId = moduleIdBySlug[act.module];
        const [existing] = await pool.query(
            'SELECT id FROM activities WHERE module_id = ? AND title = ? AND level = ?',
            [moduleId, act.title, act.level || 'A1.1']
        );

        let activityId;
        if (existing.length > 0) {
            activityId = existing[0].id;
            // Bases sembradas antes de is_example: la fila coincide con una de la siembra
            // (modulo, titulo y nivel), asi que es segura de marcar como ejemplo.
            await pool.query('UPDATE activities SET is_example = 1 WHERE id = ?', [activityId]);
            activitiesKept++;
        } else {
            const [res] = await pool.query(
                'INSERT INTO activities (module_id, title, game_type, sort_order, passage_text, level, is_example) ' +
                'VALUES (?, ?, ?, ?, ?, ?, 1)',
                [moduleId, act.title, act.gameType, act.sortOrder, act.passageText || null, act.level || 'A1.1']
            );
            activityId = res.insertId;
            activitiesCreated++;
        }

        const [countRows] = await pool.query(
            'SELECT COUNT(*) AS n FROM questions WHERE activity_id = ?',
            [activityId]
        );

        if (countRows[0].n === 0) {
            for (const q of act.questions) {
                await pool.query(
                    'INSERT INTO questions (activity_id, topic, prompt, options, correct_answer) ' +
                    'VALUES (?, ?, ?, ?, ?)',
                    [activityId, q.topic, q.prompt, JSON.stringify(q.options), JSON.stringify(q.correctAnswer)]
                );
                questionsCreated++;
            }
        }
    }

    // 2b) Reto diario: pool rotativo de preguntas (Modulo 1 - Estudiante).
    // El reto de hoy = pool[(diaDelAnio + offsetDemo) % total].
    const DAILY_PROMPTS = [
        'I ___ a student.',
        'Hello',
        'El plural de "city" es:',
        'What is her first class?',
        'She ___ a teacher.',
        // Una pregunta de los niveles A1.2 y A1.3 (prompts unicos entre niveles).
        'Which animal says "meow"?',
        'He ___ football every Saturday.'
    ];
    let dailyCreated = 0;
    let position = 1;
    for (const prompt of DAILY_PROMPTS) {
        const [qrows] = await pool.query(
            'SELECT id FROM questions WHERE prompt = ? ORDER BY id LIMIT 1',
            [prompt]
        );
        if (qrows.length > 0) {
            const [exists] = await pool.query(
                'SELECT id FROM daily_challenges WHERE position = ?',
                [position]
            );
            if (exists.length === 0) {
                await pool.query(
                    'INSERT INTO daily_challenges (question_id, position) VALUES (?, ?)',
                    [qrows[0].id, position]
                );
                dailyCreated++;
            }
        }
        position++;
    }

    // 3) Resumen real desde la base de datos.
    const [[mods]] = await pool.query('SELECT COUNT(*) AS n FROM modules');
    const [[acts]] = await pool.query('SELECT COUNT(*) AS n FROM activities');
    const [[qs]] = await pool.query('SELECT COUNT(*) AS n FROM questions');
    const [[dcs]] = await pool.query('SELECT COUNT(*) AS n FROM daily_challenges');

    console.log(`Modulos: ${mods.n}  Actividades: ${acts.n}  Preguntas: ${qs.n}  Retos diarios: ${dcs.n}`);
    console.log(`Actividades creadas: ${activitiesCreated}  ya existian: ${activitiesKept}`);
    console.log(`Preguntas creadas: ${questionsCreated}  retos creados: ${dailyCreated}`);
    console.log('Las cuentas estudiante01 y profe.demo ya pueden usar estos modulos.');
}

main()
    .catch((err) => { console.error('Error:', err.message); process.exitCode = 1; })
    .finally(async () => { try { await pool.end(); } catch { /* sin conexiones */ } });
