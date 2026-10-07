export type Role = "DIRECTOR" | "TEACHER" | "STUDENT";

export interface CurrentUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  must_change_password: boolean;
  total_xp: number | null;
  avatar_url: string | null;
  teacher_profile_id: number | null;
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
  total_tests: number;
  total_activities: number;
  total_xp_awarded: number;
  top_class: { name: string; total_xp: number } | null;
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
  total_xp: number;
}

export interface SchoolClass {
  id: number;
  name: string;
  class_teacher: number | null;
  class_teacher_name: string | null;
  students_count: number;
  total_xp: number;
  /** True when the requesting teacher leads this class (vs. just teaching a lesson in it). */
  is_my_homeroom: boolean;
}

export interface Subject {
  id: number;
  name: string;
}

/** `GET /games/subjects/` — a subject with how many questions its shared bank
 * currently holds, so the client can flag an unstocked subject before a game
 * session is started. */
export interface SubjectCoverage {
  id: number;
  name: string;
  question_count: number;
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
  secondary_teacher: number | null;
  secondary_teacher_name: string | null;
  day_of_week: number;
  day_of_week_display: string;
  period_number: number;
  room: string;
}

/** Same shape as `RosterStudent`, plus a parent phone number — only present
 * when the viewer is a teacher/director, never for a student viewing their
 * own class (see `AttendanceRosterSerializer` vs `StudentRosterSerializer`). */
export interface AttendanceRosterStudent extends RosterStudent {
  parent_phone_number?: string;
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
  absent_students: AttendanceRosterStudent[];
  late_students: AttendanceRosterStudent[];
}

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

/** One day's whole-school (or one grade's) attendance status counts — the
 * director's daily attendance bar chart, from `/attendance/daily-summary/`. */
export interface AttendanceDailyCount {
  date: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
}

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

/** One day's lessons with their attendance state, from `/attendance/lesson-summary/`.
 * Lets students and the director recognize a lesson whose attendance was never
 * taken ("davomat olinmagan") instead of the lesson silently disappearing. */
export interface LessonAttendanceStatus {
  id: number;
  subject_name: string;
  school_class_name: string;
  teacher_name: string;
  date: string;
  start_time: string;
  end_time: string;
  students_count: number;
  marked_count: number;
  attendance_marked: boolean;
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

/** Same shape as `TelegramLinkCode` — a student generates this and shares it
 * with a parent, who types it into the bot to link their own Telegram chat. */
export type ParentLinkCode = TelegramLinkCode;

export interface ParentTelegramAccountItem {
  id: number;
  telegram_username: string;
  created_at: string;
}

export interface ParentContact {
  parent_phone_number: string;
}

// ---------- Learning: tests ----------

export interface TestOption {
  id: number;
  text: string;
}

export interface TestOptionWrite extends TestOption {
  question: number;
  is_correct: boolean;
}

export interface TestQuestion {
  id: number;
  text: string;
  order: number;
  options: TestOption[];
}

export interface TestQuestionWrite {
  id: number;
  test: number;
  text: string;
  order: number;
}

export interface TestSummary {
  id: number;
  title: string;
  subject: number;
  subject_name: string;
  school_class: number;
  school_class_name: string;
  teacher_name: string;
  time_limit_minutes: number | null;
  max_xp: number;
  is_published: boolean;
  question_count: number;
  /** Cap on question count for subjects that meet rarely (≤2x/week) in this class — null = no cap. */
  max_questions: number | null;
  created_at: string;
}

export interface TestDetail extends TestSummary {
  description: string;
  questions: TestQuestion[];
}

export type TestAttemptStatus = "IN_PROGRESS" | "SUBMITTED";

export interface TestAttempt {
  id: number;
  test: number;
  test_title: string;
  student: number;
  student_name: string;
  status: TestAttemptStatus;
  started_at: string;
  submitted_at: string | null;
  score_percent: number | null;
  xp_awarded: number | null;
  /** Present only on the `submit` response — set when the score was low enough
   * to auto-open an AI-assisted practice session (see `RemedialSession`). */
  remedial_session_id?: number | null;
}

// ---------- Learning: activities ----------

export type ActivityType = "ASSIGNMENT" | "CHALLENGE" | "TYPING" | "PRACTICAL" | "SPORTS";
export type ActivityStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

export interface ActivitySummary {
  id: number;
  title: string;
  subject: number;
  subject_name: string;
  school_class: number;
  school_class_name: string;
  teacher_name: string;
  activity_type: ActivityType;
  max_xp: number;
  start_date: string | null;
  end_date: string | null;
  status: ActivityStatus;
  submission_count: number;
  created_at: string;
}

export interface ActivityDetail extends ActivitySummary {
  description: string;
}

export interface ActivityResult {
  score_percent: number;
  xp_awarded: number;
  feedback: string;
  graded_at: string;
}

export interface ActivitySubmission {
  id: number;
  activity: number;
  activity_title: string;
  student: number;
  student_name: string;
  content: string;
  attachment: string | null;
  submitted_at: string;
  result: ActivityResult | null;
}

// ---------- Gamification ----------

export type XpSource = "TEST" | "ACTIVITY";

export interface XPTransaction {
  id: number;
  student: number;
  student_name: string;
  amount: number;
  source: XpSource;
  reason: string;
  related_title: string | null;
  created_at: string;
}

export interface StudentLeaderboardEntry {
  rank: number;
  name: string;
  avatar_url: string | null;
  school_class_name: string | null;
  total_xp: number;
}

export interface ClassLeaderboardEntry {
  rank: number;
  name: string;
  total_xp: number;
}

export interface ClassGrowthPoint {
  date: string;
  total_xp: number;
}

export interface ClassGrowthSeries {
  class_id: number;
  class_name: string;
  points: ClassGrowthPoint[];
}

export interface Achievement {
  id: number;
  name: string;
  description: string;
  icon: string;
  condition_type: AchievementConditionType;
  condition_value: number;
  xp_reward: number;
  unlocked: boolean;
  unlocked_at: string | null;
}

export type AchievementConditionType = "FIRST_TEST" | "TEST_COUNT" | "PERFECT_SCORE" | "XP_THRESHOLD" | "STREAK_LENGTH";

export interface AchievementManage {
  id: number;
  name: string;
  description: string;
  icon: string;
  condition_type: AchievementConditionType;
  condition_value: number;
  xp_reward: number;
  is_active: boolean;
}

export interface Streak {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

export interface MyRank {
  rank: number;
  total_students: number;
  class_rank: number | null;
  total_classes: number;
}

// ---------- Director -> teacher tasks ----------

export type TeacherTaskCategory = "ADMINISTRATIVE" | "REPORT" | "MEETING" | "OTHER";

/** Director's view of a task they sent — how many teachers got it, how many are done. */
export interface TeacherTaskSummary {
  id: number;
  title: string;
  description: string;
  category: TeacherTaskCategory;
  category_display: string;
  is_broadcast: boolean;
  assignee_count: number;
  done_count: number;
  created_at: string;
}

/** A teacher's own copy of an assigned task. */
export interface TeacherTaskAssignment {
  id: number;
  task: number;
  title: string;
  description: string;
  category: TeacherTaskCategory;
  category_display: string;
  created_by_name: string;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
}

// ---------- Duels ----------

export type DuelStatus = "ACTIVE" | "COMPLETED";
export type DuelResult = "CHALLENGER" | "OPPONENT" | "DRAW" | null;
export type DuelRole = "challenger" | "opponent" | null;

/** Always framed from "my" side — `my_role`/`my_score_percent` etc. are
 * relative to whoever is asking, never the raw challenger/opponent fields. */
export interface DuelListItem {
  id: number;
  challenger: number;
  challenger_name: string;
  opponent: number;
  opponent_name: string;
  status: DuelStatus;
  result: DuelResult;
  my_role: DuelRole;
  my_score_percent: number | null;
  opponent_score_percent: number | null;
  i_won: boolean | null;
  i_have_submitted: boolean;
  opponent_has_submitted: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface DuelQuestionItem {
  id: number;
  order: number;
  text: string;
  options: TestOption[];
}

export interface DuelRatingInfo {
  rating: number;
  tier: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  win_rate: number;
  student_name?: string;
  school_class_name?: string | null;
}

// ---------- Remedial (AI tutor + practice game after a low test score) ----------

export type RemedialStatus = "PENDING" | "EXPLAINED" | "COMPLETED";

export interface RemedialSession {
  id: number;
  attempt: number | null;
  game_session: number | null;
  /** What the low score came from — a test or a practice game. */
  source: "TEST" | "GAME";
  subject: number;
  subject_name: string;
  /** The test's title, or the game's name for a game-sourced session. */
  test_title: string;
  status: RemedialStatus;
  explanation: string;
  question_count: number;
  score_percent: number | null;
  xp_awarded: number | null;
  created_at: string;
  completed_at: string | null;
}

/** Answer-free, same principle as `TestQuestion` — no `correct_index` until after submit. */
export interface RemedialGameQuestion {
  text: string;
  options: string[];
}

// ---------- Games (self-serve "O'yinlar" section) ----------

export type GameType =
  | "TUG_OF_WAR"
  | "QUIZ"
  | "TOWER_BUILDER"
  | "CODE_BREAKER"
  | "TREASURE_HUNT"
  | "BATTLE_ARENA"
  | "TOWER_DEFENSE"
  | "NEON_RACING";
export type GameDifficulty = "EASY" | "MEDIUM" | "HARD";
export type GameStatus = "ACTIVE" | "COMPLETED";

export interface GameSession {
  id: number;
  subject: number;
  subject_name: string;
  game_type: GameType;
  game_type_display: string;
  status: GameStatus;
  question_count: number;
  /** Server-recorded progress — only non-zero for games that lock answers in one at a time. */
  answered_count: number;
  correct_count: number;
  max_xp: number;
  /** Kodni buzish only: earned segments (null = still locked); the whole code once unlocked. Empty for other games. */
  revealed_code: (string | null)[];
  /** Jang maydoni only: HP / combo / round state, computed server-side. */
  battle: BattleState | null;
  /** Blank for games without levels. */
  difficulty: GameDifficulty | "";
  /** Tower Defense only: waves / enemies / base HP / combo, replayed server-side. */
  defense: DefenseState | null;
  /** Neon Racing only: distances / position / laps / nitro, replayed server-side. */
  race: RaceState | null;
  /** Tower Defense / Neon Racing, once finished: this game's score against the student's previous best. */
  personal_record: { score: number; best_before: number | null; is_record: boolean } | null;
  /** Kodni buzish: lock opened / Xazina ovi: treasure reached — only ever true once the game is over. */
  goal_reached: boolean;
  /** The win threshold for games that have one (Kodni buzish, Xazina ovi); null otherwise. */
  unlock_percent: number | null;
  /** Per-question answer review — only on a finished Minora qurish / Kodni buzish session's detail. */
  review: GameReviewItem[] | null;
  /** Set when a low score opened an AI-tutor session for this game. */
  remedial_session_id: number | null;
  score_percent: number | null;
  xp_awarded: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface BattleRules {
  player_hp: number;
  enemy_hp: number;
  hit_damage: number;
  miss_damage: number;
}

export interface BattleState {
  player_hp: number;
  enemy_hp: number;
  combo: number;
  max_combo: number;
  rounds_played: number;
  over: boolean;
  victory: boolean;
  rules: BattleRules;
}

export type DefenseEnemyType = "scout" | "shield" | "tank" | "boss";
export type DefenseBoost = "POWER_BOOST" | "OVERCHARGE" | null;

export interface DefenseEnemy {
  type: DefenseEnemyType;
  hp: number;
  max_hp: number;
  shield: number;
  max_shield: number;
}

export type DefenseEvent =
  | {
      kind: "hit";
      target: number;
      damage: number;
      shield_hit: boolean;
      killed: boolean;
      wave_cleared: boolean;
      boost: DefenseBoost;
    }
  | { kind: "base_hit"; source: number; damage: number };

export interface DefenseState {
  difficulty: GameDifficulty;
  base_hp: number;
  max_base_hp: number;
  combo: number;
  max_combo: number;
  boost: DefenseBoost;
  /** 1-based; the wave now on the field. */
  wave: number;
  waves_total: number;
  boss_wave: boolean;
  enemies: DefenseEnemy[];
  enemies_defeated: number;
  enemies_total: number;
  waves_cleared: number;
  rounds_played: number;
  over: boolean;
  victory: boolean;
  score: number;
  last_event: DefenseEvent | null;
  /** Presentation only — how briskly enemies move on screen. */
  speed: number;
  tower_damage: number;
}

export interface RaceRacer {
  id: string;
  name: string;
  style: string;
  distance: number;
  is_player: boolean;
}

export interface RaceState {
  difficulty: GameDifficulty;
  laps: number;
  lap: number;
  final_lap: boolean;
  checkpoints_total: number;
  checkpoints_passed: number;
  racers: RaceRacer[];
  position: number;
  field_size: number;
  combo: number;
  max_combo: number;
  /** 0–100 */
  nitro: number;
  nitro_ready: boolean;
  nitro_used: number;
  answered: number;
  finished: boolean;
  last: { correct: boolean; gain: number; nitro: boolean } | null;
  score: number;
}

export interface GameReviewItem {
  text: string;
  options: string[];
  selected_index: number;
  correct_index: number;
  explanation: string;
}

/** Minora qurish / Kodni buzish's `/games/:id/answer/` response — the answer
 * is locked in server-side before the key is revealed. */
export interface LiveAnswerResult {
  correct: boolean;
  /** Kodni buzish: the code character this correct answer unlocked. */
  code_segment: string | null;
  /** Jang maydoni: the battle state after this answer. */
  battle: BattleState | null;
  /** Tower Defense: the defense state after this answer. */
  defense: DefenseState | null;
  /** Neon Racing: the race state after this answer. */
  race: RaceState | null;
  correct_index: number;
  explanation: string;
  answered_count: number;
  correct_count: number;
  xp_earned: number;
}

/** Answer-free, same shape as `RemedialGameQuestion`. */
export interface GameQuestion {
  text: string;
  options: string[];
}

/** Director-only — how many pre-generated questions a subject+class pool
 * currently has. Powers `/director/question-pools`; a game's live start
 * always draws from this pool, never calls Gemini directly.
 */
export interface QuestionPoolStatus {
  subject: number;
  subject_name: string;
  school_class: number;
  school_class_name: string;
  count: number;
}

// ---------- Class progress reports (teacher / director) ----------

export type StudentReportStatus = "GOOD" | "WATCH" | "RISK" | "NO_DATA";

export interface StudentReportRow {
  id: number;
  full_name: string;
  status: StudentReportStatus;
  test_avg: number | null;
  tests_taken: number;
  /** Test average in the period's second half minus the first half; null if either half is empty. */
  test_trend: number | null;
  game_avg: number | null;
  games_played: number;
  attendance_rate: number | null;
  absences: number;
  late: number;
  xp_gained: number;
  weak_subjects: { subject: string; avg: number; results: number }[];
}

export interface ClassReport {
  school_class: { id: number; name: string };
  period_days: number;
  summary: {
    students: number;
    test_avg: number | null;
    tests_taken: number;
    game_avg: number | null;
    games_played: number;
    attendance_rate: number | null;
    xp_gained: number;
    at_risk: number;
    watch: number;
  };
  subjects: { subject: string; avg: number; results: number }[];
  students: StudentReportRow[];
}

export interface ClassReportAISummary {
  summary: string;
  generated_at: string;
}

export interface Partner {
  id: string;
  name: string;
  nameLabel?: string;
  project: string;
  description: string;
  technologies: string[];
  logo: string;
  originalUrl: string;
  utmUrl: string;
  githubUrl: string | null;
  isOwn: boolean;
  websiteLabel?: string;
  telegramUrl?: string;
  telegramLabel?: string;
}
