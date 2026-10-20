import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import MfaSetup from './pages/auth/MfaSetup.jsx';
import SetInitialPassword from './pages/auth/SetInitialPassword.jsx';
import StudentHome from './pages/student/StudentHome.jsx';
import TeacherHome from './pages/teacher/TeacherHome.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/password/initial" element={<SetInitialPassword />} />
            <Route path="/mfa/setup" element={<MfaSetup />} />
            <Route
                path="/student/*"
                element={
                    <ProtectedRoute role="student">
                        <StudentHome />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/teacher/*"
                element={
                    <ProtectedRoute role="teacher">
                        <TeacherHome />
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
}
