import { useCallback, useEffect, useRef, useState } from 'react'
import { getAlerts, type Alert } from '../api/client'
import BanModal from '../components/BanModal'
import Pagination from '../components/Pagination'
import RefreshBar from '../components/RefreshBar'
import { useAutoRefresh } from '../hooks/useAutoRefresh'

const SINCE_OPTIONS = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '48h', value: '48h' },
  { label: '7d', value: '168h' },
]

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} style={{ padding: '10px 12px' }}>
          <div style={{
            height: '14px',
            background: 'var(--skeleton)',
            borderRadius: '4px',
            animation: 'skeleton-pulse 1.5s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  )
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const [since, setSince] = useState('168h')
  const [filterIp, setFilterIp] = useState('')
  const [filterScenario, setFilterScenario] = useState('')
  // Applied filter values (only updated on search)
  const [appliedIp, setAppliedIp] = useState('')
  const [appliedScenario, setAppliedScenario] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null)
  const [banModalOpen, setBanModalOpen] = useState(false)
  const [banModalIp, setBanModalIp] = useState('')

  const fetchIdRef = useRef(0)

  const fetchAlerts = useCallback(async (
    p: number, s: string, ip: string, scenario: string
  ) => {
    const id = ++fetchIdRef.current
    setLoading(true)
    setError(null)
    try {
      const data = await getAlerts({ page: p, page_size: pageSize, since: s, ip: ip || undefined, scenario: scenario || undefined })
      if (id !== fetchIdRef.current) return
      setAlerts(data.alerts ?? [])
      setTotal(data.total)
    } catch (err) {
      if (id !== fetchIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load alerts.')
    } finally {
      if (id === fetchIdRef.current) setLoading(false)
    }
  }, [pageSize])

  const { intervalSec, changeInterval, refresh, lastRefreshed } = useAutoRefresh(
    useCallback(() => fetchAlerts(page, since, appliedIp, appliedScenario), [fetchAlerts, page, since, appliedIp, appliedScenario])
  )

  useEffect(() => {
    fetchAlerts(page, since, appliedIp, appliedScenario)
  }, [page, since, appliedIp, appliedScenario, fetchAlerts])

  function applySearch() {
    setAppliedIp(filterIp)
    setAppliedScenario(filterScenario)
    setPage(1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applySearch()
  }

  function handleSinceChange(value: string) {
    setSince(value)
    setPage(1)
  }

  function openBanModal(ip: string, e: React.MouseEvent) {
    e.stopPropagation()
    setBanModalIp(ip)
    setBanModalOpen(true)
  }

  function toggleRow(id: number) {
    setSelectedAlertId(prev => (prev === id ? null : id))
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const inputStyle: React.CSSProperties = {
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '13px',
    color: 'var(--text-base)',
    outline: 'none',
  }

  const selectStyle: React.CSSProperties = {
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '13px',
    color: 'var(--text-base)',
    outline: 'none',
  }

  return (
    <>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={{ background: 'var(--bg-base)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Header & Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-base)', margin: 0, marginRight: 'auto' }}>
            Alerts
          </h1>

          <select
            value={since}
            onChange={e => handleSinceChange(e.target.value)}
            style={selectStyle}
          >
            {SINCE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <input
            type="text"
            value={filterIp}
            onChange={e => setFilterIp(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter by IP…"
            style={{ ...inputStyle, width: '160px' }}
          />

          <input
            type="text"
            value={filterScenario}
            onChange={e => setFilterScenario(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter by scenario…"
            style={{ ...inputStyle, width: '192px' }}
          />

          <button
            onClick={applySearch}
            style={{
              background: 'var(--btn-secondary)',
              color: 'var(--text-base)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Search
          </button>

          <RefreshBar
            intervalSec={intervalSec}
            onChangeInterval={changeInterval}
            onRefresh={refresh}
            lastRefreshed={lastRefreshed}
            loading={loading}
          />
        </div>

        {/* Stats */}
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} alert${total !== 1 ? 's' : ''}`}
        </p>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: 'var(--danger-bg)', border: '1px solid var(--danger)',
            borderRadius: '6px', padding: '10px 14px',
            fontSize: '13px', color: 'var(--danger)',
          }}>
            <span>{error}</span>
            <button
              onClick={() => fetchAlerts(page, since, appliedIp, appliedScenario)}
              style={{
                marginLeft: 'auto', background: 'var(--btn-danger)', color: '#fff',
                border: 'none', borderRadius: '5px', padding: '4px 10px',
                fontSize: '12px', cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflowX: 'auto',
        }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Date', 'IP', 'Country', 'AS', 'Scenario', 'Events', 'Decision', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', fontWeight: 500,
                    color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && alerts.length === 0 && (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              )}
              {!loading && !error && alerts.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No alerts found.
                  </td>
                </tr>
              )}
              {alerts.map(alert => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  selected={selectedAlertId === alert.id}
                  onToggle={() => toggleRow(alert.id)}
                  onBan={e => openBanModal(alert.source?.ip || alert.source?.value || '', e)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !error && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}

        <BanModal
          open={banModalOpen}
          initialIp={banModalIp}
          onClose={() => setBanModalOpen(false)}
          onSuccess={() => fetchAlerts(page, since, appliedIp, appliedScenario)}
        />
      </div>
    </>
  )
}

interface AlertRowProps {
  alert: Alert
  selected: boolean
  onToggle: () => void
  onBan: (e: React.MouseEvent) => void
}

function AlertRow({ alert, selected, onToggle, onBan }: AlertRowProps) {
  const [hovered, setHovered] = useState(false)

  const decisionType = alert.decisions?.[0]?.type
  const isBan = decisionType === 'ban'

  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          background: selected ? 'var(--row-selected)' : hovered ? 'var(--row-hover)' : 'transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <td style={{ padding: '9px 12px', color: 'var(--text-base)', whiteSpace: 'nowrap' }}>
          {formatDate(alert.start_at)}
        </td>
        <td style={{ padding: '9px 12px', fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: 'var(--text-base)' }}>
          {alert.source?.ip || alert.source?.value || '—'}
        </td>
        <td style={{ padding: '9px 12px', color: 'var(--text-base)' }}>
          {alert.source?.cn || '—'}
        </td>
        <td style={{ padding: '9px 12px', color: 'var(--text-base)', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {alert.source?.as_name
            ? `AS${alert.source.as_number} ${alert.source.as_name}`
            : '—'}
        </td>
        <td style={{ padding: '9px 12px', color: 'var(--text-base)', maxWidth: '16rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {alert.scenario}
        </td>
        <td style={{ padding: '9px 12px', color: 'var(--text-base)', textAlign: 'right' }}>
          {alert.events_count}
        </td>
        <td style={{ padding: '9px 12px' }}>
          {alert.decisions && alert.decisions.length > 0 ? (
            <span style={{
              display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '11px',
              background: isBan ? 'var(--badge-ban-bg)' : 'var(--badge-captcha-bg)',
              color: isBan ? 'var(--badge-ban-text)' : 'var(--badge-captcha-text)',
              border: `1px solid ${isBan ? 'var(--badge-ban-border)' : 'var(--badge-captcha-border)'}`,
            }}>
              {decisionType}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </td>
        <td style={{ padding: '9px 12px' }}>
          <button
            onClick={onBan}
            style={{
              background: 'var(--btn-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Ban
          </button>
        </td>
      </tr>

      {selected && (
        <tr>
          <td colSpan={8} style={{ padding: '16px', background: 'var(--bg-raised)' }}>
            <AlertDetail alert={alert} />
          </td>
        </tr>
      )}
    </>
  )
}

function AlertDetail({ alert }: { alert: Alert }) {
  const sectionHeader: React.CSSProperties = {
    color: 'var(--text-muted)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
    marginTop: 0,
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', fontSize: '13px' }}>
      <div>
        <h3 style={sectionHeader}>Alert Details</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <Row label="ID" value={String(alert.id)} />
          <Row label="Scenario" value={alert.scenario} />
          <Row label="Message" value={alert.message} />
          <Row label="Start" value={alert.start_at} />
          <Row label="Stop" value={alert.stop_at} />
          <Row label="Events" value={String(alert.events_count)} />
          <Row label="Simulated" value={alert.simulated ? 'Yes' : 'No'} />
        </div>
      </div>

      <div>
        <h3 style={sectionHeader}>Source</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <Row label="IP" value={alert.source?.ip || alert.source?.value} />
          <Row label="Range" value={alert.source?.range} />
          <Row label="Country" value={alert.source?.cn} />
          <Row label="AS" value={alert.source?.as_name ? `AS${alert.source.as_number} ${alert.source.as_name}` : undefined} />
          <Row label="Scope" value={alert.source?.scope} />
        </div>
      </div>

      {alert.decisions && alert.decisions.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h3 style={sectionHeader}>Decisions</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Type', 'Scope', 'Value', 'Duration', 'Origin'].map(h => (
                    <th key={h} style={{ textAlign: 'left', paddingBottom: '4px', paddingRight: '16px', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alert.decisions.map(d => (
                  <tr key={d.id}>
                    <td style={{ paddingRight: '16px', paddingTop: '2px', paddingBottom: '2px', color: 'var(--text-base)' }}>{d.type}</td>
                    <td style={{ paddingRight: '16px', paddingTop: '2px', paddingBottom: '2px', color: 'var(--text-base)' }}>{d.scope}</td>
                    <td style={{ paddingRight: '16px', paddingTop: '2px', paddingBottom: '2px', color: 'var(--text-base)', fontFamily: 'ui-monospace, monospace' }}>{d.value}</td>
                    <td style={{ paddingRight: '16px', paddingTop: '2px', paddingBottom: '2px', color: 'var(--text-base)' }}>{d.duration}</td>
                    <td style={{ paddingRight: '16px', paddingTop: '2px', paddingBottom: '2px', color: 'var(--text-base)' }}>{d.origin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alert.meta && alert.meta.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h3 style={sectionHeader}>Metadata</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '2px 32px' }}>
            {alert.meta.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{m.key}:</span>
                <span style={{ color: 'var(--text-base)', wordBreak: 'break-all' }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
      <span style={{ color: 'var(--text-muted)', width: '80px', flexShrink: 0 }}>{label}:</span>
      <span style={{ color: 'var(--text-base)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}
