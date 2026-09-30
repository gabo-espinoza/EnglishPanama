# Convención de ramas

Formato: **`tipo/descripcion-corta`**, todo en minúsculas, en inglés, palabras separadas por guiones. Nada de mayúsculas, espacios ni acentos.

```
tipo/descripcion-corta
```

## Tipos

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidad nueva (un minijuego, un endpoint, una pantalla) |
| `fix` | Corrección de un bug |
| `chore` | Tareas de mantenimiento: dependencias, config, scripts, seed |
| `docs` | Documentación (README, specs, comentarios de API) |
| `refactor` | Cambio de estructura interna sin alterar comportamiento |
| `test` | Agregar o corregir pruebas |
| `content` | Preguntas, textos de lectura, retos diarios, assets (específico de este proyecto) |

## Ejemplos

```
feat/xp-service
feat/vocabulary-memory-game
feat/teacher-dashboard
fix/ranking-duplicate-entries
chore/seed-script
docs/api-contract
refactor/auth-controller
test/xp-level-calculation
content/reading-passages-week4
```

## Reglas

- Una rama por tarea/issue. Si el issue tiene número, se puede agregar al final: `feat/xp-service-12`.
- Rama corta y descriptiva: 2 a 5 palabras. `feat/dashboard` es mejor que `feat/panel-docente-con-progreso-y-temas-dificiles`.
- **Sale siempre de `develop` actualizada, no de `main`.**
- Se borra al mergear el PR (no se acumulan ramas viejas).
- **El Pull Request apunta a `develop`** (es la rama por defecto del repositorio). Gabriel consolida `develop` en `main` una vez verificada la integridad de los cambios — ese merge a `main` es lo que dispara el despliegue automático a producción.

## Commits

Formato [Conventional Commits](https://www.conventionalcommits.org/), en minúsculas, sin punto final:

```
feat: add xp calculation service
fix: prevent duplicate daily challenge completion
content: add week 4 reading passages
docs: update api contract for ranking endpoint
```
