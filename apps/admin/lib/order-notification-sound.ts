let context: AudioContext | null = null

function audioContext() {
  if (typeof window === "undefined") return null
  context ??= new AudioContext()
  return context
}

export async function unlockOrderNotificationSound() {
  const audio = audioContext()
  if (!audio) return
  if (audio.state === "suspended") await audio.resume().catch(() => undefined)
}

function fallbackChime() {
  const audio = audioContext()
  if (!audio || audio.state !== "running") return
  const start = audio.currentTime
  for (const [frequency, delay] of [[740, 0], [960, 0.13]] as const) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start + delay)
    gain.gain.exponentialRampToValueAtTime(0.09, start + delay + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.16)
    oscillator.connect(gain)
    gain.connect(audio.destination)
    oscillator.start(start + delay)
    oscillator.stop(start + delay + 0.18)
  }
}

export async function playOrderNotificationSound(url?: string | null) {
  await unlockOrderNotificationSound()
  if (url) {
    try {
      const sound = new Audio(url)
      sound.preload = "auto"
      sound.volume = 1
      await sound.play()
      return
    } catch { /* Use the built-in chime when a custom file is unavailable. */ }
  }
  fallbackChime()
}
