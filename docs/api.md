# Contrato de API — English Panamá

Base URL en desarrollo local: `http://localhost:3000/api`
Base URL en producción: `http://150.136.50.253/api`

Todas las respuestas son JSON. Los endpoints protegidos requieren el header:

```
Authorization: Bearer <token>
```

## Formato de errores

Cualquier error responde con este formato, con el código HTTP correspondiente (400, 401, 403, 404, 409, 500):

```json
{ "error": "Descripción legible del problema." }
```

---

## Auth (implementado)

### `POST /auth/register/teacher`

**Body:**
```json
{ "username": "string", "password": "string", "displayName": "string" }
```

**Respuesta 201:**
```json
{ "token": "jwt", "classCode": "ABC123" }
```

### `POST /auth/register/student`

**Body:**
```json
{ "username": "string", "password": "string", "classCode": "string" }
```

**Respuesta 201:**
```json
{ "token": "jwt" }
```

### `POST /auth/login`

**Body:**
```json
{ "username": "string", "password": "string" }
```

**Respuesta 200:**
```json
{ "token": "jwt", "role": "student" }
```

---

## Actividades (pendiente — próximo en el plan)

### `GET /activities/:moduleSlug` — Protegido, rol `student`

Lista las actividades de un módulo (`vocabulary` | `grammar` | `reading`).

**Respuesta 200:**
```json
[
  { "id": 1, "title": "Animales", "gameType": "multiple_choice", "sortOrder": 1 }
]
```

### `GET /activities/:id/questions` — Protegido, rol `student`

Devuelve las preguntas de una actividad **sin** `correct_answer` — nunca se manda la respuesta correcta al cliente.

**Respuesta 200:**
```json
{
  "activityId": 5,
  "passageText": null,
  "questions": [
    { "id": 20, "prompt": "How do you say...?", "options": ["a", "b", "c"] }
  ]
}
```

### `POST /activities/:id/attempts` — Protegido, rol `student`

Envía todas las respuestas de una actividad. El servidor corrige, calcula XP y guarda el intento.

**Body:**
```json
{ "answers": [{ "questionId": 20, "answer": "b" }] }
```

**Respuesta 201:**
```json
{ "score": 8, "xpEarned": 40, "totalXp": 140, "level": 2 }
```

---

## Reto diario (pendiente)

### `GET /daily-challenge` — Protegido, rol `student`

Devuelve el reto de hoy (calculado por fecha + offset de modo demo), y si ya fue completado.

### `POST /daily-challenge/complete` — Protegido, rol `student`

Marca el reto de hoy como completado. Falla con 409 si ya se completó en el día.

---

## Ranking (pendiente)

### `GET /ranking` — Protegido, rol `student`

Devuelve el ranking de la clase del estudiante autenticado (por `teacher_id`), ordenado por XP. Solo expone alias/avatar/XP, nunca datos personales.

---

## Panel docente (pendiente)

### `GET /teacher/students` — Protegido, rol `teacher`

Lista los estudiantes de la clase del docente autenticado, con nivel, XP, actividades completadas y promedio por módulo.

### `GET /teacher/difficult-topics` — Protegido, rol `teacher`

Lista los temas (`questions.topic`) con mayor tasa de error entre los estudiantes de la clase.

---

## Modo demo (pendiente)

### `POST /demo/advance-day` — Protegido, requiere `DEMO_MODE=true` en el servidor

Avanza el offset del reto diario en `app_settings`, para la presentación.

---

## Convenciones para agregar un endpoint nuevo

1. Actualizá este archivo **antes** de escribir el código — así el resto del equipo sabe qué esperar sin leer tu implementación.
2. Seguí el patrón de capas: ruta → controlador → servicio → acceso a datos (ver `server/README.md`).
3. Nunca expongas `correct_answer`, `password_hash`, ni datos personales de otros estudiantes.
4. Todo error de validación usa el formato `{ "error": "..." }` con el código HTTP correcto, no 500 genérico.
