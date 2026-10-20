# English Panamá — Documento de diseño (MVP)

Fecha: 2026-09-24
Estado: borrador para revisión
Contexto: proyecto académico, equipo de 9 personas, entrega a principios de diciembre de 2026 (~10 semanas).

## 1. Resumen

English Panamá es una plataforma web para que estudiantes panameños de primaria y premedia (aprox. 6 a 14 años) refuercen su inglés mediante actividades cortas y minijuegos, con gamificación y seguimiento por parte del docente.

Este documento define el **MVP** alcanzable en 10 semanas. La idea original (`English_Panama_idea-4.md`) incluye más funciones; las que no entran quedan listadas como fases futuras.

## 2. Alcance del MVP

### Incluido

- **Módulos:** Vocabulary, Grammar, Reading.
- **Minijuegos:** memoria de palabras, seleccionar la traducción/respuesta correcta, ordenar oraciones, completar palabras (mínimo 3 de los 4; ver orden de recorte).
- **Gamificación:** puntos (XP), barra de progreso y niveles; reto diario; ranking por clase.
- **Estudiante:** registro con alias, contraseña y código del docente; login; jugar actividades; ver progreso, nivel, reto diario y ranking.
- **Docente:** login; panel con lista de sus estudiantes (nivel, XP, actividades completadas, promedio por módulo); temas más difíciles.
- **Modo demo:** avance manual del reto diario para la presentación.

### Fuera del MVP (fases futuras)

- Listening (el más barato de agregar después), Writing, Speaking.
- Prueba inicial de nivel (todos empiezan en nivel 1).
- Insignias y rachas diarias.
- Gestión de grupos por parte del docente (el agrupamiento es por código único de docente).
- Ranking global.

### Contexto panameño (diferenciador)

El contenido usa situaciones cotidianas, turismo, comida y cultura de Panamá (por ejemplo: el Canal, el mercado, el Metro, comidas típicas).

## 3. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Público | Primaria y premedia | Definido por el equipo |
| Interfaz | Muy visual: íconos, imágenes, poco texto | Público infantil |
| Stack | React + Vite, Node.js/Express, MySQL | Elegido por el equipo por ser el enfoque más moderno; el riesgo de curva de aprendizaje se mitiga con review de cada merge y contenido como datos |
| Lenguaje | JavaScript (no TypeScript) | Menor fricción con niveles dispares en el equipo |
| Vínculo estudiante-docente | Código único del docente al registrarse | Simple y soporta varios docentes |
| Ranking | Solo entre estudiantes de la misma clase, mostrando alias y avatar | Privacidad de menores; la demo usa una sola clase |
| Corrección de respuestas | En el servidor | Evita trampas en el ranking; lógica de puntos en un único lugar testeable |
| Ranking en vivo | Polling desde el cliente | Simple y suficiente; WebSockets descartado por costo/beneficio |
| Reto diario | Se elige por fecha; el modo demo avanza un offset | El código real funciona por fecha; la demo no requiere trampas |
| Hosting | Pendiente. Idea inicial: dos máquinas virtuales de Oracle | Se decidirá más adelante |

## 4. Arquitectura

```
english-panama/
├── client/   React + Vite: área /student y área /teacher, protegidas por rol
├── server/   Node.js + Express: API REST
└── docs/     specs, contrato de API, decisiones
```

- **Frontend:** React con React Router. Dos áreas (`/student`, `/teacher`) con guardas por rol.
- **Backend:** API REST con capas rutas → controladores → servicios → acceso a datos. La lógica de XP y niveles vive en un servicio, no en las rutas.
- **Base de datos:** MySQL.
- **Autenticación:** JWT con roles `student` y `teacher`. No se almacenan datos personales sensibles; el estudiante usa alias.
- **Contenido:** preguntas almacenadas en BD, cargadas con un script de seed desde archivos JSON. El contenido se escribe sin tocar código de React o Express.

## 5. Modelo de datos

```
users                 id, role (student|teacher), username, password_hash, created_at
teachers              user_id (PK/FK), display_name, class_code (UNIQUE)
students              user_id (PK/FK), teacher_id (FK), alias, avatar, xp

modules               id, slug (vocabulary|grammar|reading), name
activities            id, module_id, title, game_type, sort_order, passage_text (solo Reading)
questions             id, activity_id, topic, prompt, options (JSON), correct_answer (JSON)

attempts              id, student_id, activity_id, score, xp_earned, completed_at
attempt_answers       id, attempt_id, question_id, is_correct

daily_challenges      id, question_id, position
daily_completions     student_id, challenge_id, completed_on  (UNIQUE por estudiante + día)
app_settings          key, value  (offset del modo demo)
```

### Reglas

- **El nivel no se almacena.** Se calcula desde `xp` con una función (referencia: 100 XP por nivel). La barra de progreso usa la misma fórmula.
- **`topic` en cada pregunta** más `attempt_answers` permiten calcular los temas más fallados para el panel docente.
- **`game_type`** indica qué componente de minijuego renderiza el frontend. Agregar un minijuego es agregar un componente y un valor.
- **Reto diario de hoy:** `pool[(díaDelAño + offsetDemo) % total]`.
- **Ranking:** consulta sobre `students.xp` filtrada por `teacher_id`; no tiene tabla propia.

## 6. Flujos principales

1. **Registro:** alias + contraseña + código del docente. El servidor valida el código y crea `users` + `students`.
2. **Login:** devuelve JWT con rol; el cliente redirige a `/student` o `/teacher`.
3. **Jugar una actividad:** el cliente pide las preguntas **sin** la respuesta correcta; el estudiante responde; el cliente envía todas las respuestas; el servidor corrige, calcula puntaje y XP, guarda `attempts` y `attempt_answers`, y devuelve resultado y nivel actualizado.
4. **Reto diario:** consulta el reto de hoy; al completarlo se otorga XP extra una sola vez por día (garantizado por el UNIQUE).
5. **Ranking:** `GET /ranking` devuelve los estudiantes de la misma clase ordenados por XP, exponiendo solo alias y avatar. El cliente refresca por polling.
6. **Panel docente:** `GET /teacher/students` (nivel, XP, actividades completadas, promedio por módulo) y `GET /teacher/difficult-topics` (preguntas/temas más fallados).
7. **Modo demo:** `POST /demo/advance-day`, habilitado solo con una variable de entorno.

## 7. Manejo de errores y validación

- Validar el código de docente al registrar; error claro si no existe.
- Alias único dentro de la misma clase.
- Rechazar envíos de intentos con preguntas que no pertenecen a la actividad.
- Un reto diario no puede completarse dos veces el mismo día.
- Endpoints de docente y de modo demo protegidos por rol y por variable de entorno respectivamente.
- Mensajes de error aptos para niños en la interfaz (breves, sin jerga técnica).

## 8. Pruebas

- **Servicios de puntaje, XP y nivel:** pruebas unitarias (son la lógica más crítica y más fácil de romper).
- **Endpoints principales** (registro, login, envío de intento, ranking): pruebas de integración contra una BD de prueba.
- **Contenido:** validación automática del formato de los JSON de preguntas antes del seed.
- **Manual:** pruebas de usuario con estudiantes o compañeros en las semanas 9 y 10, coordinadas por el equipo de Contenido y QA.

## 9. Equipo y organización

| Equipo | Personas | Responsabilidad |
|---|---|---|
| Líder técnico | 1 | Repo, convenciones, esquema de BD, review de todos los merges, integración |
| Backend | 3 | B1: auth, usuarios, código del docente. B2: actividades, corrección, XP y niveles. B3: ranking, reto diario, endpoints docentes, modo demo |
| Frontend | 3 | F1: estructura, rutas, login/registro, estilos base. F2: componentes de minijuegos. F3: dashboard del estudiante, ranking, reto diario, panel docente |
| Contenido y QA | 2 | Preguntas en JSON con contexto panameño, seed, assets visuales, pruebas manuales y de usuario |

Los integrantes con más experiencia en React deberían asignarse a F1 y F2.

### Flujo de trabajo

1. **Contrato primero:** en la semana 1 se escribe `docs/api.md` con endpoints, requests y responses. El frontend trabaja con mocks y el backend contra el contrato.
2. **Ramas por funcionalidad + PR obligatorio:** `main` protegida, una rama por tarea, aprobación del líder. Commits convencionales.
3. **Contenido como datos:** Contenido y QA no toca código de aplicación.
4. **Rebanadas verticales:** primero una actividad completa de punta a punta, después se multiplica.
5. **Revisor suplente:** un segundo integrante puede aprobar PRs para evitar cuello de botella en el líder.

## 10. Cronograma

| Semana | Fechas (2026) | Meta |
|---|---|---|
| 1 | 28 sep | Repo, convenciones, esquema de BD, `docs/api.md`, wireframes, seed con datos de prueba |
| 2-3 | 5 – 16 oct | Rebanada vertical: registro → login → jugar una actividad de opción múltiple → ver resultado |
| 4-5 | 19 – 30 oct | Corrección en servidor, XP, niveles y barra de progreso; los 4 tipos de minijuego (mínimo 3, ver sección 11); contenido fluyendo |
| 6 | 2 – 6 nov | Ranking de clase, reto diario, panel docente (lista y progreso) |
| 7 | 9 – 13 nov | Temas difíciles, modo demo, integración completa |
| 8 | 16 – 20 nov | **Congelamiento de funciones (viernes 20 nov).** Contenido completo, caza de errores |
| 9-10 | 23 nov – 4 dic | Pruebas de usuario, despliegue, ensayo de la demo, documentación y presentación |

### Volumen de contenido objetivo

3 módulos × 4 actividades × ~8 preguntas ≈ 96 preguntas, más 4 textos de lectura y ~15 retos diarios. El equipo de Contenido empieza en la semana 2.

## 11. Orden de recorte

Si el cronograma se complica, se recorta en este orden:

1. Temas difíciles del panel docente.
2. Cuarto tipo de minijuego (quedarse con 3).
3. Refresco automático del ranking (pasa a botón de actualizar).
4. Reto diario (pasa a ser una actividad más).

**Núcleo protegido:** registro, jugar actividades, XP/niveles, panel docente básico y ranking de clase.

## 12. Riesgos

- **Contrato de API difuso en la semana 1:** genera retrabajo entre 6 desarrolladores. Es la semana más crítica.
- **Curva de React/Node para parte del equipo:** mitigada con review de merges, contenido como datos y asignación de los más expertos a F1 y F2.
- **Cuello de botella en el líder:** mitigado con revisor suplente.
- **Contenido tardío:** mitigado con seed de prueba desde la semana 1.
- **Privacidad de menores:** sin datos personales, alias en lugar de nombres, ranking limitado a la clase.

## 13. Pendientes

- **Hosting y despliegue:** definir más adelante (idea inicial: dos VMs de Oracle; decidir qué corre en cada una y cómo se despliega).
- Definir la fórmula exacta de XP por actividad y por reto diario, y los umbrales de nivel.
- Diseño visual (paleta, avatares, mascota) y wireframes en la semana 1.
