# Integración del rediseño de paneles: plan

**Objetivo:** llevar el rediseño visual de la rama `PaginasWebs` (Reyfernaan, commit 5205fe1) a `develop` **sin perder nada de lo real**: la autenticación, la pieza 2 (grado de la clase) y los endpoints existentes. La rama original es un prototipo con datos falsos (`USE_MOCK = true`) que borra las rutas de acceso; aquí se toma su **diseño** y se monta sobre los paneles reales.

**Referencia de diseño (solo lectura):** `C:\Users\User\Documents\GitHub\EnglishPanama-paginas` (detached HEAD en 5205fe1). Nunca se copia tal cual: se usa para el aspecto, la estructura y el texto, y se conecta a datos reales.

**Rama de trabajo:** `feat/rediseno-paneles` en el worktree `C:\Users\User\Documents\GitHub\EnglishPanama-rediseno`, creada desde `develop` (2f1aa2c). El PR apunta a `develop`.

## Reglas globales

- Neutral Latin American Spanish con "tú"; sin voseo ni regionalismos; textos de interfaz con tildes, ¿ ¡ y la marca ordinal ("3.º grado"). Sin inglés suelto en la interfaz ("Top Jugadores", "Vista Demo", "Lvl"...).
- **Cero datos falsos en el código que se entrega:** sin `USE_MOCK`, sin `MOCK_*`, sin arreglos de ejemplo presentados como reales, sin `setTimeout` que simule una respuesta, sin `alert()` de éxito. Todo elemento de la interfaz que no tenga backend real se **omite** (no se deja un botón que simula).
- Nombres de la API: el nivel A1.x es `classLevel` y el grado `classGrade`; la clave `level` es el nivel de XP. Los niveles y grados salen **del servidor** (`grades` de `GET /api/teacher/class`), nunca escritos a mano; no existen A2 ni B1 en este proyecto (solo A1.1, A1.2 y A1.3, grados 3.º a 5.º).
- Autenticación intacta: se conservan `/login`, `/register`, `/password/initial`, `/mfa/setup` y `ProtectedRoute` en `/student/*` y `/teacher/*`. El hook central del 403 `PASSWORD_CHANGE_REQUIRED` en `client/src/api/client.js` no se toca.
- Tokens solo por los helpers de sesión; nunca en URLs, consola ni claves de almacenamiento que choquen. La sesión de staff usa claves **propias** (distintas de `ep_token` y `ep_role`).
- Texto exacto que se conserva de develop en el panel docente: aviso "Este nivel no se puede cambiar durante todo el periodo escolar. Si te equivocas, deberás pedir ayuda al gestor de cuentas.", casilla "Entiendo que no podré cambiarlo" (el botón de confirmar sigue deshabilitado hasta marcarla), `confirm: true`, y 409 `GRADE_LOCKED` que recarga y muestra el estado bloqueado. El docente **nunca** puede cambiar el grado una vez declarado.
- Sin nuevas dependencias en `client/package.json`. Sin ejecutar `npm install`, `npm run build` ni servidores de desarrollo (no hay `node_modules` y la regla del proyecto lo prohíbe): se verifica leyendo y con `rg`.
- Efectos de React seguros en StrictMode (bandera `active` con limpieza); estados de carga, error y vacío; diseño que funciona a 375 px de ancho; etiquetas y botones accesibles.
- Commits convencionales en español **sin** `Co-Authored-By` ni atribución de IA. Los agentes **no hacen commit ni push**: el controlador commitea por tarea. Cada tarea toca solo los archivos que le pertenecen.

## Decisiones (a revisar por el líder técnico)

1. **Se excluyen las 5 páginas de staff sin backend** (`ContentManagement`, `ContentReview`, `GameManagement`, `Moderation`, `SupportStaff`): no existe ninguna ruta de servidor para contenido, juego, moderación ni soporte. Su diseño queda en la rama `PaginasWebs` para cuando haya backend.
2. **Staff real:** inicio de sesión de staff (usuario, contraseña y código TOTP contra `POST /api/staff/auth/login`), sesión de 20 minutos con claves propias, rol y área tomados de `GET /api/staff/me` (nunca de un `<select>`), y el menú y las rutas según la matriz de roles del servidor (`server/src/config/staffRoles.js`). El servidor sigue siendo la autoridad; el cliente solo oculta lo que no corresponde.
3. **Páginas de staff conectadas:** Identidad y accesos (`GET /api/staff/accounts`, `POST /api/staff/teachers`, `POST /api/staff/teachers/:id/reset-mfa`, `POST /api/staff/teachers/:id/reset-grade` con motivo de 5 a 40 caracteres, solicitudes de cambio), Auditoría (`GET /api/staff/audit`, `GET /api/staff/audit/verify`, `GET/POST /api/staff/change-requests…`) y Analítica (`GET /api/staff/analytics/dashboard`).
4. **Panel docente:** el diseño y las pestañas de la rama sobre los datos reales de develop (`GET /api/teacher/class`, `PUT /api/teacher/class/grade`, `GET /api/teacher/students`). Se omiten perfil con "Institución" y "Correo", tickets, comunidad y soporte (sin backend).
5. **Panel del estudiante:** el diseño de la rama sobre datos reales: `GET /api/users/me`, `GET /api/activities/:slug`, `GET /api/ranking`, `GET /api/daily-challenge` y `POST /api/daily-challenge/complete`. El alias es el usuario de inicio de sesión y **no se edita**. El avatar solo se edita si `PATCH /api/users/me` lo admite y con valores válidos para el servidor (`^[a-z0-9_-]{1,50}$`: se muestra un emoji a partir de un nombre corto, no se guarda el emoji). Se omite el formulario de soporte.
6. **Estilos:** `brand-50`, `brand-700` y `animate-fade-in` no existen en la configuración: se define `animate-fade-in` en Tailwind y se usan los tonos de `brand` que sí existen (100 a 600).

---

### Task 0: Fundamentos visuales (haiku)

**Archivos:** `client/src/components/WindBackdrop.jsx` (nuevo, a partir de la rama), `client/tailwind.config.js`, `client/src/index.css` si hace falta.
- Traer `WindBackdrop.jsx` de la rama y dejarlo reutilizable (sin duplicar el `Swirl` si `AuthBackground.jsx` ya lo tiene: extraer solo si es trivial; si no, copiar tal cual y anotar la duplicación).
- Definir `animate-fade-in` (keyframes y animación, respetando `prefers-reduced-motion`) en `tailwind.config.js` sin cambiar nada más de la paleta.
- No tocar `package.json` ni `package-lock.json`.

### Task 1: Sesión, API y rutas de staff (sonnet)

**Archivos:** `client/src/api/staffSession.js`, `client/src/api/staff.js`, `client/src/pages/staff/StaffLogin.jsx`, `client/src/pages/staff/StaffLayout.jsx`, `client/src/components/StaffRoute.jsx` (guard), `client/src/App.jsx`.
- `staffSession.js` con claves propias; `staff.js` con una función por endpoint de staff que se use (login, me, accounts, createTeacher, resetMfa, resetGrade, change-requests listar/decidir/crear, audit listar/verificar, analytics dashboard), todas con el token de staff y el mismo estilo de `api/auth.js`.
- `StaffLogin.jsx` (usuario, contraseña y TOTP) con el diseño de la rama; errores por estado y código (401, 429); al entrar, guarda la sesión y va a `/staff`.
- `StaffRoute` (guard de ruta): sin sesión de staff redirige a `/staff/login`; con sesión llama a `GET /api/staff/me` una vez para fijar rol y área; un 401 limpia la sesión de staff y vuelve al login de staff.
- `StaffLayout.jsx` con el diseño de la rama, menú lateral **y menú móvil**, solo con las áreas que corresponden al rol (matriz del servidor), cierre de sesión de staff (no borra la sesión de plataforma).
- `App.jsx`: restaurar **tal cual** las rutas de develop y añadir `/staff/login` y `/staff` (anidadas: `access`, `audit`, `analytics`) con el guard. Sin importar las 5 páginas excluidas.

### Task 2: Páginas de staff con datos reales (sonnet)

**Archivos:** `client/src/pages/staff/IdentityAccess.jsx`, `Audit.jsx`, `Analytics.jsx`.
- Diseño de la rama, datos y acciones reales con `api/staff.js` (Task 1). Sin `alert()` de éxito falso; errores y confirmaciones en la propia página. Las acciones que el rol no puede hacer no se muestran. El reinicio del grado pide el motivo (5 a 40 caracteres) y valida en el cliente antes de enviar.
- Auditoría: el botón de verificar muestra el resultado real de `GET /api/staff/audit/verify` (incluido el fallo).

### Task 3: Panel del estudiante (sonnet)

**Archivos:** `client/src/pages/student/StudentHome.jsx`, `client/src/api/student.js` (ampliar).
- Diseño de la rama sobre datos reales; ver la decisión 5. Conservar de develop: nivel de clase (`classGrade`/`classLevel`), estado vacío "Tu docente aún no ha elegido el nivel de la clase.", módulos y actividades reales, insignia "Ejemplo", XP y nivel de XP.

### Task 4: Panel del docente (sonnet)

**Archivos:** `client/src/pages/teacher/TeacherHome.jsx`, `client/src/api/teacher.js` (solo si hace falta).
- Diseño y pestañas de la rama sobre los datos reales de develop; ver la decisión 4 y las reglas globales sobre el aviso del grado.

### Task 5: Barrido de idioma, estilos y documentación (haiku)

**Archivos:** `docs/frontend.md`; correcciones menores en cualquier archivo de `client/src` que traiga voseo, inglés suelto o clases de Tailwind inexistentes.
- `rg` por voseo, por `USE_MOCK|MOCK_|alert\(|setTimeout`, por `brand-50|brand-700`, por `A2|B1` y por imports no relativos que no sean `react` o `react-router-dom`; informar lo encontrado y corregir lo trivial.
- Actualizar `docs/frontend.md` con las páginas y rutas nuevas.
