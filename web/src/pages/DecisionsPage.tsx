import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteDecision, getDecisions, type Decision } from '../api/client'
import BanModal from '../components/BanModal'
import Pagination from '../components/Pagination'
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

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {Array.from({ length: 7 }).map((_, i) => (
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

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const [filterIp, setFilterIp] = useState('')
  const [appliedIp, setAppliedIp] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [banModalOpen, setBanModalOpen] = useState(false)
  const [unbanning, setUnbanning] = useState<Set<number>>(new Set())
  const [unbanErrors, setUnbanErrors] = useState<Record<number, string>>({})

  const fetchIdRef = useRef(0)

  const fetchDecisions = useCallback(async (p: number, ip: string) => {
    const id = ++fetchIdRef.current
    setLoading(true)
    setError(null)
    try {
      const data = await getDecisions({ page: p, page_size: pageSize, ip: ip || undefined })
      if (id !== fetchIdRef.current) return
      setDecisions(data.decisions ?? [])
      setTotal(data.total)
    } catch (err) {
      if (id !== fetchIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load decisions.')
    } finally {
      if (id === fetchIdRef.current) setLoading(false)
    }
  }, [pageSize])

  const { intervalSec, changeInterval, refresh, lastRefreshed } = useAutoRefresh(
    useCallback(() => fetchDecisions(page, appliedIp), [fetchDecisions, page, appliedIp])
  )

  useEffect(() => {
    fetchDecisions(page, appliedIp)
  }, [page, appliedIp, fetchDecisions])

  function applySearch() {
    setAppliedIp(filterIp)
    setPage(1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applySearch()
  }

  async function handleUnban(id: number) {
    setUnbanning(prev => new Set(prev).add(id))
    setUnbanErrors(prev => { const n = { ...prev }; delete n[id]; return n })
    try {
      await deleteDecision(id)
      setDecisions(prev => prev.filter(d => d.id !== id))
      setTotal(prev => Math.max(0, prev - 1))
    } catch (err) {
      setUnbanErrors(prev => ({
        ...prev,
        [id]: err instanceof Error ? err.message : 'Failed to unban.',
      }))
    } finally {
      setUnbanning(prev => { const n = new Set(prev); n.delete(id); return n })
    }
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

  const btnSecondaryStyle: React.CSSProperties = {
    background: 'var(--btn-secondary)',
    color: 'var(--text-base)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '6px 14px',
    fontSize: '13px',
    cursor: 'pointer',
  }

  const btnPrimaryStyle: React.CSSProperties = {
    background: 'var(--btn-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 14px',
    fontSize: '13px',
    cursor: 'pointer',
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
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-base)', margin: 0, marginRight: 'auto' }}>
            Decisions
          </h1>

          <input
            type="text"
            value={filterIp}
            onChange={e => setFilterIp(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter by IP…"
            style={{ ...inputStyle, width: '176px' }}
          />

          <button onClick={applySearch} style={btnSecondaryStyle}>
            Search
          </button>

          <RefreshBar
            intervalSec={intervalSec}
            onChangeInterval={changeInterval}
            onRefresh={refresh}
            lastRefreshed={lastRefreshed}
            loading={loading}
          />

          <button onClick={() => setBanModalOpen(true)} style={btnPrimaryStyle}>
            + Ban IP
          </button>
        </div>

        {/* Stats */}
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} decision${total !== 1 ? 's' : ''}`}
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
              onClick={() => fetchDecisions(page, appliedIp)}
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
                {['Scope / Value', 'Type', 'Duration', 'Scenario / Reason', 'Origin', 'Simulated', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', fontWeight: 500,
                    color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && decisions.length === 0 && (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              )}
              {!loading && !error && decisions.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No decisions found.
                  </td>
                </tr>
              )}
              {decisions.map(decision => (
                <DecisionRow
                  key={decision.id}
                  decision={decision}
                  unbanning={unbanning.has(decision.id)}
                  unbanError={unbanErrors[decision.id]}
                  onUnban={() => handleUnban(decision.id)}
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
          onClose={() => setBanModalOpen(false)}
          onSuccess={() => fetchDecisions(page, appliedIp)}
        />
      </div>
    </>
  )
}

interface DecisionRowProps {
  decision: Decision
  unbanning: boolean
  unbanError?: string
  onUnban: () => void
}

function DecisionRow({ decision, unbanning, unbanError, onUnban }: DecisionRowProps) {
  const [hovered, setHovered] = useState(false)

  const isBan = decision.type === 'ban'
  const badgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: '4px',
    fontSize: '11px',
    background: isBan ? 'var(--badge-ban-bg)' : 'var(--badge-captcha-bg)',
    color: isBan ? 'var(--badge-ban-text)' : 'var(--badge-captcha-text)',
    border: `1px solid ${isBan ? 'var(--badge-ban-border)' : 'var(--badge-captcha-border)'}`,
  }

  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        background: hovered ? 'var(--row-hover)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ padding: '9px 12px' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: 'var(--text-base)' }}>
          {decision.value}
        </div>
        {decision.scope && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{decision.scope}</div>
        )}
      </td>
      <td style={{ padding: '9px 12px' }}>
        <span style={badgeStyle}>{decision.type}</span>
      </td>
      <td style={{ padding: '9px 12px', color: 'var(--text-base)', whiteSpace: 'nowrap' }}>
        {decision.duration}
      </td>
      <td style={{ padding: '9px 12px', color: 'var(--text-base)', maxWidth: '16rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {decision.scenario || '—'}
      </td>
      <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
        {decision.origin || '—'}
      </td>
      <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
        {decision.simulated ? 'Yes' : 'No'}
      </td>
      <td style={{ padding: '9px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button
            onClick={onUnban}
            disabled={unbanning}
            style={{
              background: 'var(--btn-danger)',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: unbanning ? 'default' : 'pointer',
              opacity: unbanning ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {unbanning ? 'Removing…' : 'Unban'}
          </button>
          {unbanError && (
            <span style={{ fontSize: '11px', color: 'var(--danger)' }}>{unbanError}</span>
          )}
        </div>
      </td>
    </tr>
  )
}
