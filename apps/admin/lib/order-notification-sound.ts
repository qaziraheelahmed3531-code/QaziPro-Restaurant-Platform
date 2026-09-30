// Media playback starts asynchronously. Creating a Web Audio device inside the
// first pointer event stalled POS input on Windows.
let sound: HTMLAudioElement | null = null
let chime: string | null = null
let warming: Promise<void> | null = null

function chimeSource() {
  if (chime) return chime
  const rate = 16000, samples = 4960
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index)
  }
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE")
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, "data"); view.setUint32(40, samples * 2, true)
  for (let index = 0; index < samples; index++) {
    const time = index / rate
    let value = 0
    for (const [frequency, delay] of [[740, 0], [960, 0.13]]) {
      const elapsed = time - delay
      if (elapsed >= 0 && elapsed < 0.18) {
        const envelope = Math.min(elapsed / 0.015, 1) * Math.exp(-elapsed * 32)
        value += Math.sin(2 * Math.PI * frequency * elapsed) * envelope * 0.09
      }
    }
    view.setInt16(44 + index * 2, Math.round(value * 32767), true)
  }
  chime = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`
  return chime
}

function player() {
  if (typeof window === "undefined") return null
  if (!sound) {
    sound = new Audio(chimeSource())
    sound.preload = "auto"
  }
  return sound
}

export function unlockOrderNotificationSound(): Promise<void> {
  if (warming) return warming
  const audio = player()
  if (!audio) return Promise.resolve()
  audio.volume = 0
  warming = audio.play().catch(() => undefined).then(() => {
    audio.pause()
    audio.currentTime = 0
    audio.volume = 1
  })
  return warming
}

export async function playOrderNotificationSound(url?: string | null) {
  await unlockOrderNotificationSound()
  const audio = player()
  if (!audio) return false
  const fallback = chimeSource()
  audio.src = url || fallback
  audio.currentTime = 0
  try {
    await audio.play()
    return true
  } catch {
    if (!url) return false
    // A bad custom file can fall back; blocked audio is never audible success.
    audio.src = fallback
    try { await audio.play(); return true } catch { return false }
  }
}
