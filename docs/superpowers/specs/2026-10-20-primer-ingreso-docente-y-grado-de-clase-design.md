# Primer ingreso del docente y grado de la clase: diseño

Fecha: 2026-10-20. Estado: borrador para aprobación.

## Intención

Hoy un docente recibe del personal de gestión una contraseña temporal, entra, vincula el MFA y aterriza en una página casi vacía ("Panel docente. Pendiente…"). Esto resuelve dos huecos de ese recorrido:

1. La contraseña temporal sigue valiendo para siempre. El docente debe cambiarla en su primer ingreso, antes de cualquier otra cosa. (Hallazgo 4 de la revisión.)
2. El docente no ve su código de clase ni puede declarar para qué grado es su clase, y los estudiantes ven el mismo contenido sin importar el nivel de inglés que les corresponde.

El motivo de fondo: la plataforma debe ceñirse al plan de inglés del Ministerio de Educación de Panamá (MEDUCA), cuyos niveles dependen del grado escolar, y el MVP debe poder mostrarse funcionando (el docente elige el grado y el estudiante ve el cambio) aunque aún no haya contenido real.

## Documento en cuatro piezas

Se construyen en este orden, cada una en su propio PR:

| # | Pieza | Detalle en este documento |
|---|---|---|
| 1 | Cambio obligatorio de la contraseña temporal | Completo |
| 2 | Grado de la clase, bloqueo, panel docente y vista del estudiante | Completo |
| 3 | Desbloqueo de módulos por el docente | Solo dirección |
| 4 | Cierre del año escolar | Solo dirección |

Las piezas 3 y 4 se detallan en su propio ciclo de diseño. Aquí solo se fija lo ya decidido para que 1 y 2 no lo impidan.

## Alcance de niveles (decisión del equipo)

Referencia oficial: tabla "Secuencia para los Estándares Generales" del plan de inglés del MEDUCA.

| Grado | Nivel MEDUCA | Bloque |
|---|---|---|
| Pre-K a 2.º | Pre A1.1 a Pre A1.4 | Fundacional (fuera del MVP) |
| 3.º | A1.1 | Inicial |
| 4.º | A1.2 | Inicial |
| 5.º | A1.3 | Inicial |

El MVP cubre **solo 3.º, 4.º y 5.º (A1.1, A1.2, A1.3)** y se llenan los tres con contenido.

Justificación (para el documento de entrega): se prioriza a estudiantes con mayor madurez para manejar la plataforma, y se cubre un bloque completo y coherente del plan del ministerio (el Nivel Inicial). Pre-K a 2.º quedan fuera porque son niños muy pequeños para usar una plataforma así. A2 y la premedia quedan para después, y se retoman solo si sobra tiempo antes del MVP.

La tabla del MEDUCA llega únicamente hasta 5.º grado y no contiene A2. Cómo se asigna A2 a los grados queda pendiente de la parte del plan que aún no se tiene.

## Metas, no metas y antimetas

Metas
- La contraseña temporal deja de servir en cuanto el docente crea la suya, y el servidor lo exige, no solo la interfaz.
- El docente ve su código de clase y declara el grado una sola vez, con un aviso claro y una confirmación.
- El estudiante ve solo actividades del nivel de su clase.
- En una demostración se ve el cambio de nivel de punta a punta, con datos de ejemplo si no hay contenido real.

No metas (fuera del MVP)
- A2, Pre-K a 2.º y la premedia.
- Más de una clase por docente.
- Vincular a un estudiante archivado a un código de clase nuevo en el año siguiente (queda documentado, no construido).
- Cierre automático por fecha.
- Las 5 habilidades del MEDUCA (comprensión oral, lectura, expresión oral, escritura y mediación) como estructura de contenido. Nuestros módulos siguen siendo Vocabulary, Grammar y Reading.
- Autoservicio de recuperación de contraseña.

Antimetas (sería un fracaso aunque "funcione")
- Un docente que cambia el grado por un clic accidental.
- Que un token restringido (cambio de contraseña) abra cualquier otra ruta.
- Que el estudiante vea contenido de otro nivel porque el filtro solo está en el cliente.
- Borrar datos de menores en el cierre de año.

## Restricciones

- Todo texto del proyecto (interfaz, errores, comentarios, documentos, commits) en español latinoamericano neutro, con "tú", sin voseo ni regionalismos. El público es panameño.
- Las migraciones son manuales y se aplican en producción antes de desplegar el código. Cada pieza con cambios de esquema trae su archivo de migración incremental en `server/database/migrations/`, compatible hacia atrás, y se documenta en `docs/migraciones-produccion.md`.
- Nunca se usa la base de producción para desarrollo ni pruebas.
- Los secretos (`STAFF_MFA_KEY`, contraseñas, códigos TOTP, enlaces otpauth) no se imprimen ni se confirman en el repositorio.
- Las pruebas del servidor que necesitan MySQL no se pueden correr en la máquina de desarrollo del líder. Las pruebas nuevas que no necesiten base de datos deben poder correr sin ella.
- Commits en formato convencional, sin atribución de IA.
- Fuera de este trabajo, y a hacer después: el hallazgo 5 (tipografías autoalojadas en vez de Google Fonts).

## Pieza 1: cambio obligatorio de la contraseña temporal

### Recorrido

Docente con cuenta nueva: contraseña temporal → pantalla "Crea tu contraseña" (campos "Contraseña nueva" y "Repetir contraseña") → vinculación del MFA (pantalla del QR, ya existe) → sesión → panel docente.

### Decisiones

- Nueva columna `users.must_change_password TINYINT(1) NOT NULL DEFAULT 0`. La crea en `1` la creación de docentes del personal de gestión (`createTeacher`). Las cuentas existentes quedan en `0`.
- Si la contraseña temporal es correcta y la bandera está en `1`, el inicio de sesión no emite sesión. Responde `{ passwordChangeRequired: true, passwordToken }`. Esta comprobación va después de validar la contraseña y antes de la rama del MFA.
- `passwordToken` es un token restringido, del mismo estilo que `mfa_enroll`, con tipo propio (`pwd_change`) y vida de 15 minutos. Solo lo acepta el nuevo endpoint `POST /api/auth/set-initial-password`.
- Ese endpoint recibe la contraseña nueva y su repetición. Valida con la misma política de contraseñas que ya usa el cambio de contraseña. Rechaza una contraseña igual a la temporal. No pide la contraseña actual, porque el token prueba que se acaba de conocer.
- Al guardar: hash nuevo, `must_change_password = 0`, `token_version + 1` (revoca cualquier token previo), registro en la auditoría. Después continúa el flujo normal: si el docente aún no tiene MFA, responde `{ mfaSetupRequired, enrollToken }`; si ya lo tiene, sigue el reto de MFA.
- Cumplimiento en el servidor: `requireAuth` ya revalida al usuario contra la base en cada petición. Si encuentra `must_change_password = 1`, rechaza con 403 y `code: 'PASSWORD_CHANGE_REQUIRED'`. Un `passwordToken` presentado en cualquier otra ruta se rechaza con 401.
- Los errores de la API ganan un campo `code` legible por máquina (por ejemplo `PASSWORD_CHANGE_REQUIRED`), y `ApiError` del cliente lo expone junto a `status`.
- El endpoint usa el limitador de intentos de autenticación existente.
- Cliente: página nueva para crear la contraseña, a la que el inicio de sesión navega con el `passwordToken` en el estado del router (como ya se hace con el `enrollToken`). La repetición se valida en el cliente y también en el servidor.

### Pruebas esperadas

Caso feliz completo; contraseña temporal reutilizada; token de otro tipo rechazado en el endpoint y en el resto de rutas; token vencido; bandera en `1` con sesión válida bloqueada con `code`; las dos contraseñas distintas; el límite de intentos.

## Pieza 2: grado de la clase

### Datos

- `teachers.grade TINYINT UNSIGNED NULL` con valores válidos 3, 4 y 5. `NULL` significa que aún no se declaró. Con `teachers.grade_locked_at TIMESTAMP NULL` que guarda cuándo se declaró.
- El nivel se **deriva** del grado en una sola constante del servidor (3 → `A1.1`, 4 → `A1.2`, 5 → `A1.3`). No se guarda duplicado.
- `activities.level ENUM('A1.1','A1.2','A1.3') NOT NULL`. La migración asigna `A1.1` a las 6 actividades demo existentes. Las actividades se etiquetan con el nivel del ministerio, no con el grado, para poder reutilizarlas si cambia el plan.

### Declarar el grado (una sola vez)

- `GET /api/teacher/class` devuelve nombre, código de clase, grado, nivel y si está bloqueado.
- `PUT /api/teacher/class/grade` con `{ grade, confirm: true }`. La actualización es atómica (`UPDATE … WHERE user_id = ? AND grade IS NULL`) y mira las filas afectadas. Si ya estaba declarado responde 409 con `code: 'GRADE_LOCKED'`. Sin `confirm: true` responde 400.
- Requiere una sesión de docente normal (no los tokens restringidos).
- Una vez declarado, el servidor rechaza cualquier cambio. No basta con ocultar el botón.

### Panel docente

- Muestra "Tu código de clase" y la selección de grado (3.º, 4.º y 5.º, con su nivel A1.1, A1.2 y A1.3).
- Antes de declarar: al elegir un grado aparece un aviso destacado, con este contenido: "Este nivel no se puede cambiar durante todo el periodo escolar. Si te equivocas, deberás pedir ayuda al gestor de cuentas." Con una casilla "Entiendo que no podré cambiarlo" que habilita el botón de confirmar (mi decisión, ver abajo).
- Después de declarar: se muestra el grado y el nivel con la marca de bloqueado, y el texto de que, si se declaró por error, se abra un ticket con el gestor de cuentas.

### Vista del estudiante

- El listado de módulos y actividades se filtra en el servidor por el nivel de la clase del estudiante (`students.teacher_id` → `teachers.grade`).
- Si el docente aún no declaró el grado, el estudiante ve un mensaje de estado vacío: "Tu docente aún no ha elegido el nivel de la clase."
- **Datos de ejemplo para la demostración.** El script `seed-demo-content.js` crea actividades de ejemplo para los tres niveles, de forma que al elegir el grado el estudiante ve cambiar su vista aunque no exista contenido real, y se pueda mostrar el progreso. Esos datos se marcan como ejemplo (por ejemplo con un prefijo claro en el título o un campo de origen) para poder retirarlos cuando llegue el contenido real. Las actividades de ejemplo deben ser reconocibles como de su nivel.

### Reinicio por el gestor de cuentas

- `POST /api/staff/teachers/:id/reset-grade`, solo para el rol `access_manager`, con un motivo obligatorio. Deja `grade` y `grade_locked_at` en `NULL`.
- Queda en la auditoría encadenada, con quién, cuándo, el docente y el motivo.
- No toca la contraseña ni el MFA (tienen sus propios reinicios) ni el avance de los estudiantes. Mientras el docente no vuelve a declarar, sus estudiantes ven el estado vacío.

### Pruebas esperadas

Declarar por primera vez; segundo intento (409); sin confirmación (400); concurrencia de dos peticiones (solo una gana); estudiante de un nivel no ve actividades de otro; docente sin grado deja al estudiante en estado vacío; el reinicio solo lo ejecuta `access_manager`, exige motivo y queda auditado; un docente no puede llamar al endpoint de reinicio.

## Pieza 3: desbloqueo de módulos por el docente (dirección)

Ya decidido:
- Cada módulo es una actividad complementaria que el docente **desbloquea** para su clase. Tres módulos (Vocabulary, Grammar y Reading) encajan con tres trimestres.
- Se abren en orden y solo hay uno abierto a la vez. Queda abierto hasta que el docente lo cierra para calificarlo. Luego puede abrir el siguiente.
- El estudiante no ve los módulos cerrados ni los que aún no se abrieron.

A definir en su ciclo: modelo de datos del estado por clase y módulo, cómo convive con el filtro por nivel de la pieza 2, y la pantalla del docente.

## Pieza 4: cierre del año escolar (dirección)

Ya decidido:
- El cierre tiene dos etapas. Primero el docente bloquea todos los módulos y califica. Después cierra la clase y se ejecuta el wipe.
- El wipe **archiva, no borra**: el código de clase deja de servir y los estudiantes quedan archivados, con su cuenta y su historial, sin pertenecer a ninguna clase hasta el año siguiente.
- El MVP solo contempla un año regular. Vincular una cuenta archivada a un código nuevo (otra pantalla) queda documentado, no construido.
- Es una acción explícita del docente con confirmación, no una fecha automática.

Supuestos a confirmar en su ciclo: el docente conserva su cuenta y el año siguiente recibe un código y un grado nuevos; el avance archivado se guarda tal cual y no cuenta para el ranking del año nuevo.

Lo que las piezas 1 y 2 deben respetar: el grado y su bloqueo viven en la fila del docente, de modo que el cierre pueda reiniciarlos; y `students.teacher_id` hoy es `NOT NULL` con borrado en cascada, algo que la pieza 4 deberá cambiar para archivar sin borrar. Las piezas 1 y 2 no deben añadir nada que dependa de esa restricción.

## Decisiones mías para revisar

- Casilla de confirmación ("Entiendo que no podré cambiarlo") antes de declarar el grado.
- El selector es por **grado** (3.º a 5.º) y el nivel se deriva, en vez de elegir el nivel directamente.
- Las actividades se etiquetan por nivel MEDUCA, no por grado.
- `passwordToken` sin pedir la contraseña actual; vida de 15 minutos.
- Las 6 actividades demo existentes se asignan a `A1.1` en la migración.
- El reinicio del grado exige un motivo y no toca contraseña, MFA ni avance de estudiantes.
- La marca de "ejemplo" en los datos demo.

### Precisiones tras la revisión del documento

Aclaraciones al modelo, para que el constructor no tenga que adivinar:

- **Dónde vive el nivel.** Solo en `activities`. Los módulos (`vocabulary`, `grammar`, `reading`) son tres filas fijas, comunes a todos los niveles, y no llevan nivel. Cada módulo contiene actividades de varios niveles, y el estudiante ve las de su nivel. Así la pieza 3 desbloquea un módulo por clase sin necesitar otra migración.
- **Qué se filtra por nivel en el servidor.** Todo lo que lista o cuenta actividades para el estudiante: el listado, el avance y los conteos de "completadas". El ranking no necesita filtro, porque ya es solo entre estudiantes de la misma clase, que comparten nivel.
- **Alcance de `must_change_password`.** Solo docentes creados con `createTeacher`. Hoy no existe un reinicio de contraseña de docente por parte del personal de gestión. Si algún día se añade, deberá volver a poner la bandera en `1`; de lo contrario la contraseña temporal que emita quedaría válida para siempre.
- **Docente con MFA ya vinculado.** Tras guardar la contraseña nueva se reutiliza tal cual el reto de MFA existente (el mismo token y la misma forma de respuesta que hoy devuelve el inicio de sesión).
- **Sesión abierta cuando se activa la bandera.** Si el cliente recibe un 403 con `code: 'PASSWORD_CHANGE_REQUIRED'`, borra la sesión local y lleva al inicio de sesión. No tiene `passwordToken`, así que no puede continuar sin volver a entrar.
- **Reinicio del grado y avance previo.** El avance queda guardado, pero deja de verse si el docente declara luego otro grado, porque el filtro por nivel lo oculta. Si vuelve a declarar el mismo, reaparece. Se acepta así.
- **Entorno del contenido de ejemplo (decisión del líder técnico).** La demostración se hace directamente en producción, porque la plataforma aún no se ha presentado a nadie fuera del equipo y no hay usuarios reales. Hoy `seed-demo-content.js` se niega a correr con `NODE_ENV=production`, así que el constructor debe permitirlo solo de forma explícita (por ejemplo, un indicador de línea de comandos que haya que escribir a propósito), nunca por defecto. Las actividades de ejemplo llevan una marca persistente que permita retirarlas con una sola instrucción cuando llegue el contenido real o antes de que la plataforma tenga usuarios externos. Cargar los datos en producción es una acción manual del líder técnico, igual que las migraciones, y no ocurre en el despliegue automático.

## Lo que se deja al constructor

Nombres de archivos, rutas de React y componentes, estilos con Tailwind, texto exacto de los mensajes de error (en español neutro), la política exacta de contraseñas (se reutiliza la existente), la forma concreta de marcar los datos de ejemplo, y cuántas actividades de ejemplo por nivel bastan para una demostración convincente.
