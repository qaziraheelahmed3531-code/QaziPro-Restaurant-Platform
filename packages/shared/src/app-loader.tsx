"use client"

import { useEffect, useRef, useState } from "react"

export function AppLoader({
  active = true,
  delay = 150,
  minimumVisible = 220,
  label = "Loading",
  className = "",
}: {
  active?: boolean
  delay?: number
  minimumVisible?: number
  label?: string
  className?: string
}) {
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    if (active && !visible) {
      timer = setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, delay)
    } else if (!active && visible) {
      timer = setTimeout(() => setVisible(false), Math.max(0, minimumVisible - (Date.now() - shownAt.current)))
    }
    return () => { if (timer) clearTimeout(timer) }
  }, [active, delay, minimumVisible, visible])

  if (!visible) return null
  return <span className={`app-loader ${className}`.trim()} role="status" aria-label={label}><i aria-hidden="true" /></span>
}
