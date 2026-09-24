import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteDecision, getDecisions, type Decision } from '../api/client'
import BanModal from '../components/BanModal'
import Pagination from '../components/Pagination'

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
    <tr className="border-b border-slate-700">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-4 bg-slate-700 rounded animate-pulse" />
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

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-white font-semibold text-lg mr-auto">Decisions</h1>

        <input
          type="text"
          value={filterIp}
          onChange={e => setFilterIp(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Filter by IP…"
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44"
        />

        <button
          onClick={applySearch}
          className="px-4 py-1.5 rounded text-sm bg-slate-600 hover:bg-slate-500 text-white transition-colors"
        >
          Search
        </button>

        <button
          onClick={() => setBanModalOpen(true)}
          className="px-4 py-1.5 rounded text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          + Ban IP
        </button>
      </div>

      {/* Stats */}
      <p className="text-slate-400 text-sm">
        {loading ? 'Loading…' : `${total.toLocaleString()} decision${total !== 1 ? 's' : ''}`}
      </p>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-900/30 border border-red-700 rounded px-4 py-3 text-red-300 text-sm">
          <span>{error}</span>
          <button
            onClick={() => fetchDecisions(page, appliedIp)}
            className="ml-auto px-3 py-1 rounded bg-red-800 hover:bg-red-700 text-white text-xs transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 font-medium">Scope / Value</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Duration</th>
              <th className="px-3 py-2.5 font-medium">Scenario / Reason</th>
              <th className="px-3 py-2.5 font-medium">Origin</th>
              <th className="px-3 py-2.5 font-medium">Simulated</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && decisions.length === 0 && (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            )}
            {!loading && !error && decisions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">No decisions found.</td>
              </tr>
            )}
            {decisions.map(decision => (
              <tr
                key={decision.id}
                className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors"
              >
                <td className="px-3 py-2.5">
                  <div className="text-slate-100 font-mono text-xs">{decision.value}</div>
                  {decision.scope && (
                    <div className="text-slate-500 text-xs">{decision.scope}</div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs border ${
                    decision.type === 'ban'
                      ? 'bg-red-900/40 text-red-300 border-red-800'
                      : 'bg-yellow-900/40 text-yellow-300 border-yellow-800'
                  }`}>
                    {decision.type}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                  {decision.duration}
                </td>
                <td className="px-3 py-2.5 text-slate-300 max-w-[16rem] truncate">
                  {decision.scenario || '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-400 text-xs">
                  {decision.origin || '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-400 text-xs">
                  {decision.simulated ? 'Yes' : 'No'}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleUnban(decision.id)}
                      disabled={unbanning.has(decision.id)}
                      className="px-2.5 py-1 rounded text-xs bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors whitespace-nowrap"
                    >
                      {unbanning.has(decision.id) ? 'Removing…' : 'Unban'}
                    </button>
                    {unbanErrors[decision.id] && (
                      <span className="text-red-400 text-xs">{unbanErrors[decision.id]}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && !error && (
        <div className="flex justify-end">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <BanModal
        open={banModalOpen}
        onClose={() => setBanModalOpen(false)}
        onSuccess={() => fetchDecisions(page, appliedIp)}
      />
    </div>
  )
}
