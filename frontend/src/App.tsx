import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileText,
  Flame,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  School,
  Send,
  Settings,
  Swords,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingState } from "./components/states";
import { useAuth } from "./lib/auth";
import { GuidePage } from "./pages/GuidePage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { DirectorAchievementsPage } from "./pages/director/AchievementsPage";
import { AttendancePage } from "./pages/director/AttendancePage";
import { ClassesPage } from "./pages/director/ClassesPage";
import { DirectorDashboardPage } from "./pages/director/DashboardPage";
import { LessonsPage } from "./pages/director/LessonsPage";
import { DirectorProfilePage } from "./pages/director/ProfilePage";
import { QuestionPoolsPage } from "./pages/director/QuestionPoolsPage";
import { DirectorRankingsPage } from "./pages/director/RankingsPage";
import { SettingsPage } from "./pages/director/SettingsPage";
import { StudentsPage } from "./pages/director/StudentsPage";
import { SubjectsPage } from "./pages/director/SubjectsPage";
import { DirectorTasksPage } from "./pages/director/TasksPage";
import { DirectorTestsPage } from "./pages/director/TestsPage";
import { TeachersPage } from "./pages/director/TeachersPage";
import { TimetablePage } from "./pages/director/TimetablePage";
import { DirectorPartnersPage } from "./pages/director/PartnersPage";
import { ExamGuard } from "./components/ExamGuard";
import { StudentActivitiesPage } from "./pages/student/ActivitiesPage";
import { StudentAchievementsPage } from "./pages/student/AchievementsPage";
import { StudentAttendancePage } from "./pages/student/AttendancePage";
import { StudentClassPage } from "./pages/student/ClassPage";
import { StudentDashboardPage } from "./pages/student/DashboardPage";
import { StudentDuelsPage } from "./pages/student/DuelsPage";
import { StudentGamePlayPage } from "./pages/student/GamePlayPage";
import { StudentGamesPage } from "./pages/student/GamesPage";
import { StudentLeaderboardPage } from "./pages/student/LeaderboardPage";
import { StudentLessonsPage } from "./pages/student/LessonsPage";
import { StudentProfilePage } from "./pages/student/ProfilePage";
import { StudentRemedialPage } from "./pages/student/RemedialPage";
import { StudentStreakPage } from "./pages/student/StreakPage";
import { StudentDuelTakingPage } from "./pages/student/DuelTakingPage";
import { StudentTestTakingPage } from "./pages/student/TestTakingPage";
import { StudentTestsPage } from "./pages/student/TestsPage";
import { StudentXpPage } from "./pages/student/XpPage";
import { StudentPartnersPage } from "./pages/student/PartnersPage";
import { TeacherActivitiesPage } from "./pages/teacher/ActivitiesPage";
import { TeacherAttendancePage } from "./pages/teacher/AttendancePage";
import { TeacherClassesPage } from "./pages/teacher/ClassesPage";
import { TeacherDashboardPage } from "./pages/teacher/DashboardPage";
import { TeacherLessonsPage } from "./pages/teacher/LessonsPage";
import { TeacherProfilePage } from "./pages/teacher/ProfilePage";
import { TeacherTasksPage } from "./pages/teacher/TasksPage";
import { TeacherTestsPage } from "./pages/teacher/TestsPage";
import { TeacherXpPage } from "./pages/teacher/XpPage";
import { TeacherPartnersPage } from "./pages/teacher/PartnersPage";
import type { NavGroup } from "./routes/DashboardLayout";
import { DashboardLayout } from "./routes/DashboardLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { ReportsPage } from "./pages/ReportsPage";

const DIRECTOR_NAV: NavGroup[] = [
  { items: [{ to: "/director", label: "Boshqaruv paneli", end: true, icon: LayoutDashboard }] },
  {
    label: "Ta'lim",
    items: [
      { to: "/director/students", label: "O'quvchilar", icon: Users },
      { to: "/director/teachers", label: "O'qituvchilar", icon: GraduationCap },
      { to: "/director/classes", label: "Sinflar", icon: School },
      { to: "/director/subjects", label: "Fanlar", icon: BookOpen },
    ],
  },
  {
    label: "Darslar",
    items: [
      { to: "/director/lessons", label: "Darslar", icon: ClipboardList },
      { to: "/director/timetable", label: "Dars jadvali", icon: CalendarDays },
      { to: "/director/attendance", label: "Davomat", icon: ClipboardCheck },
    ],
  },
  {
    label: "Boshqaruv",
    items: [
      { to: "/director/tests", label: "Testlar", icon: FileText },
      { to: "/director/tasks", label: "Vazifa berish", icon: Send },
      { to: "/director/reports", label: "Hisobotlar", icon: BarChart3 },
      { to: "/director/rankings", label: "XP va reyting", icon: Trophy },
      { to: "/director/achievements", label: "Yutuqlar", icon: Award },
      { to: "/director/question-pools", label: "Savollar ombori", icon: Database },
    ],
  },
  {
    label: "Hisob",
    items: [
      { to: "/director/notifications", label: "Bildirishnomalar", icon: Bell },
      { to: "/director/profile", label: "Profil", icon: UserCircle },
      { to: "/director/settings", label: "Sozlamalar", icon: Settings },
      { to: "/director/guide", label: "Qo'llanma", icon: HelpCircle },
    ],
  },
  {
    label: "Hamkorlar",
    items: [
      { to: "/director/partners", label: "Hamkorlar ro'yxati", icon: Users },
    ],
  },
];

const TEACHER_NAV: NavGroup[] = [
  { items: [{ to: "/teacher", label: "Boshqaruv paneli", end: true, icon: LayoutDashboard }] },
  {
    label: "Darslar",
    items: [
      { to: "/teacher/classes", label: "Sinflarim", icon: Users },
      { to: "/teacher/lessons", label: "Darslarim", icon: BookOpen },
      { to: "/teacher/attendance", label: "Davomat", icon: ClipboardCheck },
    ],
  },
  {
    label: "Topshiriqlar",
    items: [
      { to: "/teacher/tests", label: "Testlar", icon: FileText },
      { to: "/teacher/activities", label: "Topshiriqlar", icon: ClipboardList },
      { to: "/teacher/tasks", label: "Vazifalarim", icon: Send },
      { to: "/teacher/reports", label: "Hisobotlar", icon: BarChart3 },
      { to: "/teacher/xp", label: "XP", icon: Trophy },
    ],
  },
  {
    label: "Hisob",
    items: [
      { to: "/teacher/notifications", label: "Bildirishnomalar", icon: Bell },
      { to: "/teacher/profile", label: "Profil", icon: UserCircle },
      { to: "/teacher/guide", label: "Qo'llanma", icon: HelpCircle },
    ],
  },
  {
    label: "Hamkorlar",
    items: [
      { to: "/teacher/partners", label: "Hamkorlar", icon: Users },
    ],
  },
];

const STUDENT_NAV: NavGroup[] = [
  { items: [{ to: "/student", label: "Boshqaruv paneli", end: true, icon: LayoutDashboard }] },
  {
    label: "O'quv",
    items: [
      { to: "/student/class", label: "Mening sinfim", icon: Users },
      { to: "/student/lessons", label: "Darslarim", icon: BookOpen },
      { to: "/student/attendance", label: "Davomatim", icon: ClipboardCheck },
      { to: "/student/tests", label: "Testlar", icon: FileText },
      { to: "/student/activities", label: "Topshiriqlar", icon: ClipboardList },
    ],
  },
  {
    label: "Bellashuvlar",
    items: [
      { to: "/student/duels", label: "Duellar", icon: Swords },
      { to: "/student/games", label: "O'yinlar", icon: Gamepad2 },
    ],
  },
  {
    label: "Reyting & yutuqlar",
    items: [
      { to: "/student/xp", label: "Mening XP", icon: Trophy },
      { to: "/student/leaderboard", label: "Reyting", icon: BarChart3 },
      { to: "/student/achievements", label: "Yutuqlar", icon: Award },
      { to: "/student/streak", label: "Seriya", icon: Flame },
    ],
  },
  {
    label: "Hisob",
    items: [
      { to: "/student/notifications", label: "Bildirishnomalar", icon: Bell },
      { to: "/student/profile", label: "Profil", icon: UserCircle },
      { to: "/student/guide", label: "Qo'llanma", icon: HelpCircle },
    ],
  },
  {
    label: "Hamkorlar",
    items: [
      { to: "/student/partners", label: "Hamkorlar", icon: Users },
    ],
  },
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
            <DashboardLayout navGroups={DIRECTOR_NAV} brand="Direktor paneli" />
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
        <Route path="tests" element={<DirectorTestsPage />} />
        <Route path="tasks" element={<DirectorTasksPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="rankings" element={<DirectorRankingsPage />} />
        <Route path="question-pools" element={<QuestionPoolsPage />} />
        <Route path="achievements" element={<DirectorAchievementsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<DirectorProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="partners" element={<DirectorPartnersPage />} />
      </Route>

      <Route
        path="/teacher"
        element={
          <ProtectedRoute allowedRoles={["TEACHER"]}>
            <DashboardLayout navGroups={TEACHER_NAV} brand="O'qituvchi paneli" />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboardPage />} />
        <Route path="classes" element={<TeacherClassesPage />} />
        <Route path="lessons" element={<TeacherLessonsPage />} />
        <Route path="attendance" element={<TeacherAttendancePage />} />
        <Route path="tests" element={<TeacherTestsPage />} />
        <Route path="activities" element={<TeacherActivitiesPage />} />
        <Route path="tasks" element={<TeacherTasksPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="xp" element={<TeacherXpPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<TeacherProfilePage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="partners" element={<TeacherPartnersPage />} />
      </Route>

      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRoles={["STUDENT"]}>
            <DashboardLayout navGroups={STUDENT_NAV} brand="O'quvchi paneli" vibrant />
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentDashboardPage />} />
        <Route path="class" element={<StudentClassPage />} />
        <Route path="lessons" element={<StudentLessonsPage />} />
        <Route path="attendance" element={<StudentAttendancePage />} />
        <Route path="tests" element={<StudentTestsPage />} />
        <Route path="tests/:id" element={<ExamGuard><StudentTestTakingPage /></ExamGuard>} />
        <Route path="remedial/:id" element={<StudentRemedialPage />} />
        <Route path="activities" element={<StudentActivitiesPage />} />
        <Route path="duels" element={<StudentDuelsPage />} />
        <Route path="duels/:id" element={<StudentDuelTakingPage />} />
        <Route path="games" element={<StudentGamesPage />} />
        <Route path="games/:id" element={<StudentGamePlayPage />} />
        <Route path="xp" element={<StudentXpPage />} />
        <Route path="leaderboard" element={<StudentLeaderboardPage />} />
        <Route path="achievements" element={<StudentAchievementsPage />} />
        <Route path="streak" element={<StudentStreakPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<StudentProfilePage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="partners" element={<StudentPartnersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
