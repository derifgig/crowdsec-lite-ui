import { useEffect, useState } from 'react'
import { getHealth, type HealthStatus } from '../api/client'

export default function StatusBar() {
  const [status, setStatus] = useState<HealthStatus | null>(null)

  async function check() {
    try {
      const s = await getHealth()
      setStatus(s)
    } catch {
      setStatus({ ok: false, lapi_connected: false })
    }
  }

  useEffect(() => {
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [])

  const connected = status?.lapi_connected ?? null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%',
        background: connected === null ? 'var(--text-dim)' : connected ? 'var(--success)' : 'var(--danger)',
        flexShrink: 0,
      }} />
      <span>
        {connected === null ? 'Checking…' : connected ? 'LAPI Connected' : 'LAPI Offline'}
      </span>
    </div>
  )
}
