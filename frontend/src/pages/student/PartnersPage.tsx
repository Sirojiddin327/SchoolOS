import {
  ExternalLink,
  GitBranch,
  Building2,
  Globe,
  Star,
  Phone,
  Send,
} from "lucide-react";

import { Card } from "../../components/Surface";

const PARTNERS = [
  {
    id: "dilyorbek_abdujabborov",
    name: "Dilyorbek Abdujabborov",
    project: "CEFRify",
    description: "CEFR standartlariga moslashtirilgan ingliz tili o'rganish platformasi. Testlar, darslar va progress kuzatuvi.",
    technologies: ["React", "Node.js", "PostgreSQL", "Tailwind"],
    logo: "https://cefrify.uz/favicon.ico",
    originalUrl: "https://cefrify.uz/",
    utmUrl: "https://cefrify.uz/?utm_source=schoolos&utm_medium=partner&utm_campaign=partners&utm_content=dilyorbek_abdujabborov",
    githubUrl: null,
    isOwn: false,
  },
{
        id: "akramov_biloliddin",
        name: "Akramov Biloliddin",
        project: "LifeEngine",
        description: "Shaxsiy samaradorlik va maqsadlarni boshqarish tizimi. Kundalik rejalar, odatlar va progress tahlili.",
        technologies: ["React", "TypeScript", "Vercel", "Supabase"],
        logo: "https://lifeengine-jdyg.vercel.app/icon.svg",
        originalUrl: "https://lifeengine-jdyg.vercel.app/",
        utmUrl: "https://lifeengine-jdyg.vercel.app/?utm_source=schoolos&utm_medium=partner&utm_campaign=partners&utm_content=akramov_biloliddin",
        githubUrl: null,
        isOwn: false,
      },
  {
    id: "kutubxona",
    name: "Muhammadaziz Yunusov",
    nameLabel: "Hamkor / loyiha muallifi",
    project: "Kutubxona",
    description:
      "O'quvchilar kutubxonaga oid arizalarni Telegram bot orqali yuboradi. Ariza topshirish bir necha soniyada, qo'shimcha ilovasiz.",
    technologies: ["Telegram Bot", "Ariza tizimi", "Web"],
    logo: "/kutubxona-logo.svg",
    originalUrl: "https://kutubxona.sharqsoft.uz/",
    utmUrl:
      "https://kutubxona.sharqsoft.uz/?utm_source=schoolos&utm_medium=partner&utm_campaign=partners&utm_content=kutubxona",
    githubUrl: null,
    isOwn: false,
    websiteLabel: "Kutubxonaga kirish",
    telegramUrl: "https://t.me/kutubxonaschoolbot",
    telegramLabel: "Ariza topshirish",
  },
];

function PartnerCard({ partner }: { partner: typeof PARTNERS[0] }) {
  const getInitials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Card className="flex flex-col h-full overflow-hidden hover:shadow-lg transition-shadow duration-200 group">
      <div className="flex items-start gap-4 p-5 border-b border-line-soft">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 ring-1 ring-inset ring-brand-500/20">
          {partner.logo ? (
            partner.logo.startsWith("http") ? (
              <img src={partner.logo} alt={partner.project} className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <img src={partner.logo} alt={partner.project} className="h-8 w-8" />
            )
          ) : (
            <span className="text-xl font-bold text-brand-600 dark:text-brand-400">{getInitials(partner.project)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-ink truncate">{partner.project}</h3>
            {partner.isOwn && (
              <span className="flex h-5 shrink-0 items-center gap-1 rounded bg-amber-500/10 px-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                <Star size={10} /> Mening loyiham
              </span>
            )}
          </div>
          {partner.nameLabel && (
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              {partner.nameLabel}
            </p>
          )}
          <p className="mt-1 text-sm text-ink-muted">{partner.name}</p>
        </div>
      </div>

      <div className="flex-1 p-5">
        <p className="text-sm leading-relaxed text-ink-muted">{partner.description}</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {partner.technologies.map((tech) => (
            <span
              key={tech}
              className="inline-flex items-center gap-1 rounded-lg bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-ink-subtle ring-1 ring-inset ring-line"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft bg-surface-raised/50 p-4">
        <a
          href={partner.utmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm flex-1 justify-center gap-2"
        >
          <ExternalLink size={14} />
          {partner.websiteLabel ?? "Loyihani ko'rish"}
        </a>
        {partner.telegramUrl && (
          <a
            href={partner.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm gap-2"
          >
            <Send size={14} />
            {partner.telegramLabel ?? "Telegram bot"}
          </a>
        )}
        {!partner.telegramUrl && partner.githubUrl && (
          <a
            href={partner.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm gap-2"
          >
            <GitBranch size={14} />
            GitHub
          </a>
        )}
        {!partner.telegramUrl && !partner.githubUrl && (
          <a
            href={partner.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm gap-2 text-ink-muted hover:text-brand-600"
          >
            <Globe size={14} />
            Sayt
          </a>
        )}
      </div>
    </Card>
  );
}

export function StudentPartnersPage() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="partners-heading" className="space-y-6">
        <header>
          <h1 id="partners-heading" className="text-2xl font-bold tracking-tight text-ink">
            Hamkorlar
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            SchoolOS bilan hamkorlik qilayotgan professional loyihalar va ularning yaratuvchilari.
            Bu oddiy reklama emas — professional collaboration bo'limi.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {PARTNERS.map((partner) => (
            <PartnerCard key={partner.id} partner={partner} />
          ))}
        </div>

        <Card className="p-6 bg-brand-500/5 ring-1 ring-inset ring-brand-500/10">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                <Building2 size={18} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="font-semibold text-ink">Hamkor bo'lishni xohlaysizmi?</p>
                <p className="text-sm text-ink-muted">
                  SchoolOS asoschilari bilan bog'laning va hamkorlik imkoniyatlari muhokama qilin.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center gap-4">
              <a
                href="tel:+998905330644"
                className="btn btn-primary gap-2 flex items-center justify-center"
              >
                <Phone size={14} />
                +998 90 533 06 44
              </a>
              <a
                href="tel:+998905330644"
                className="btn btn-secondary gap-2 flex items-center justify-center"
              >
                <Phone size={14} />
                Aloqa qilish
              </a>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}