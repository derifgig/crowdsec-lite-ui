import { INTERVALS } from '../hooks/useAutoRefresh'

interface Props {
  intervalSec: number
  onChangeInterval: (v: number) => void
  onRefresh: () => void
  lastRefreshed: Date | null
  loading: boolean
}

export default function RefreshBar({ intervalSec, onChangeInterval, onRefresh, lastRefreshed, loading }: Props) {
  const timeStr = lastRefreshed
    ? lastRefreshed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      {timeStr && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {timeStr}
        </span>
      )}

      <select
        value={intervalSec}
        onChange={e => onChangeInterval(Number(e.target.value))}
        title="Auto-refresh interval"
        style={{
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          color: 'var(--text-muted)',
          borderRadius: '6px',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {INTERVALS.map(i => (
          <option key={i.value} value={i.value}>
            {i.value === 0 ? '⟳ Off' : `⟳ ${i.label}`}
          </option>
        ))}
      </select>

      <button
        onClick={onRefresh}
        disabled={loading}
        title="Refresh now"
        style={{
          background: 'var(--btn-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--text-base)',
          borderRadius: '6px',
          padding: '4px 10px',
          fontSize: '13px',
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.5 : 1,
          transition: 'background 0.15s',
          lineHeight: 1.4,
        }}
      >
        {loading ? '…' : '↻'}
      </button>
    </div>
  )
}
