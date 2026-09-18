export type Role = "DIRECTOR" | "TEACHER" | "STUDENT";

export interface CurrentUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
}

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export interface LessonSummary {
  id: number;
  subject: string;
  school_class: string;
  start_time: string;
  end_time: string;
  room: string;
  topic: string;
  attendance_marked: boolean;
  is_own_lesson?: boolean;
}

export interface DirectorDashboard {
  total_students: number;
  total_teachers: number;
  total_classes: number;
  today_lessons: number;
  today_attendance: AttendanceCounts;
}

export interface TeacherDashboard {
  today_lessons: LessonSummary[];
  my_classes_count: number;
  unread_notifications: number;
}

export interface StudentDashboard {
  school_class: string | null;
  today_lessons: LessonSummary[];
  attendance_summary: AttendanceCounts & { total: number };
  unread_notifications: number;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Teacher {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  phone_number: string;
  bio: string;
}

export interface Student {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  school_class: number | null;
  school_class_name: string | null;
  birth_date: string | null;
  phone_number: string;
  parent_phone_number: string;
}

export interface SchoolClass {
  id: number;
  name: string;
  class_teacher: number | null;
  class_teacher_name: string | null;
  students_count: number;
}

export interface Subject {
  id: number;
  name: string;
}

export interface Lesson {
  id: number;
  subject: number;
  subject_name: string;
  school_class: number;
  school_class_name: string;
  teacher: number;
  teacher_name: string;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  topic: string;
}

export interface TimetableSlot {
  id: number;
  school_class: number;
  school_class_name: string;
  subject: number;
  subject_name: string;
  teacher: number;
  teacher_name: string;
  day_of_week: number;
  day_of_week_display: string;
  period_number: number;
  room: string;
}

export interface ClassAttendanceSummary {
  class_id: number;
  class_name: string;
  date: string;
  total_students: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

export interface AttendanceRecord {
  id: number;
  lesson: number;
  subject_name: string;
  school_class_name: string;
  lesson_date: string;
  student: number;
  student_name: string;
  status: AttendanceStatus;
  marked_by: number | null;
  marked_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterStudent {
  id: number;
  full_name: string;
  email: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  category: "GENERAL" | "ATTENDANCE";
  is_read: boolean;
  created_at: string;
}

export interface SchoolTimeConfig {
  start_time: string;
  end_time: string;
  period_duration_minutes: number;
  short_break_minutes: number;
  long_break_after_period: number;
  long_break_minutes: number;
}

export interface TelegramStatus {
  linked: boolean;
  telegram_username: string | null;
}

export interface TelegramLinkCode {
  code: string;
  expires_at: string;
  bot_username: string;
}
