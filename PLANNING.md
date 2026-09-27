# English Panamá — Planning base

Proyecto académico. Equipo de 9 personas. Entrega: **principios de diciembre de 2026** (~10 semanas desde el 28 de septiembre).

## 1. Qué es el MVP

Plataforma web para que estudiantes panameños de **primaria y premedia** refuercen inglés con módulos cortos, minijuegos y gamificación. Interfaz muy visual, contenido con contexto panameño (Canal, mercado, Metro, comidas típicas, etc.).

### Incluido en el MVP

- **Módulos:** Vocabulary, Grammar, Reading.
- **Minijuegos:** memoria de palabras, seleccionar respuesta correcta, ordenar oraciones, completar palabras (mínimo 3 de los 4).
- **Gamificación:** puntos (XP), barra de progreso y niveles, reto diario, ranking (solo entre estudiantes de la misma clase, por alias/avatar — nunca nombre real).
- **Estudiante:** registro con alias + contraseña + código del docente, login, jugar, ver progreso.
- **Docente:** login, lista de sus estudiantes con nivel/XP/actividades/promedio por módulo, temas más difíciles.
- **Modo demo:** endpoint para avanzar el reto diario manualmente en la presentación.

### Fuera del MVP (fases futuras)

Listening, Writing, Speaking, prueba inicial de nivel, insignias, rachas diarias, gestión de grupos múltiples por docente, ranking global.

## 2. Stack

- **Frontend:** React + Vite (JavaScript, no TypeScript).
- **Backend:** Node.js + Express, API REST.
- **Base de datos:** MySQL.
- **Auth:** JWT, roles `student` y `teacher`.
- **Hosting:** por definir (idea inicial: dos VMs de Oracle).

Decisiones completas y modelo de datos: ver spec de diseño (pedir a Gabriel si no está aún en el repo).

## 3. Equipo y roles

| Rol | Integrante(s) | Responsabilidad |
|---|---|---|
| Líder técnico | Gabriel | Repo, convenciones, esquema de BD, revisión de todos los PR, integración |
| Backend | Daniel, Carlos, Sebastian | Auth y usuarios · Actividades, corrección, XP y niveles · Ranking, reto diario, endpoints docente y modo demo |
| Frontend | Fernando, Cristian, Heather | Estructura y rutas, login/registro · Componentes de minijuegos · Dashboard estudiante, ranking, reto diario, panel docente |
| Contenido y QA | Nathaniel, Isora | Preguntas en JSON con contexto panameño, seed, assets visuales, pruebas manuales |

Reparto de tareas específico dentro de cada rol: por Issues en este repo.

## 4. Cronograma

| Semana | Fechas | Meta |
|---|---|---|
| 1 | 28 sep | Repo, convenciones, esquema de BD, contrato de API, wireframes, seed de prueba |
| 2-3 | 5–16 oct | Rebanada vertical: registro → login → jugar una actividad → ver resultado |
| 4-5 | 19–30 oct | Corrección en servidor, XP/niveles, los 4 tipos de minijuego, contenido fluyendo |
| 6 | 2–6 nov | Ranking de clase, reto diario, panel docente |
| 7 | 9–13 nov | Temas difíciles, modo demo, integración |
| 8 | 16–20 nov | **Congelamiento de funciones (viernes 20 nov)**, caza de errores |
| 9-10 | 23 nov–4 dic | Pruebas de usuario, despliegue, ensayo de demo, documentación |

## 5. Núcleo protegido y orden de recorte

Si el tiempo aprieta, se recorta en este orden — nunca el núcleo:

1. Temas más difíciles del panel docente.
2. Cuarto tipo de minijuego (quedan 3).
3. Refresco automático del ranking (pasa a botón manual).
4. Reto diario (pasa a ser una actividad más).

**Núcleo protegido:** registro, jugar actividades, XP/niveles, panel docente básico, ranking de clase.

## 6. Flujo de trabajo

- `main` protegida. Una rama por tarea (ver [BRANCHING.md](BRANCHING.md)).
- PR obligatorio, revisión de Gabriel (o revisor suplente) antes de mergear.
- Commits en formato [Conventional Commits](https://www.conventionalcommits.org/).
- Contenido (preguntas, textos) va como JSON en el repo — no requiere tocar código de la app.
