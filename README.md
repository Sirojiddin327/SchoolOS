# SchoolOS

Maktab uchun CRM + Learning Platform. MVP maqsadi: o'quvchilarni darsga qiziqtirish,
o'qituvchiga davomatni boshqarish imkonini berish, direktorga esa butun maktabni
nazorat qilish imkonini berish.

## Tuzilma

```
schoolOS/
├── backend/    Django + DRF API (JWT auth, role-based permissions)
└── frontend/   React + TypeScript + Tailwind SPA (Director / Teacher / Student dashboards)
```

Batafsil sozlash uchun har bir papkaning o'z README'siga qarang:
[`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md).

## Tezkor boshlash

**Backend**

```bash
cd backend
source venv/bin/activate
cp .env.example .env   # birinchi marta ishga tushirishda
python manage.py migrate
python manage.py createsuperuser   # role=DIRECTOR avtomatik beriladi
python manage.py runserver
```

API hujjatlari: `http://127.0.0.1:8000/api/docs/`

**Frontend**

Node.js (18+) talab qilinadi.

```bash
cd frontend
npm install
npm run dev
```

Vite dev server `/api` so'rovlarini avtomatik `http://127.0.0.1:8000` ga proksi qiladi
(`frontend/vite.config.ts`), shuning uchun backend ham parallel ishlab turishi kerak.

## Rivojlanish bosqichlari

MVP quyidagi tartibda quriladi (har biri alohida bosqich sifatida):

1. ✅ Loyiha skeleti: backend/frontend ajratish, JWT auth, `User.role` (DIRECTOR/TEACHER/STUDENT)
2. ✅ Schools (SchoolClass) + Academics (Subject, Lesson)
3. ✅ Attendance + class-teacher notification (web)
4. ✅ Director/Teacher/Student dashboard API'lari va statistikalar (frontendga ulandi)
5. ✅ School time lock (o'quvchi uchun dars vaqti cheklovi, `apps.school_config`)
6. ✅ Director frontend: Students/Teachers (hisob yaratish+CRUD), Classes (rahbar+roster), Subjects,
   Lessons (filter+CRUD), Attendance (kunlik summary+tarix), Notifications, Settings (school hours)
7. Teacher/Student frontend sahifalari: My Classes/My Lessons, davomat olish UI, Profile
8. Telegram bot + account linking + notification dispatch (Telegram kanali)

Kelajakda (MVP'dan keyin): Activity → Result → avtomatik XP → leaderboard/achievement/streak.
