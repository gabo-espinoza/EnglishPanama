import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
// Tus otros imports se quedan exactamente igual

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* Si tienes otras rutas para profesores o estudiantes, mantenlas aquí */}
    </Routes>
  );
}

export default App;