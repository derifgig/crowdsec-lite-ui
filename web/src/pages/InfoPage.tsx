import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getInfo, type InfoResult } from '../api/client'
import RefreshBar from '../components/RefreshBar'
import { useAutoRefresh } from '../hooks/useAutoRefresh'

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '20px 24px',
    }}>
      <div style={{ height: '12px', width: '40%', background: 'var(--skeleton)', borderRadius: '4px', marginBottom: '12px', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: '32px', width: '60%', background: 'var(--skeleton)', borderRadius: '4px', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
    </div>
  )
}

function SkeletonTable() {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ padding: '10px 12px', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1, height: '14px', background: 'var(--skeleton)', borderRadius: '4px', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: '40px', height: '14px', background: 'var(--skeleton)', borderRadius: '4px', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
        </div>
      ))}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number | string
  danger?: boolean
  text?: boolean
  to?: string
}

function StatCard({ label, value, danger, text, to }: StatCardProps) {
  const navigate = useNavigate()
  const isRed = danger && typeof value === 'number' && value > 0
  const display = text ? value : typeof value === 'number' ? value.toLocaleString() : value
  const fontSize = text ? '18px' : '32px'
  const clickable = Boolean(to)
  return (
    <div
      onClick={to ? () => navigate(to) : undefined}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '20px 24px',
        cursor: clickable ? 'pointer' : 'default',
        transition: clickable ? 'border-color 0.15s, background 0.15s' : undefined,
      }}
      onMouseEnter={clickable ? e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'
        ;(e.currentTarget as HTMLDivElement).style.background = 'var(--row-hover)'
      } : undefined}
      onMouseLeave={clickable ? e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'
      } : undefined}
    >
      <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        {label}{clickable && <span style={{ marginLeft: '4px', opacity: 0.5 }}>→</span>}
      </div>
      <div style={{ fontSize, fontWeight: 700, color: isRed ? 'var(--danger)' : 'var(--text-base)', lineHeight: 1 }}>
        {display}
      </div>
    </div>
  )
}

interface TopTableProps {
  title: string
  col1: string
  col2: string
  rows: Array<{ key: string; count: number }>
  mono?: boolean
}

function TopTable({ title, col1, col2, rows }: TopTableProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
      <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-base)', margin: 0 }}>{title}</h2>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col1}</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{col2}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No data</td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.key} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '9px 12px', color: 'var(--text-base)', fontFamily: 'ui-monospace, monospace', fontSize: '12px', wordBreak: 'break-all' }}>{row.key}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>{row.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function InfoPage() {
  const [info, setInfo] = useState<InfoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)

  const fetchInfo = useCallback(async () => {
    const id = ++fetchIdRef.current
    setLoading(true)
    setError(null)
    try {
      const data = await getInfo()
      if (id !== fetchIdRef.current) return
      setInfo(data)
    } catch (err) {
      if (id !== fetchIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load info.')
    } finally {
      if (id === fetchIdRef.current) setLoading(false)
    }
  }, [])

  const { intervalSec, changeInterval, refresh, lastRefreshed } = useAutoRefresh(fetchInfo)

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  const topScenarios = (info?.top_scenarios ?? []).map(s => ({ key: s.scenario, count: s.count }))
  const topCountries = (info?.top_countries ?? []).map(c => ({ key: c.country, count: c.count }))
  const topIPs = (info?.top_ips ?? []).map(ip => ({ key: ip.ip, count: ip.count }))

  return (
    <>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={{ background: 'var(--bg-base)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-base)', margin: 0, marginRight: 'auto' }}>
            Info
          </h1>
          <RefreshBar
            intervalSec={intervalSec}
            onChangeInterval={changeInterval}
            onRefresh={refresh}
            lastRefreshed={lastRefreshed}
            loading={loading}
          />
        </div>

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
              onClick={fetchInfo}
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

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          {loading && !info ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <StatCard label="Total Alerts" value={info?.total_alerts ?? 0} to="/alerts" />
              <StatCard label="Active Decisions" value={info?.active_decisions ?? 0} danger to="/decisions" />
              <StatCard label="UI Version" value={info?.ui_version ?? '—'} text />
              <StatCard label="UI Uptime" value={info?.ui_uptime ?? '—'} text />
            </>
          )}
        </div>

        {/* Top 3 tables */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {loading && !info ? (
            <>
              <SkeletonTable />
              <SkeletonTable />
              <SkeletonTable />
            </>
          ) : (
            <>
              <TopTable title="Top Scenarios" col1="Scenario" col2="Count" rows={topScenarios} />
              <TopTable title="Top Countries" col1="Country" col2="Count" rows={topCountries} />
              <TopTable title="Top IPs" col1="IP" col2="Count" rows={topIPs} />
            </>
          )}
        </div>

        {/* Allowlists */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-base)', margin: 0 }}>Allowlists</h2>
          {loading && !info ? (
            <SkeletonTable />
          ) : !info || info.allowlists.length === 0 ? (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '20px 16px',
              textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)',
            }}>
              No allowlists configured
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Description', 'Items', 'Created', 'Updated'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {info.allowlists.map((al, i) => (
                    <tr key={al.name} style={{ borderBottom: i < info.allowlists.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '9px 12px', color: 'var(--text-base)', fontWeight: 500 }}>{al.name}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{al.description || '—'}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-base)' }}>{al.size.toLocaleString()}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(al.created_at)}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(al.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
