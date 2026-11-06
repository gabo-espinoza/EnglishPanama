import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import MfaSetup from './pages/auth/MfaSetup.jsx';
import SetInitialPassword from './pages/auth/SetInitialPassword.jsx';
import StudentHome from './pages/student/StudentHome.jsx';
import TeacherHome from './pages/teacher/TeacherHome.jsx';
import StaffLogin from './pages/staff/StaffLogin.jsx';
import StaffLayout, { StaffHome, RequireSection } from './pages/staff/StaffLayout.jsx';
import IdentityAccess from './pages/staff/IdentityAccess.jsx';
import Audit from './pages/staff/Audit.jsx';
import Analytics from './pages/staff/Analytics.jsx';
import ContentManagement from './pages/staff/ContentManagement.jsx';
import ContentReview from './pages/staff/ContentReview.jsx';
import GameManagement from './pages/staff/GameManagement.jsx';
import Moderation from './pages/staff/Moderation.jsx';
import SupportStaff from './pages/staff/SupportStaff.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import StaffRoute from './components/StaffRoute.jsx';
import IdleLogout from './components/IdleLogout.jsx';

export default function App() {
    return (
        <>
        <IdleLogout />
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
            <Route path="/staff/login" element={<StaffLogin />} />
            <Route
                path="/staff"
                element={
                    <StaffRoute>
                        <StaffLayout />
                    </StaffRoute>
                }
            >
                <Route index element={<StaffHome />} />
                <Route path="access" element={<RequireSection section="access"><IdentityAccess /></RequireSection>} />
                <Route path="audit" element={<RequireSection section="audit"><Audit /></RequireSection>} />
                <Route path="analytics" element={<RequireSection section="analytics"><Analytics /></RequireSection>} />
                <Route path="content" element={<RequireSection section="content"><ContentManagement /></RequireSection>} />
                <Route path="review" element={<RequireSection section="review"><ContentReview /></RequireSection>} />
                <Route path="game" element={<RequireSection section="game"><GameManagement /></RequireSection>} />
                <Route path="moderation" element={<RequireSection section="moderation"><Moderation /></RequireSection>} />
                <Route path="support" element={<RequireSection section="support"><SupportStaff /></RequireSection>} />
                <Route path="*" element={<Navigate to="/staff" replace />} />
            </Route>
        </Routes>
        </>
    );
}
