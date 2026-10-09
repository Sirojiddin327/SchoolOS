import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Database,
  FileText,
  Flame,
  Gamepad2,
  GraduationCap,
  LayoutDashboard,
  School,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Swords,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../lib/auth";
import type { Role } from "../types";

interface GuideSection {
  title: string;
  icon: LucideIcon;
  summary: string;
  points: string[];
}

const STUDENT_SECTIONS: GuideSection[] = [
  {
    title: "Boshqaruv paneli",
    icon: LayoutDashboard,
    summary: "Platformaga kirganda birinchi ochiladigan sahifa — bugungi holatingiz bir qarashda.",
    points: [
      "Yuqorida darajangiz, jami XP va kunlik faollik seriyangiz ko'rsatiladi.",
      "\"Sinf reytingi\" va \"Umumiy reyting\" kartalari sizning o'rningizni ko'rsatadi.",
      "\"Reyting yetakchisi\" — hozirda birinchi o'rindagi o'quvchi.",
      "\"Yaqin vazifalar\" — yaqinda topshirish kerak bo'lgan test va topshiriqlar, har birida qancha XP berilishi yozilgan.",
    ],
  },
  {
    title: "Mening sinfim",
    icon: Users,
    summary: "Sinfdoshlaringiz va sinfingiz haqidagi umumiy ma'lumotlar shu yerda.",
    points: [
      "Sinfingizdagi barcha o'quvchilar ro'yxati, ularning hozirgi XP va darajasi ko'rinadi.",
      "Sinf rahbari (klass jamoaviy boshqaruvchi) va sinfingizning umumiy reytingdagi o'rni ham shu yerda.",
    ],
  },
  {
    title: "Darslarim",
    icon: BookOpen,
    summary: "Haftalik dars jadvalingiz va har bir dars bo'yicha holat shu yerda ko'rinadi.",
    points: [
      "Har bir dars uchun fan, o'qituvchi va dars vaqti (boshlanishi va tugashi) ko'rsatilgan.",
      "Dars tugagach, \"Davomatim\" bo'limida shu dars uchun davomat olinganmi yoki yo'q, alohida ko'rinadi.",
      "Past natija ko'rsatgan mavzular bo'yicha yordam uchun AI (Obi) xizmatidan foydalanish tavsiya etiladi.",
    ],
  },
  {
    title: "Davomatim",
    icon: ClipboardCheck,
    summary: "Har bir dars uchun davomat holatini kuzatasiz — dars olinmagani ham aniq ko'rinadi.",
    points: [
      "\"Bugungi darslar\" bo'limida har dars rangli badge bilan belgilanadi:",
      "Yashil \"Davomat olingan\" — o'qituvchi davomatni belgilab bo'lgan.",
      "Qizil \"Davomat olinmagan\" — dars tugagan, lekin o'qituvchi davomatni belgilamagan.",
      "Sariq \"Davomat kutilmoqda\" — dars hozir davom etmoqda, davomat hali belgilanmagan.",
      "Kulrang \"Dars boshlanmadi\" — dars hali boshlanmagan.",
      "O'qituvchi davomatni faqat dars boshlangach belgilay oladi; dars tugashi bilan davomat qulflanadi.",
      "Dars tugashiga 10 daqiqa qolganda hali davomat belgilanmagan bo'lsa, o'qituvchiga avtomatik eslatma yuboriladi.",
      "\"Tarix\" qismida sanani tanlab o'tgan darslardagi davomatingizni ko'rishingiz mumkin.",
    ],
  },
  {
    title: "Testlar",
    icon: FileText,
    summary: "O'qituvchi e'lon qilgan testlarni shu yerdan ishlaysiz.",
    points: [
      "Faqat \"E'lon qilingan\" testlar ochiq bo'ladi — qoralamalar ko'rinmaydi.",
      "Har bir testni faqat bir marta topshirish mumkin — qayta urinib bo'lmaydi.",
      "Ballingiz avtomatik hisoblanadi: XP = (to'g'ri javoblar %) × testning maksimal XP'si.",
      "Test ishlash paytida \"Imtihon rejimi\" faollashadi — ekranni skrinshot qilish va nusxalash cheklanadi (pastda \"Imtihon rejimi\" bo'limiga qarang).",
    ],
  },
  {
    title: "Topshiriqlar",
    icon: ClipboardList,
    summary: "Test bo'lmagan vazifalar — insho, amaliy ish, sport va boshqalar.",
    points: [
      "Javobingizni matn yoki fayl (masalan, daftar sahifasi rasmi) sifatida yuklashingiz mumkin.",
      "Topshiriqni o'qituvchi qo'lda baholaydi, natija va izoh keyin ko'rinadi.",
    ],
  },
  {
    title: "Duellar",
    icon: Swords,
    summary: "Sinfdoshingiz bilan bilim bellashuvi — kim tezroq va aniqroq javob bersa, g'olib.",
    points: [
      "\"+ Yangi duel\" tugmasi orqali sinfingizdagi biron o'quvchini duelga chaqirasiz.",
      "Ikkalangizga bir xil 5 ta savol beriladi; savollar e'lon qilingan testlardan tasodifiy tanlanadi.",
      "G'olibni javoblarning aniqligi va tezligi hal qiladi.",
      "Har bir duel natijasiga ko'ra duelingiz uchun reyting ballari va daraja (tier) o'zgaradi.",
      "\"Duel chempionlari\" ro'yxatida eng kuchli o'quvchilar ko'rinadi.",
      "Duelda javob berish paytida ham \"Imtihon rejimi\" faol bo'ladi.",
    ],
  },
  {
    title: "O'yinlar",
    icon: Gamepad2,
    summary: "Bilimingizni o'yin orqali mustahkamlang — fanni tanlang va o'ynang.",
    points: [
      "Avval 1-fanni tanlaysiz, keyin 2-o'ynashni xohlagan o'yin turini.",
      "Ba'zi o'yinlarda (Tower Defense, Neon Racing) 3-qadamda qiyinlik ham tanlanadi: Oson / O'rta / Qiyin.",
      "Mavjud o'yinlar: Viktorina, Arqon tortish, Minora qurish, Kodni buzish, Xazina ovi, Jang maydoni, Tower Defense va Neon Racing.",
      "Har to'g'ri javob o'yin mexanikasini yaxshilaydi (minoraga qavat, xaritada qadam va h.k.), natija foiz bilan baholanadi.",
      "Past natija ko'rsatsangiz, mavzu bo'yicha AI (Obi) avtomatik yordamni taklif qiladi.",
      "\"So'nggi o'yinlar\" ro'yxatida o'yin tarixingiz va natijalaringiz ko'rinadi.",
      "O'yin paytida \"Imtihon rejimi\" faol bo'ladi — skrinshot va nusxalash cheklanadi.",
    ],
  },
  {
    title: "AI yordamchi (Obi)",
    icon: Sparkles,
    summary: "Tushunmagan mavzuyingizni AI sizga o'rgatib beradi.",
    points: [
      "Tavsiya etilgan yoki fanni o'rganish uchun boshlangan yordam mashg'ulotida AI avval mavzuni tushuntirib beradi.",
      "Keyin \"Arqon tortish\" o'yini orqali bilimingiz tekshiriladi — har to'g'ri javob arqonni o'zingizga tortadi.",
      "Agar natija past bo'lsa, AI mavzuni yana bir bor boshqa usulda tushuntiradi.",
    ],
  },
  {
    title: "Mening XP",
    icon: Trophy,
    summary: "Umumiy tajriba ochkolaringiz va darajangiz shu yerda.",
    points: [
      "XP test, topshiriq, o'yin va duellardan to'planadi.",
      "Hozirgi daraja, keyingi darajagacha progress ham shu yerda ko'rinadi.",
    ],
  },
  {
    title: "Reyting",
    icon: BarChart3,
    summary: "O'quvchilar va sinflar bo'yicha umumiy XP reytingi.",
    points: ["\"O'quvchilar\" va \"Sinflar\" bo'limlari orasida almashtirishingiz mumkin."],
  },
  {
    title: "Yutuqlar",
    icon: Award,
    summary: "Muayyan shartlarni bajarganda avtomatik ochiladigan nishonlar.",
    points: ["Masalan: birinchi test, 100% natija, ma'lum XP chegarasi yoki uzoq faollik seriyasi."],
  },
  {
    title: "Seriya",
    icon: Flame,
    summary: "Ketma-ket necha kun faol bo'lganingizni ko'rsatadi.",
    points: ["Har kuni kamida bitta test yoki topshiriq bajarsangiz, seriyangiz davom etadi."],
  },
  {
    title: "Bildirishnomalar",
    icon: Bell,
    summary: "Yangi test, baholangan topshiriq, davomat eslatmalari va boshqa e'lonlar shu yerda.",
    points: [
      "O'qituvchilarga davomat eslatmalari, test e'lonlari va baholash natijalari haqida bildirishnoma keladi.",
      "Telegram botni ulasangiz, bildirishnomalar telefoningizga ham keladi (Profil bo'limida).",
    ],
  },
  {
    title: "Profil",
    icon: UserCircle,
    summary: "Hisobingiz va ulanishlar shu yerda boshqariladi.",
    points: [
      "Fotosurat (avatar) va shaxsiy ma'lumotlaringizni yangilashingiz mumkin.",
      "Telegram botni ulab, bildirishnomalarni telefoningizga olishingiz mumkin.",
      "Parolingizni ham shu yerdan o'zgartirasiz.",
    ],
  },
  {
    title: "Imtihon rejimi",
    icon: ShieldAlert,
    summary: "Test, duel, o'yin va AI yordamchi paytida ishlaydigan skrinshot/nusxalash himoyasi.",
    points: [
      "Faqat \"ko'rinadigan\" sahifalarda emas — imtihon/yechish ekranlarida himoya yoqilgan.",
      "Sahifani chop etish (PDF) va matnni nusxalash (Ctrl+C / o'ng-tugma) taqiqlangan.",
      "DevTools (F12) ochilganini aniqlashsa, savollar darhol yashiriladi.",
      "Boshqa oynaga yoki ilovaga o'tsangiz, savol yopiladi va faqat qaytishda ochiladi.",
      "Ekranga diagonal suv belgisi (ismingiz va vaqt) joylanadi — olingan skrinshot bo'lsa ham, muallifi aniq ko'rinadi.",
      "Muhim: bu to'liq blok emas, cheklovdir. Telefon yoki kompyuterning sistema darajasidagi skrinshotini brauzer 100% to'xtata olmaydi.",
    ],
  },
];

const TEACHER_SECTIONS: GuideSection[] = [
  {
    title: "Boshqaruv paneli",
    icon: LayoutDashboard,
    summary: "Bugungi darslaringiz va so'nggi o'quvchi natijalari bir joyda.",
    points: [
      "Sinflaringiz, testlaringiz, topshiriqlaringiz va o'qilmagan xabarlar soni yuqorida ko'rinadi.",
      "Bugun uchun rejalashtirilgan darslaringiz ro'yxati ham shu yerda.",
    ],
  },
  {
    title: "Sinflarim",
    icon: Users,
    summary: "Siz sinf rahbari bo'lgan sinf alohida, faqat dars beradigan sinflaringiz pastda.",
    points: [
      "O'z sinfingiz kartasida bugungi davomat: kelgan, kechikkan va kelmaganlar soni + ismlari ko'rsatiladi.",
      "Bu ma'lumot boshqa o'qituvchi sizning sinfingizda davomat belgilashi bilan darhol yangilanadi.",
    ],
  },
  {
    title: "Darslarim",
    icon: BookOpen,
    summary: "Dars jadvalingiz bo'yicha rejalashtirilgan darslar ro'yxati.",
    points: [
      "Har bir dars uchun fan, sinf, vaqt va davomat olinmaganligi holati ko'rinadi.",
      "Ikkinchi (yordamchi) o'qituvchi tayinlangan darslarda ham siz tizimda ko'rsatilgansiz.",
    ],
  },
  {
    title: "Davomat",
    icon: ClipboardCheck,
    summary: "Dars uchun davomatni shu yerdan belgilaysiz — qat'iy vaqt oynasi bor.",
    points: [
      "Davomatni dars boshlanmaganidan 5 daqiqa o'tgach, dars tugagunga qadar belgilash mumkin.",
      "Dars tugashi bilan davomat qulflanadi — keyin tahrirlash (erkin rejimda) mumkin emas.",
      "Har bir o'quvchiga: keldi, kechikdi, kelmadi yoki sababli belgisi qo'yiladi.",
      "Agar dars tugashiga 10 daqiqa qolganda davomat hali belgilanmagan bo'lsa, sizga avtomatik eslatma yuboriladi (sayt + Telegram).",
      "Eslatma faqat bir marta yuboriladi — davomatni belgilasangiz, o'quvchi va direktor \"davomat olingan\" holatini ko'radi.",
      "Agar davomatni belgilamasangiz, dars «davomat olinmagan» bo'lib, o'quvchi va direktor qizil badge bilan buni ko'radi.",
    ],
  },
  {
    title: "Testlar",
    icon: FileText,
    summary: "O'quvchilaringiz uchun test yaratasiz.",
    points: [
      "Savollarni bittalab qo'shasiz, har birida to'g'ri variantni belgilaysiz.",
      "Diqqat: haftasiga 2 martadan kam o'tiladigan fan uchun testda ko'pi bilan 10 ta savol bo'lishi mumkin.",
      "Tayyor bo'lgach \"E'lon qilish\" tugmasi bilan o'quvchilarga ochasiz.",
      "Har bir test bo'yicha natijalarni va AI umumlashtiruvchi xulosani ko'rishingiz mumkin.",
    ],
  },
  {
    title: "Topshiriqlar",
    icon: ClipboardList,
    summary: "Test bo'lmagan vazifalar — insho, amaliy ish va hokazo yaratasiz.",
    points: ["O'quvchi yuborgan javoblarni qo'lda baholaysiz, ball XP'ga avtomatik aylantiriladi."],
  },
  {
    title: "Hisobotlar",
    icon: BarChart3,
    summary: "Sinf bo'yicha o'quvchilar progressi va AI xulosalar.",
    points: ["Har bir o'quvchining test/topshiriq bo'yicha muvaffaqiyati va AI umumlashtiruv hisobot."],
  },
  {
    title: "Vazifalarim",
    icon: Send,
    summary: "Direktor tomonidan sizga yuborilgan ma'muriy vazifalar (yig'ilish, hisobot va h.k.).",
    points: ["Bajargach \"Bajarildi\" tugmasini bosasiz."],
  },
  {
    title: "XP",
    icon: Trophy,
    summary: "O'quvchilarga beriladigan va to'plangan XP haqida ma'lumot.",
    points: ["Test, topshiriq bahosi va o'yinlar orqali XP to'plash tizimini ko'rishingiz mumkin."],
  },
  {
    title: "Bildirishnomalar / Profil",
    icon: Bell,
    summary: "Bildirishnomalar va hisob sozlamalari.",
    points: [
      "Davomat eslatmalari va yangi vazifalar haqida bu yerdan xabar boradi.",
      "Profil bo'limida Telegram botni ulab, bildirishnomalarni telefoningizga olishingiz mumkin.",
    ],
  },
];

const DIRECTOR_SECTIONS: GuideSection[] = [
  {
    title: "Boshqaruv paneli",
    icon: LayoutDashboard,
    summary: "Maktab bo'yicha umumiy statistika: o'quvchilar, o'qituvchilar, sinflar, bugungi davomat.",
    points: [
      "Faol o'quvchilar, o'qituvchilar, sinflar va bugungi davomat haqida umumiy raqamlar.",
      "Eng faol o'quvchi va sinflar reytingi ham shu yerda ko'rinadi.",
    ],
  },
  {
    title: "O'quvchilar",
    icon: Users,
    summary: "O'quvchi hisoblarini yaratish, tahrirlash va boshqarish.",
    points: [
      "Yangi o'quvchi yaratilganda email va parol beriladi; xato kelganda (band email) tekshirib olasiz.",
      "O'quvchini sinfga biriktirish va faollashtirish/o'chirish ham shu yerda.",
    ],
  },
  {
    title: "O'qituvchilar",
    icon: GraduationCap,
    summary: "O'qituvchi hisoblarini yaratish va boshqarish.",
    points: ["Yangi o'qituvchi qo'shish, tahrirlash va faollashtirish/o'chirish shu yerda amalga oshiriladi."],
  },
  {
    title: "Sinflar / Fanlar",
    icon: School,
    summary: "Sinflarga rahbar tayinlash, fanlar ro'yxatini boshqarish.",
    points: [
      "Sinflar: yaratish, sinf rahbari tayinlash, ro'yxatdagi o'quvchilarni ko'rish.",
      "Fanlar: qo'shish/o'chirish; fanning haftalik chastotasi testda savol chegarasini belgilaydi (haftasiga 2 martadan kam — maks. 10 savol).",
    ],
  },
  {
    title: "Darslar",
    icon: ClipboardList,
    summary: "Jadval asosida yaratilgan haqiqiy darslar ro'yxati.",
    points: [
      "Darslar dars jadvali shablonidan avtomatik yaratiladi; kerak bo'lsa qo'lda qo'shish ham mumkin.",
      "Darsga qo'shimcha ikkinchi (yordamchi) o'qituvchi tayinlash mumkin — ikkala o'qituvchi ham tizimda ko'rinadi.",
    ],
  },
  {
    title: "Dars jadvali",
    icon: CalendarDays,
    summary: "Haftalik jadval shabloni — shundan haqiqiy darslar avtomatik yaratiladi.",
    points: [
      "Sinf, fan va o'qituvchini tanlab, haftalik shablonni tuzasiz.",
      "\"Yaratish\" tugmasi bilan shu shablonga asosan haqiqiy darslar bir vaqtda yaratiladi.",
    ],
  },
  {
    title: "Davomat",
    icon: ClipboardCheck,
    summary: "Har qanday sinf va sana bo'yicha davomat holatini ko'rasiz.",
    points: [
      "\"Davomat olinmagan darslar\" bo'limi: dars tugab, davomat olinmagan bo'lsa qizil; dars davom etayotgan bo'lsa sariq badge bilan ko'rinadi.",
      "Har bir dars o'qituvchisi va fani, vaqti bilan jadvalda chiqadi.",
      "Direktor sifatida istalgan vaqtda davomatni tuzatish / to'ldirish (backfill) mumkin — o'qituvchilar uchun bu faqat dars vaqtida cheklangan.",
      "Sana va sinf filtrlari bilan istalgan kun tarixini ko'rishingiz mumkin.",
    ],
  },
  {
    title: "Testlar",
    icon: FileText,
    summary: "Maktabdagi barcha testlar va ularning natijalari.",
    points: [
      "Har bir testning natijalarini o'quvchilar bo'yicha ko'rish mumkin.",
      "\"AI bilan yaratish\": mavzu yozasiz — AI savollarni istalgan o'qituvchi nomidan, fan/sinf va savol sonini tanlab tuzib beradi.",
      "AI testlari o'qituvchi hisobida ko'rinadi va o'sha o'qituvchi ularni e'lon qilishi mumkin.",
    ],
  },
  {
    title: "Vazifa berish",
    icon: Send,
    summary: "O'qituvchilarga ma'muriy vazifa (yig'ilish, hisobot va h.k.) yuborasiz.",
    points: ["Bitta o'qituvchiga yoki bir vaqtda hammasiga yuborish mumkin — kim bajarganini shu yerdan kuzatasiz."],
  },
  {
    title: "Hisobotlar",
    icon: BarChart3,
    summary: "Sinf va o'quvchilar bo'yicha progress hisobotlari.",
    points: ["Har bir o'quvchi muvaffaqiyati va AI tomonidan tayyorlangan umumlashtiruvchi xulosa ko'rinadi."],
  },
  {
    title: "XP va reyting",
    icon: Trophy,
    summary: "Maktab bo'yicha eng faol o'quvchi va sinflarni ko'rasiz.",
    points: ["Tanlangan davr va sinf bo'yicha o'sish grafigi ham shu yerda."],
  },
  {
    title: "Yutuqlar",
    icon: Award,
    summary: "O'quvchilar avtomatik qo'lga kiritadigan nishonlarni yaratasiz va sozlaysiz.",
    points: ["Yangi yutuq shartini (test, XP, seriya) belgilab qo'shishingiz mumkin."],
  },
  {
    title: "Savollar ombori",
    icon: Database,
    summary: "AI tomonidan yaratilgan savollar zaxirasi.",
    points: ["Testlar va o'yinlar uchun tayyor savollar ombori; kerakli savollarni tanlab ishlatish mumkin."],
  },
  {
    title: "Bildirishnomalar",
    icon: Bell,
    summary: "Maktab bo'yicha barcha bildirishnomalarni ko'rasiz.",
    points: ["Davomat eslatmalari va boshqa tizim xabarlari shu yerda to'planadi."],
  },
  {
    title: "Profil",
    icon: UserCircle,
    summary: "Hisobingiz va ulanishlar.",
    points: ["Profil ma'lumotlari, avatar va Telegram ulanish shu yerda boshqariladi."],
  },
  {
    title: "Sozlamalar",
    icon: Settings,
    summary: "Maktab vaqti asosidagi cheklovlar va umumiy sozlamalar.",
    points: [
      "Dars vaqtida o'quvchilarga platformani qisman/yopiq qiladigan soat cheklovlari shu yerdan boshqariladi.",
      "Boshqa umumiy maktab sozlamalari ham shu bo'limda.",
    ],
  },
];

const SECTIONS_BY_ROLE: Record<Role, GuideSection[]> = {
  STUDENT: STUDENT_SECTIONS,
  TEACHER: TEACHER_SECTIONS,
  DIRECTOR: DIRECTOR_SECTIONS,
};

export function GuidePage() {
  const { user } = useAuth();
  const sections = SECTIONS_BY_ROLE[user?.role ?? "STUDENT"];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = sections[activeIndex];

  return (
    <div className="space-y-6">
      <PageHeader title="Qo'llanma" />

      <div className="rounded-2xl bg-brand-600 p-6 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Compass size={22} />
          </span>
          <div>
            <p className="text-lg font-bold">Platforma bo'yicha qo'llanma</p>
            <p className="text-sm text-white/80">
              Bu yerda har bir bo'lim nima uchun kerakligini bilib olasiz. Chapdagi ro'yxatdan bo'limni tanlang.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-1">
          {sections.map((section, index) => (
            <button
              key={section.title}
              onClick={() => setActiveIndex(index)}
              className={`flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                index === activeIndex
                  ? "bg-brand-600 text-white"
                  : "hover-glow text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  index === activeIndex
                    ? "bg-white/20"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {index + 1}
              </span>
              {section.title}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <active.icon size={19} />
            </span>
            <div>
              <p className="text-lg font-bold text-ink">{active.title}</p>
              <p className="text-sm text-ink-muted">{active.summary}</p>
            </div>
          </div>
          {active.points.length > 0 && (
            <ul className="space-y-2">
              {active.points.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}