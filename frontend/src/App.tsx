import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Flame,
  GraduationCap,
  LayoutDashboard,
  School,
  Settings,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingState } from "./components/states";
import { useAuth } from "./lib/auth";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { DirectorAchievementsPage } from "./pages/director/AchievementsPage";
import { AttendancePage } from "./pages/director/AttendancePage";
import { ClassesPage } from "./pages/director/ClassesPage";
import { DirectorDashboardPage } from "./pages/director/DashboardPage";
import { LessonsPage } from "./pages/director/LessonsPage";
import { DirectorProfilePage } from "./pages/director/ProfilePage";
import { DirectorRankingsPage } from "./pages/director/RankingsPage";
import { SettingsPage } from "./pages/director/SettingsPage";
import { StudentsPage } from "./pages/director/StudentsPage";
import { SubjectsPage } from "./pages/director/SubjectsPage";
import { TeachersPage } from "./pages/director/TeachersPage";
import { TimetablePage } from "./pages/director/TimetablePage";
import { StudentActivitiesPage } from "./pages/student/ActivitiesPage";
import { StudentAchievementsPage } from "./pages/student/AchievementsPage";
import { StudentAttendancePage } from "./pages/student/AttendancePage";
import { StudentClassPage } from "./pages/student/ClassPage";
import { StudentDashboardPage } from "./pages/student/DashboardPage";
import { StudentLeaderboardPage } from "./pages/student/LeaderboardPage";
import { StudentLessonsPage } from "./pages/student/LessonsPage";
import { StudentProfilePage } from "./pages/student/ProfilePage";
import { StudentStreakPage } from "./pages/student/StreakPage";
import { StudentTestTakingPage } from "./pages/student/TestTakingPage";
import { StudentTestsPage } from "./pages/student/TestsPage";
import { StudentXpPage } from "./pages/student/XpPage";
import { TeacherActivitiesPage } from "./pages/teacher/ActivitiesPage";
import { TeacherAttendancePage } from "./pages/teacher/AttendancePage";
import { TeacherClassesPage } from "./pages/teacher/ClassesPage";
import { TeacherDashboardPage } from "./pages/teacher/DashboardPage";
import { TeacherLessonsPage } from "./pages/teacher/LessonsPage";
import { TeacherProfilePage } from "./pages/teacher/ProfilePage";
import { TeacherTestsPage } from "./pages/teacher/TestsPage";
import { TeacherXpPage } from "./pages/teacher/XpPage";
import { DashboardLayout } from "./routes/DashboardLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";

const DIRECTOR_NAV = [
  { to: "/director", label: "Boshqaruv paneli", end: true, icon: LayoutDashboard },
  { to: "/director/students", label: "O'quvchilar", icon: Users },
  { to: "/director/teachers", label: "O'qituvchilar", icon: GraduationCap },
  { to: "/director/classes", label: "Sinflar", icon: School },
  { to: "/director/subjects", label: "Fanlar", icon: BookOpen },
  { to: "/director/lessons", label: "Darslar", icon: ClipboardList },
  { to: "/director/timetable", label: "Dars jadvali", icon: CalendarDays },
  { to: "/director/attendance", label: "Davomat", icon: ClipboardCheck },
  { to: "/director/tests", label: "Testlar", icon: FileText },
  { to: "/director/activities", label: "Topshiriqlar", icon: ClipboardList },
  { to: "/director/rankings", label: "XP va reyting", icon: Trophy },
  { to: "/director/achievements", label: "Yutuqlar", icon: Award },
  { to: "/director/notifications", label: "Bildirishnomalar", icon: Bell },
  { to: "/director/profile", label: "Profil", icon: UserCircle },
  { to: "/director/settings", label: "Sozlamalar", icon: Settings },
];

const TEACHER_NAV = [
  { to: "/teacher", label: "Boshqaruv paneli", end: true, icon: LayoutDashboard },
  { to: "/teacher/classes", label: "Sinflarim", icon: Users },
  { to: "/teacher/lessons", label: "Darslarim", icon: BookOpen },
  { to: "/teacher/attendance", label: "Davomat", icon: ClipboardCheck },
  { to: "/teacher/tests", label: "Testlar", icon: FileText },
  { to: "/teacher/activities", label: "Topshiriqlar", icon: ClipboardList },
  { to: "/teacher/xp", label: "XP", icon: Trophy },
  { to: "/teacher/notifications", label: "Bildirishnomalar", icon: Bell },
  { to: "/teacher/profile", label: "Profil", icon: UserCircle },
];

const STUDENT_NAV = [
  { to: "/student", label: "Boshqaruv paneli", end: true, icon: LayoutDashboard },
  { to: "/student/class", label: "Mening sinfim", icon: Users },
  { to: "/student/lessons", label: "Darslarim", icon: BookOpen },
  { to: "/student/attendance", label: "Davomatim", icon: ClipboardCheck },
  { to: "/student/tests", label: "Testlar", icon: FileText },
  { to: "/student/activities", label: "Topshiriqlar", icon: ClipboardList },
  { to: "/student/xp", label: "Mening XP", icon: Trophy },
  { to: "/student/leaderboard", label: "Reyting", icon: BarChart3 },
  { to: "/student/achievements", label: "Yutuqlar", icon: Award },
  { to: "/student/streak", label: "Seriya", icon: Flame },
  { to: "/student/notifications", label: "Bildirishnomalar", icon: Bell },
  { to: "/student/profile", label: "Profil", icon: UserCircle },
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
        <Route path="tests" element={<TeacherTestsPage />} />
        <Route path="activities" element={<TeacherActivitiesPage />} />
        <Route path="rankings" element={<DirectorRankingsPage />} />
        <Route path="achievements" element={<DirectorAchievementsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<DirectorProfilePage />} />
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
        <Route path="tests" element={<TeacherTestsPage />} />
        <Route path="activities" element={<TeacherActivitiesPage />} />
        <Route path="xp" element={<TeacherXpPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<TeacherProfilePage />} />
      </Route>

      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRoles={["STUDENT"]}>
            <DashboardLayout navItems={STUDENT_NAV} brand="O'quvchi paneli" vibrant />
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentDashboardPage />} />
        <Route path="class" element={<StudentClassPage />} />
        <Route path="lessons" element={<StudentLessonsPage />} />
        <Route path="attendance" element={<StudentAttendancePage />} />
        <Route path="tests" element={<StudentTestsPage />} />
        <Route path="tests/:id" element={<StudentTestTakingPage />} />
        <Route path="activities" element={<StudentActivitiesPage />} />
        <Route path="xp" element={<StudentXpPage />} />
        <Route path="leaderboard" element={<StudentLeaderboardPage />} />
        <Route path="achievements" element={<StudentAchievementsPage />} />
        <Route path="streak" element={<StudentStreakPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<StudentProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
