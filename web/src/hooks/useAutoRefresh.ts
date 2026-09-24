import { useCallback, useEffect, useRef, useState } from 'react'

const INTERVALS = [
  { label: 'Off',  value: 0 },
  { label: '15s',  value: 15 },
  { label: '30s',  value: 30 },
  { label: '60s',  value: 60 },
  { label: '5m',   value: 300 },
]

const STORAGE_KEY = 'cs-lite-refresh-interval'

function loadInterval(): number {
  try {
    const v = parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10)
    if (INTERVALS.some(i => i.value === v)) return v
  } catch {}
  return 30
}

export { INTERVALS }

export function useAutoRefresh(onRefresh: () => void) {
  const [intervalSec, setIntervalSec] = useState<number>(loadInterval)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const refresh = useCallback(() => {
    onRefreshRef.current()
    setLastRefreshed(new Date())
  }, [])

  // Auto-refresh timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (intervalSec > 0) {
      timerRef.current = setInterval(refresh, intervalSec * 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [intervalSec, refresh])

  function changeInterval(v: number) {
    setIntervalSec(v)
    try { localStorage.setItem(STORAGE_KEY, String(v)) } catch {}
  }

  return { intervalSec, changeInterval, refresh, lastRefreshed }
}
