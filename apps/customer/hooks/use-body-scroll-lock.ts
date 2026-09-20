"use client"

import { useEffect } from "react"

let activeLocks = 0
let previousOverflow = ""

function acquireBodyScrollLock() {
  if (activeLocks === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }
  activeLocks += 1

  let released = false
  return () => {
    if (released) return
    released = true
    activeLocks = Math.max(0, activeLocks - 1)
    if (activeLocks === 0) {
      document.body.style.overflow = previousOverflow
      previousOverflow = ""
    }
  }
}

export function useBodyScrollLock(locked: boolean, releaseDelay = 0) {
  useEffect(() => {
    if (!locked) return
    const release = acquireBodyScrollLock()
    return () => { if (releaseDelay) window.setTimeout(release, releaseDelay); else release() }
  }, [locked, releaseDelay])
}
