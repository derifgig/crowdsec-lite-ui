import { useEffect, useState } from 'react'
import { getHealth, type HealthStatus } from '../api/client'

export default function StatusBar() {
  const [status, setStatus] = useState<HealthStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const s = await getHealth()
        if (!cancelled) setStatus(s)
      } catch {
        if (!cancelled) setStatus({ ok: false, lapi_connected: false, error: 'unreachable' })
      }
    }

    check()
    const interval = setInterval(check, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const connected = status?.lapi_connected === true

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`}
      />
      <span className={connected ? 'text-green-400' : 'text-red-400'}>
        {connected ? 'LAPI Connected' : 'LAPI Offline'}
      </span>
    </div>
  )
}
