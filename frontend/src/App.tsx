import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingState } from "./components/states";
import { useAuth } from "./lib/auth";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { AttendancePage } from "./pages/director/AttendancePage";
import { ClassesPage } from "./pages/director/ClassesPage";
import { DirectorDashboardPage } from "./pages/director/DashboardPage";
import { LessonsPage } from "./pages/director/LessonsPage";
import { SettingsPage } from "./pages/director/SettingsPage";
import { StudentsPage } from "./pages/director/StudentsPage";
import { SubjectsPage } from "./pages/director/SubjectsPage";
import { TeachersPage } from "./pages/director/TeachersPage";
import { TimetablePage } from "./pages/director/TimetablePage";
import { StudentAttendancePage } from "./pages/student/AttendancePage";
import { StudentClassPage } from "./pages/student/ClassPage";
import { StudentDashboardPage } from "./pages/student/DashboardPage";
import { StudentLessonsPage } from "./pages/student/LessonsPage";
import { StudentProfilePage } from "./pages/student/ProfilePage";
import { TeacherAttendancePage } from "./pages/teacher/AttendancePage";
import { TeacherClassesPage } from "./pages/teacher/ClassesPage";
import { TeacherDashboardPage } from "./pages/teacher/DashboardPage";
import { TeacherLessonsPage } from "./pages/teacher/LessonsPage";
import { TeacherProfilePage } from "./pages/teacher/ProfilePage";
import { DashboardLayout } from "./routes/DashboardLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";

const DIRECTOR_NAV = [
  { to: "/director", label: "Dashboard" },
  { to: "/director/students", label: "Students" },
  { to: "/director/teachers", label: "Teachers" },
  { to: "/director/classes", label: "Classes" },
  { to: "/director/subjects", label: "Subjects" },
  { to: "/director/lessons", label: "Lessons" },
  { to: "/director/timetable", label: "Timetable" },
  { to: "/director/attendance", label: "Attendance" },
  { to: "/director/notifications", label: "Notifications" },
  { to: "/director/settings", label: "Settings" },
];

const TEACHER_NAV = [
  { to: "/teacher", label: "Dashboard" },
  { to: "/teacher/classes", label: "My Classes" },
  { to: "/teacher/lessons", label: "My Lessons" },
  { to: "/teacher/attendance", label: "Attendance" },
  { to: "/teacher/notifications", label: "Notifications" },
  { to: "/teacher/profile", label: "Profile" },
];

const STUDENT_NAV = [
  { to: "/student", label: "Dashboard" },
  { to: "/student/class", label: "My Class" },
  { to: "/student/lessons", label: "My Lessons" },
  { to: "/student/attendance", label: "My Attendance" },
  { to: "/student/notifications", label: "Notifications" },
  { to: "/student/profile", label: "Profile" },
];

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role.toLowerCase()}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/director"
        element={
          <ProtectedRoute allowedRoles={["DIRECTOR"]}>
            <DashboardLayout navItems={DIRECTOR_NAV} brand="Direktor paneli" />
          </ProtectedRoute>
        }
      >
        <Route index element={<DirectorDashboardPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="lessons" element={<LessonsPage />} />
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route
        path="/teacher"
        element={
          <ProtectedRoute allowedRoles={["TEACHER"]}>
            <DashboardLayout navItems={TEACHER_NAV} brand="O'qituvchi paneli" />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboardPage />} />
        <Route path="classes" element={<TeacherClassesPage />} />
        <Route path="lessons" element={<TeacherLessonsPage />} />
        <Route path="attendance" element={<TeacherAttendancePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<TeacherProfilePage />} />
      </Route>

      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRoles={["STUDENT"]}>
            <DashboardLayout navItems={STUDENT_NAV} brand="O'quvchi paneli" />
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentDashboardPage />} />
        <Route path="class" element={<StudentClassPage />} />
        <Route path="lessons" element={<StudentLessonsPage />} />
        <Route path="attendance" element={<StudentAttendancePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<StudentProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
