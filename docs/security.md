# Seguridad — English Panamá (MVP)

Documento vivo. Describe los principios, los controles ya implementados en el backend
del MVP y las recomendaciones para la siguiente fase. Está pensado también como guía
para la **prueba de seguridad** (ejercicio de pentest) del curso.

## 1. Principios de diseño

- **El servidor es la autoridad.** La corrección de respuestas, el XP y los niveles se
  calculan siempre en el servidor. El cliente no puede "declarar" un puntaje.
- **Mínimo privilegio.** Cada rol recibe solo lo que necesita: `student` juega y ve su
  clase; `teacher` ve solo a sus estudiantes.
- **Zero trust.** Cada petición se autentica y autoriza por separado (no basta con
  "ya haber entrado"): el JWT se verifica en cada endpoint protegido y el rol también.
- **Nunca confiar en el cliente.** Todo dato que llega por el body/params/query se valida.

## 2. Controles implementados (backend MVP)

| Riesgo | Control |
|---|---|
| Inyección SQL | Todas las consultas usan sentencias parametrizadas (`?`) con `mysql2`. Nunca se concatenan strings. |
| Manipulación de puntaje | La corrección y el cálculo de XP ocurren en el servidor; el body solo trae respuestas, no resultados. |
| Fuga de respuestas correctas | `correct_answer` nunca se selecciona en los endpoints públicos; solo se usa internamente al corregir. |
| Fuerza bruta en login/registro | `express-rate-limit`: máximo 20 intentos por 15 minutos por IP (`middleware/rateLimiter.js`). |
| Abuso general de la API | Límite general de 120 peticiones por minuto por IP. |
| Cabeceras inseguras | `helmet` aplica cabeceras de seguridad por defecto. |
| Body malicioso o enorme | `express.json({ limit: '100kb' })` + manejo de JSON inválido (`400`) y body grande (`413`). |
| Fuga de información en errores | Los errores `500` responden con mensaje genérico; la traza se registra solo en el servidor. |
| IDOR (acceder a datos ajenos) | Los endpoints de docente usan el `teacher_id` del token, nunca un id enviado por el cliente. El ranking solo devuelve la clase del estudiante autenticado. |
| Escalada de privilegios (rol) | `requireRole('student' | 'teacher')` protege cada grupo de rutas; el rol viene firmado en el JWT. |
| XSS | El backend solo devuelve JSON; React escapa el texto por defecto. No se renderiza HTML crudo. |
| Datos personales de menores | Los estudiantes se identifican con un alias; el ranking expone solo alias/avatar/XP/nivel. |
| Reutilización de reto diario | Restricción única `(student_id, completed_on)` en la base; el duplicado responde `409`. |
| Tokens falsificados | JWT firmado con `JWT_SECRET`; token inválido o expirado responde `401`. |
| CORS abierto en producción | Se puede restringir con la variable `CORS_ORIGIN` (lista de orígenes permitidos). |
| IP falsificada para evadir límites | `trust proxy` se activa solo con `TRUST_PROXY=true` (cuando hay Nginx delante). |

## 3. Validación de entrada

- `username`: 3–30 caracteres, solo `[A-Za-z0-9_.-]`.
- `password`: mínimo 4, máximo 72 caracteres (bcrypt solo usa 72 bytes).
- `displayName` (docente): máximo 100 caracteres.
- `moduleSlug`: solo `vocabulary`, `grammar` o `reading`.
- `:id` de actividad: se convierte a número; ids inexistentes responden `404`.
- `limit` del panel: se acota entre 1 y 50.
- `answers`: debe ser un arreglo no vacío; ids ajenos a la actividad se ignoran.

## 4. Recomendaciones para la fase de despliegue (infraestructura)

Estas no dependen del código de la app y son clave antes de publicar:

1. **HTTPS obligatorio.** Terminar TLS en Nginx y redirigir todo HTTP a HTTPS. Sin esto,
   el token viaja en claro.
2. **Secreto JWT robusto.** Generar `JWT_SECRET` con al menos 32 bytes aleatorios
   (`openssl rand -hex 32`) y rotarlo si se sospecha filtración. Nunca subirlo al repo.
3. **Usuario de base de datos con permisos mínimos.** El usuario de la app solo debe
   tener `SELECT/INSERT/UPDATE` sobre la base `englishpanama`, no `DROP` ni acceso global.
4. **Base de datos no expuesta a internet.** MySQL debe escuchar solo en la red interna;
   el único puerto público es el 443 del proxy.
5. **Backups automáticos y cifrados** de la base, con prueba de restauración.
6. **`.env` fuera del repositorio** (ya está en `.gitignore`) y con permisos restringidos.
7. **Logs y monitoreo.** Alertas por picos de `401/403/429` y por accesos desde
   ubicaciones u horas inusuales (base para el plan de auditoría del documento de diseño).
8. **Actualizar dependencias** con `npm audit` antes de cada entrega.
9. **Sesiones más cortas para el personal** (el diseño completo pide 15–30 min). En el
   MVP el token dura 7 días; para estudiantes y docentes es aceptable, pero a futuro el
   personal debe usar tokens cortos + verificación en dos pasos.

## 5. Checklist para la prueba de seguridad

Con `DEMO_MODE=false`, `TRUST_PROXY=false` y `CORS_ORIGIN` configurado, verificar:

- [ ] `GET /api/activities/...` sin token → `401`.
- [ ] Token de estudiante en un endpoint de docente → `403`.
- [ ] Alterar el `id` de otro estudiante en el body → no tiene efecto (se usa el del token).
- [ ] Enviar puntaje falso en `POST /attempts` → se ignora; el servidor recalcula.
- [ ] Pedir las preguntas → la respuesta **no** incluye `correct_answer`.
- [ ] `POST /daily-challenge/complete` dos veces el mismo día → la segunda da `409`.
- [ ] `POST /demo/advance-day` con `DEMO_MODE=false` → `403`.
- [ ] Muchos intentos de login seguidos → `429`.
- [ ] SQL injection en `username` (`' OR 1=1 --`) → login falla; no rompe la consulta.
- [ ] JSON gigante o mal formado en el body → `413` / `400`, no `500`.
- [ ] Errores `500` → no revelan la traza.

## 6. Riesgos conocidos y supuestos del MVP

- El reto diario otorga XP al marcarse completado **una vez por día**; no valida la
  respuesta en ese endpoint (el contrato no envía respuesta). Impacto acotado por la
  restricción diaria. A futuro: pedir la respuesta y corregirla en el servidor.
- El MVP tiene solo dos roles (`student`, `teacher`). El modelo ampliado de 8 roles
  de gestión (con auditoría, MFA, separación de funciones) es de una fase posterior y
  está descrito en el documento de diseño del proyecto.
- El token dura 7 días. Es un balance entre comodidad (niños en colegio) y seguridad;
  si preocupa, bajarlo y agregar refresh token.
