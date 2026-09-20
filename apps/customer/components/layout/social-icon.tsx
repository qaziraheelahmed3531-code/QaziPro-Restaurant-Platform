import { socialIcons } from "@italian-pizza/shared/social-icons"
export function SocialIcon({ platform }: { platform: string }) {
  const icon = Object.entries(socialIcons).find(([name]) => name.toLowerCase() === platform.toLowerCase())?.[1]
  return icon ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={icon.path} /></svg> : null
}
