# Frontend – English Panamá

Cliente web en `client/` (React + Vite + Tailwind CSS).

## Cómo correrlo

```bash
cd client
npm install
npm run dev
```

Se abre en `http://localhost:5173`.

## Estructura de `client/src`

```
src/
├── api/                      Conexión con el backend y sesión
├── components/
│   ├── AuthBackground.jsx    Fondo con ráfagas de viento para Login y Registro
│   └── ProtectedRoute.jsx    Protege rutas según sesión y rol
├── pages/
│   ├── auth/                 Login.jsx y Register.jsx
│   ├── student/
│   └── teacher/
├── App.jsx
├── index.css                 Clases base (auth-card, auth-input, auth-button)
└── main.jsx
```

## Sistema de diseño

### Tipografía
Poppins para el texto y Fredoka One para el logo "E" (definidas en `tailwind.config.js`).

### Paleta de colores (turquesa)
Definida en `client/tailwind.config.js`.

| Color | Hex | Uso |
|---|---|---|
| `brand-600` | `#0B454C` | Fondo oscuro de Login y Registro |
| `brand-500` | `#105F68` | Fondo oscuro (degradado) |
| `brand-300` | `#63C1BB` | Ráfagas de viento |
| `brand-100` | `#C8E6E2` | Ráfagas de viento (tono claro) |
| `blue-600` | `#2B8B85` | Botones, logo "E" y enlaces |
| `blue-700` | `#22716C` | Botón al pasar el mouse |
| `blue-300` | `#5DC1B9` | Aros de enfoque y acentos |
| `blue-200` | `#8AE0DB` | Bordes suaves |

**Importante:** en `tailwind.config.js` las escalas `blue` y `green` de Tailwind están redefinidas con la misma paleta turquesa. Cualquier clase como `bg-blue-600` o `text-green-600` se ve turquesa en todo el proyecto. Para cambiar el color de la app basta con editar esos valores.

## Componentes

### `AuthBackground`
Envuelve las pantallas de autenticación: fondo oscuro con degradado turquesa y ráfagas de viento en SVG. En pantallas grandes la tarjeta queda a la izquierda y el viento a la derecha; en móvil se centra.

```jsx
<AuthBackground>
  <div className="auth-card">...</div>
</AuthBackground>
```

## Pantallas implementadas

### Login (`/login`)
- Usuario y contraseña, con manejo de errores y estado de carga.
- Redirige a `/teacher` o `/student` según el rol.
- Se retiró el checkbox "Recordarme" y el enlace "¿Olvidaste tu contraseña?" porque no tenían funcionalidad conectada.

### Registro (`/register`)
- Registro de estudiante con usuario, contraseña y código de clase del docente.
- Usa las mismas clases (`auth-input`, `auth-button`) que el Login para verse idéntico.

## Pendiente
- Vistas de estudiante (`pages/student`).
- Vistas de docente (`pages/teacher`).