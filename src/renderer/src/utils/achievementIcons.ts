import {
  Archive,
  Award,
  Bug,
  Clock,
  Layers,
  Moon,
  Play,
  Puzzle,
  Rocket,
  Server,
  Sparkles,
  Sunrise,
  Timer,
  Wallpaper,
  type LucideIcon
} from 'lucide-react'
import type { AchievementId } from '../../../shared/achievements'

/** 每个成就的图标 */
export const ACHIEVEMENT_ICONS: Record<AchievementId, LucideIcon> = {
  first_launch: Rocket,
  modded: Puzzle,
  continue_world: Play,
  join_server: Server,
  night_owl: Moon,
  early_bird: Sunrise,
  marathon: Timer,
  hours_10: Clock,
  hours_100: Award,
  explorer: Layers,
  crash: Bug,
  backup: Archive,
  ai_doctor: Sparkles,
  decorator: Wallpaper
}
