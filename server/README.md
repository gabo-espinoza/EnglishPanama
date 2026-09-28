# English Panamá — Server

API REST en Node.js + Express. Capas: `routes` → `controllers` → `services` → `config/db` (acceso a datos).

## Estructura

```
src/
├── config/       Conexión a la base y configuración
├── routes/       Define endpoints, delega en controllers
├── controllers/  Recibe el request, valida input, llama al service, arma la response
├── services/     Lógica de negocio (XP, niveles, corrección de respuestas, etc.)
├── middleware/   Auth (JWT), manejo de errores
├── app.js        Configuración de Express (cors, json, rutas)
└── server.js     Punto de entrada, levanta el servidor
```

## Setup local

```bash
cp env.example .env   # completar con tus valores
npm install
npm run dev
```

`GET /api/health` confirma que el server está arriba y que llega a la base de datos.
