import { Routes, Route, Navigate } from 'react-router-dom';
import TeacherHome from './pages/teacher/TeacherHome.jsx';
import StudentHome from './pages/student/StudentHome.jsx';

// Importaciones del Staff
import StaffLayout from './pages/staff/StaffLayout.jsx';
import ContentManagement from './pages/staff/ContentManagement.jsx';
import ContentReview from './pages/staff/ContentReview.jsx'; // <- Nueva importación del Revisor
import IdentityAccess from './pages/staff/IdentityAccess.jsx';
import GameManagement from './pages/staff/GameManagement.jsx';
import Moderation from './pages/staff/Moderation.jsx';
import SupportStaff from './pages/staff/SupportStaff.jsx';
import Analytics from './pages/staff/Analytics.jsx';
import Audit from './pages/staff/Audit.jsx';

export default function App() {
  return (
    <Routes>
      {/* RUTAS DE ESTUDIANTES Y DOCENTES */}
      <Route path="/" element={<StudentHome />} />
      <Route path="/login" element={<StudentHome />} />
      <Route path="/student/*" element={<StudentHome />} />
      <Route path="/teacher/*" element={<TeacherHome />} />
      
      {/* RUTAS DEL STAFF (Protegidas y anidadas) */}
      <Route path="/staff" element={<StaffLayout />}>
          <Route index element={<div className="p-8 text-center text-gray-500 font-bold">Selecciona un área en el menú lateral.</div>} />
          
          <Route path="content" element={<ContentManagement />} />
          <Route path="review" element={<ContentReview />} /> {/* <- Nueva ruta agregada */}
          
          <Route path="access" element={<IdentityAccess />} />
          <Route path="audit" element={<Audit />} />
          <Route path="game" element={<GameManagement />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="support" element={<SupportStaff />} />
          <Route path="analytics" element={<Analytics />} />
      </Route>

      {/* RUTA DE RESCATE (Fallback) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}