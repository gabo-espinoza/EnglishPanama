# Spec — Cuentas de gestión, Fase B (contenido y flujo de revisión)

Estado: **propuesta para revisión**. Continúa [`staff-fase-a.md`](staff-fase-a.md). Cubre los roles `content_manager` y `content_reviewer`, y deja ajustado el alcance de la Fase C con las decisiones tomadas el 26 de octubre.

## 1. Decisiones ya tomadas

1. **Moderación (Fase C) se incluye, en versión básica:** el `moderator` solo ve los reportes de contenido inadecuado que envían estudiantes y docentes. No hay foro ni comentarios que borrar.
2. **Reportes de preguntas con error (Fase C) se incluyen:** estudiantes y docentes pueden reportar una pregunta; `support` los ve y los escala al gestor de contenido.
3. **El alias ya existe:** el estudiante lo elige al registrarse (`users.username`, 3 a 30 caracteres, sin nombre real) y es lo que muestra el ranking. No se agrega ningún campo. Al `game_manager` solo le falta una marca para ocultar un alias del ranking (Fase C).
4. Una cuenta de gestión tiene un solo rol, y los roles se crean solo desde el servidor (Fase A).

## 2. Qué resuelve la Fase B

Hoy el contenido (módulos, actividades y preguntas) se carga con scripts SQL. La Fase B permite que el equipo de contenido lo cree y lo cambie desde la app, con una regla de control: **lo que escribe el gestor no llega a los estudiantes hasta que otra cuenta lo aprueba.**

| Rol | Puede | No puede |
|---|---|---|
| `content_manager` | Crear actividades y preguntas en borrador, editarlas, enviarlas a revisión, crear una revisión de algo ya publicado, archivar | Publicar. Aprobar o rechazar |
| `content_reviewer` | Ver la cola de revisión con las respuestas correctas, aprobar o rechazar con una nota | Crear o editar contenido |

Los dos comparten el área `content` y el middleware valida área **y** rol, como en la Fase A. Como son roles distintos, el autor nunca puede ser el revisor; aun así el servidor lo comprueba (`reviewer_id <> author_id`) por si algún día se agrega un rol mixto.

### Fuera de alcance

- **Audios y archivos (`/media/upload`):** el diagrama los menciona, pero la app no tiene almacenamiento de archivos. Requiere decidir dónde viven en la VM, tamaños, tipos permitidos y escaneo. Queda para una fase propia.
- **Cursos y lecciones nuevos:** el modelo actual tiene tres módulos fijos (`vocabulary`, `grammar`, `reading`) y tres niveles (`A1.1`, `A1.2`, `A1.3`). La Fase B crea actividades dentro de ellos, no estructura nueva.
- **Tipos de juego nuevos:** se usan los cuatro existentes (`memory`, `multiple_choice`, `sentence_order`, `fill_blank`).

## 3. Ciclo de vida de una actividad

```
            enviar                aprobar
 borrador ----------> en revisión ----------> publicado ---> archivado
    ^                     |                       |
    |      rechazar       |                       | crear revisión
    +---------------------+                       v
    ^                                          borrador (copia, reemplaza a la publicada)
    | retirar de revisión (solo el autor)
```

- Estados: `draft`, `in_review`, `published`, `archived`.
- **Los estudiantes solo ven `published`.** Todas las consultas de actividades, preguntas, reto diario y ranking de contenido deben filtrar por ese estado.
- **Rechazar** devuelve la actividad a `draft` con una nota obligatoria (`review_note`) que el gestor ve al abrirla.
- **Editar algo publicado** no lo toca: `POST /staff/content/activities/:id/revision` crea una copia en `draft` con `replaces_id` apuntando a la original. Al aprobar la copia, en una sola transacción la copia pasa a `published` y la original a `archived`. Así los intentos de los estudiantes (`attempts`) siguen apuntando a la actividad que realmente hicieron, y nunca hay un momento sin versión publicada.
- **Una actividad publicada es inmutable.** Ningún endpoint modifica sus preguntas.
- Las preguntas solo se crean, editan o borran mientras la actividad está en `draft`.
- Una actividad solo puede enviarse a revisión si tiene al menos una pregunta y todas pasan la validación de su tipo de juego.

## 4. Modelo de datos

Migración nueva `server/database/migrations/phase5-content-review.sql`. Sobre la tabla `activities`:

```sql
ALTER TABLE activities
    ADD COLUMN status      ENUM('draft','in_review','published','archived') NOT NULL DEFAULT 'published',
    ADD COLUMN author_id   INT UNSIGNED NULL COMMENT 'staff_accounts.id de quien la creó; NULL = contenido sembrado',
    ADD COLUMN reviewer_id INT UNSIGNED NULL,
    ADD COLUMN reviewed_at TIMESTAMP NULL,
    ADD COLUMN review_note VARCHAR(500) NULL,
    ADD COLUMN replaces_id INT UNSIGNED NULL COMMENT 'Actividad publicada que esta copia reemplazará',
    ADD COLUMN updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ADD CONSTRAINT fk_activities_author   FOREIGN KEY (author_id)   REFERENCES staff_accounts(id),
    ADD CONSTRAINT fk_activities_reviewer FOREIGN KEY (reviewer_id) REFERENCES staff_accounts(id),
    ADD CONSTRAINT fk_activities_replaces FOREIGN KEY (replaces_id) REFERENCES activities(id) ON DELETE SET NULL,
    ADD KEY idx_activities_status (status);
```

- **Valor por defecto `published`:** todo el contenido que ya existe (incluidas las actividades de ejemplo) queda publicado sin tocar nada, y los seeds siguen funcionando. Las actividades creadas desde el panel se insertan con `draft` de forma explícita.
- La migración se escribe con comprobaciones en `information_schema`, como `phase2-lockout.sql` corregido, porque MySQL 8 no soporta `ADD COLUMN IF NOT EXISTS`. Se agrega a `prod-upgrade-all.sql` y a la guía `docs/migraciones-produccion.md`.
- `questions` no cambia: pertenecen a una actividad y heredan su estado.
- `daily_challenges` guarda `question_id`. El pool del reto diario debe filtrar por las preguntas cuya actividad está `published`, para que archivar una actividad no deje un reto roto. Si el pool queda vacío, el reto diario devuelve "sin reto hoy" en lugar de un error.

## 5. Endpoints

Todos bajo `/api/staff/content`, con `requireStaff({ area: 'content', roles: [...] })`. Cada escritura queda en la auditoría con `target = activity:<id>`.

| Método y ruta | Roles | Qué hace |
|---|---|---|
| `GET /activities?status=&module=&level=` | gestor, revisor | Lista (el gestor ve todo; el revisor solo `in_review` y `published`) |
| `GET /activities/:id` | gestor, revisor | Detalle con preguntas **y respuestas correctas** |
| `POST /activities` | gestor | Crea en `draft` (`moduleSlug`, `title`, `gameType`, `level`, `passageText` solo para `reading`) |
| `PUT /activities/:id` | gestor | Edita datos de una actividad en `draft` |
| `POST /activities/:id/questions` | gestor | Agrega pregunta a una actividad en `draft` |
| `PUT /activities/:id/questions/:qid` | gestor | Edita pregunta |
| `DELETE /activities/:id/questions/:qid` | gestor | Borra pregunta |
| `DELETE /activities/:id` | gestor | Borra un borrador que nunca se publicó |
| `POST /activities/:id/submit` | gestor | `draft` → `in_review` |
| `POST /activities/:id/withdraw` | gestor | `in_review` → `draft` |
| `POST /activities/:id/revision` | gestor | Copia una publicada a `draft` con `replaces_id` |
| `POST /activities/:id/archive` | gestor | `published` → `archived` (ver decisión 1 abajo) |
| `POST /activities/:id/approve` | revisor | `in_review` → `published`; si tiene `replaces_id`, archiva la original |
| `POST /activities/:id/reject` | revisor | `in_review` → `draft`, con `note` obligatoria |

Reglas comunes:

- Cada transición verifica el estado actual dentro de una transacción con `SELECT ... FOR UPDATE`; una transición inválida devuelve 409.
- El gestor solo modifica actividades en `draft`. El resto devuelve 409, no 403.
- **Validación por tipo de juego** en el servidor (`options` y `correct_answer` con la forma que usa cada tipo, comparados con `normalizeAnswer`). Las formas exactas se toman de `seed-demo-content.js`, y se documentan en `docs/api.md`.
- Los endpoints de estudiante (`/api/activities/...`) no cambian de contrato, solo filtran por `published`.
- El rate limiter existente aplica; no hay endpoints públicos nuevos.

## 6. Paneles del cliente

- Nuevas secciones en `STAFF_SECTIONS` (`StaffLayout.jsx`): `content` ("Contenido") y `review` ("Revisión de contenido").
- `ROLE_SECTIONS`: `content_manager: ['content']`, `content_reviewer: ['review']`.
- **`/staff/content` (gestor):** lista con filtros por estado, módulo y nivel; las rechazadas muestran la nota del revisor. Editor de actividad con formulario de preguntas adaptado al tipo de juego, vista previa tal como la ve el estudiante, y botones Enviar a revisión, Retirar, Crear revisión y Archivar.
- **`/staff/review` (revisor):** cola de pendientes, vista de la actividad con las respuestas correctas resaltadas, y Aprobar o Rechazar (la nota es obligatoria al rechazar). Si la actividad reemplaza a otra, muestra las dos lado a lado.
- Las sesiones de gestión siguen las reglas de `docs/frontend.md` (en memoria, cierre por recarga y por 5 minutos de inactividad). Un editor con cambios sin guardar se pierde en esos casos, así que el editor avisa en pantalla y guarda el borrador al pulsar Guardar, no automáticamente.

## 7. Auditoría

Acciones nuevas: `content.create`, `content.update`, `content.delete`, `content.question.create|update|delete`, `content.submit`, `content.withdraw`, `content.revision`, `content.archive`, `content.approve`, `content.reject`. Los intentos denegados (rol equivocado, estado inválido) se registran con `outcome = 'denied'`. Nunca se guarda el texto de las preguntas en la auditoría, solo el id.

## 8. Pruebas

- Matriz de roles: cada endpoint contra los 8 roles de gestión, estudiante y docente (solo los previstos entran).
- Ciclo completo: crear, preguntar, enviar, rechazar con nota, corregir, volver a enviar, aprobar.
- Revisión de algo publicado: la original sigue visible hasta la aprobación, después queda archivada, y los intentos anteriores conservan su actividad.
- El estudiante no ve `draft`, `in_review` ni `archived`, ni por listado, ni por `GET /:id/questions`, ni por reto diario.
- Una actividad publicada rechaza cualquier edición.
- El gestor no puede aprobar ni el revisor editar.
- Carrera: dos aprobaciones simultáneas de la misma actividad dan un 200 y un 409.
- Migración sobre una base con datos: todo queda `published`, y se corre dos veces sin error.
- Pruebas de navegador de ambos paneles (crear una actividad de cada tipo de juego, revisar, publicar, y verla como estudiante).

## 9. Fase C ajustada

Con las decisiones de la sección 1, la Fase C queda así.

**Reportes de contenido** (base de `support` y `moderator`), tabla nueva `content_reports`:

| Campo | Uso |
|---|---|
| `kind` | `error` (la pregunta está mal) o `inappropriate` (contenido inadecuado) |
| `activity_id`, `question_id` | Qué se reporta (la pregunta puede ser nula si es de toda la actividad) |
| `reporter_id`, `reporter_role` | Estudiante o docente que reporta. Un reporte por persona y pregunta mientras esté abierto |
| `note` | Texto libre corto (máx. 300 caracteres) |
| `status` | `open`, `escalated`, `resolved`, `dismissed` |
| `handled_by` | Cuenta de gestión que lo atendió |

- **Envío:** `POST /api/reports` para estudiantes y docentes, con un botón "Reportar" en la pantalla de la pregunta. Con límite de frecuencia por cuenta.
- **`support`:** ve los reportes `error` (con alias del reportante y estado de la cuenta, nunca contraseña ni datos personales), puede escalarlos al gestor de contenido o descartarlos. Los escalados aparecen en la lista del `content_manager`, que corrige con una revisión (flujo de la sección 3).
- **`moderator` (básico):** ve los reportes `inappropriate`, con el contenido reportado, y los marca como resueltos o descartados. Si el contenido es de la plataforma, lo escala al gestor de contenido. No tiene acciones sobre usuarios en esta versión.
- **`game_manager`:** reglas de puntos y niveles editables (hoy están fijas en `xp.service`), gestión del pool del reto diario y una marca `alias_hidden` en `students` para ocultar un alias del ranking (el ranking mostraría "Jugador oculto" y conservaría la posición).

## 10. Decisiones abiertas

1. **Archivar.** Se propone que el gestor archive directamente, con auditoría, porque solo retira contenido (no publica nada nuevo) y se puede revertir creando una revisión. La alternativa es exigir aprobación del revisor, que es más estricta y añade un estado.
2. **Quién puede editar un borrador.** Se propone que cualquier `content_manager` edite cualquier borrador (hay pocos gestores), registrando `author_id` solo de quien lo creó. La alternativa es que solo el autor lo edite.
3. **Orden.** Se propone implementar la Fase B primero (servidor, luego los dos paneles) y la Fase C después, en PR separados.
