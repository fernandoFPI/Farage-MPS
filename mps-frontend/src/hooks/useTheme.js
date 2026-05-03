import { useEffect, useState } from 'react'

const STORAGE_KEY = 'mps_theme'

function resolveInitial() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(isDark) {
  document.documentElement.classList.toggle('dark', isDark)
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const initial = resolveInitial()
    applyTheme(initial === 'dark')
    return initial === 'dark'
  })

  useEffect(() => {
    applyTheme(isDark)
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  const toggle = () => setIsDark((v) => !v)
  return { isDark, toggle }
}
