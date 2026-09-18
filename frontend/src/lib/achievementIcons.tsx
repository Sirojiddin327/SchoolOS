import {
  Award,
  BookOpen,
  Crown,
  Flame,
  Footprints,
  Gem,
  GraduationCap,
  Medal,
  Percent,
  Rocket,
  Shield,
  Star,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * `Achievement.icon` stores a short key (e.g. "flame"). Older rows may still
 * hold a legacy emoji from before the icon picker existed, so those map here
 * too rather than needing a backfill.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  trophy: Trophy,
  target: Target,
  percent: Percent,
  zap: Zap,
  flame: Flame,
  star: Star,
  medal: Medal,
  award: Award,
  crown: Crown,
  rocket: Rocket,
  footprints: Footprints,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  gem: Gem,
  shield: Shield,
  "🎯": Target,
  "💯": Percent,
  "⚡": Zap,
  "🔥": Flame,
  "🏆": Trophy,
  "🏃": Footprints,
  "⭐": Star,
  "🥇": Medal,
};

export const ACHIEVEMENT_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "trophy", label: "Kubok", icon: Trophy },
  { value: "medal", label: "Medal", icon: Medal },
  { value: "award", label: "Mukofot", icon: Award },
  { value: "star", label: "Yulduz", icon: Star },
  { value: "crown", label: "Toj", icon: Crown },
  { value: "target", label: "Nishon", icon: Target },
  { value: "percent", label: "Foiz", icon: Percent },
  { value: "zap", label: "Chaqmoq", icon: Zap },
  { value: "flame", label: "Olov", icon: Flame },
  { value: "rocket", label: "Raketa", icon: Rocket },
  { value: "footprints", label: "Izlar", icon: Footprints },
  { value: "book-open", label: "Kitob", icon: BookOpen },
  { value: "graduation-cap", label: "Bitiruv qalpog'i", icon: GraduationCap },
  { value: "gem", label: "Olmos", icon: Gem },
  { value: "shield", label: "Qalqon", icon: Shield },
];

export function getAchievementIcon(icon: string | undefined): LucideIcon {
  return (icon && ICON_MAP[icon]) || Trophy;
}

export function AchievementIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = getAchievementIcon(icon);
  return <Icon className={className} />;
}
