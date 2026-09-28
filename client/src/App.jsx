import { Routes, Route } from 'react-router-dom';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import StudentHome from './pages/student/StudentHome.jsx';
import TeacherHome from './pages/teacher/TeacherHome.jsx';

// Rutas de alto nivel. La protección por rol (redirigir si no hay sesión,
// o si el rol no corresponde) se suma acá cuando esté el login funcionando.
export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/student/*" element={<StudentHome />} />
            <Route path="/teacher/*" element={<TeacherHome />} />
        </Routes>
    );
}
