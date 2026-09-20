export const MOTION_DURATION = {
  fast: 0.14,
  normal: 0.22,
  drawer: 0.35,
  hero: 0.65,
  page: 0.18,
} as const

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const

export const HERO_TRANSITIONS = {
  Fast: 350,
  Normal: 500,
  Smooth: 650,
} as const

export type HeroTransitionName = keyof typeof HERO_TRANSITIONS

export function heroTransitionName(duration: number): HeroTransitionName {
  if (duration <= 425) return "Fast"
  if (duration <= 575) return "Normal"
  return "Smooth"
}
