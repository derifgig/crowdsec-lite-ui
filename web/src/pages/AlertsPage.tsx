import { useCallback, useEffect, useRef, useState } from 'react'
import { getAlerts, type Alert } from '../api/client'
import BanModal from '../components/BanModal'
import Pagination from '../components/Pagination'

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
    <tr className="border-b border-slate-700">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-4 bg-slate-700 rounded animate-pulse" />
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

  return (
    <div className="p-4 space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-white font-semibold text-lg mr-auto">Alerts</h1>

        <select
          value={since}
          onChange={e => handleSinceChange(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
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
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-40"
        />

        <input
          type="text"
          value={filterScenario}
          onChange={e => setFilterScenario(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Filter by scenario…"
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48"
        />

        <button
          onClick={applySearch}
          className="px-4 py-1.5 rounded text-sm bg-slate-600 hover:bg-slate-500 text-white transition-colors"
        >
          Search
        </button>
      </div>

      {/* Stats */}
      <p className="text-slate-400 text-sm">
        {loading ? 'Loading…' : `${total.toLocaleString()} alert${total !== 1 ? 's' : ''}`}
      </p>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-900/30 border border-red-700 rounded px-4 py-3 text-red-300 text-sm">
          <span>{error}</span>
          <button
            onClick={() => fetchAlerts(page, since, appliedIp, appliedScenario)}
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
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">IP</th>
              <th className="px-3 py-2.5 font-medium">Country</th>
              <th className="px-3 py-2.5 font-medium">AS</th>
              <th className="px-3 py-2.5 font-medium">Scenario</th>
              <th className="px-3 py-2.5 font-medium">Events</th>
              <th className="px-3 py-2.5 font-medium">Decision</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && alerts.length === 0 && (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            )}
            {!loading && !error && alerts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">No alerts found.</td>
              </tr>
            )}
            {alerts.map(alert => (
              <>
                <tr
                  key={alert.id}
                  onClick={() => toggleRow(alert.id)}
                  className={`border-b border-slate-700 cursor-pointer transition-colors ${
                    selectedAlertId === alert.id
                      ? 'bg-slate-700/60'
                      : 'hover:bg-slate-700/50'
                  }`}
                >
                  <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                    {formatDate(alert.start_at)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-100 font-mono text-xs">
                    {alert.source?.ip || alert.source?.value || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {alert.source?.cn || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 max-w-[12rem] truncate">
                    {alert.source?.as_name
                      ? `AS${alert.source.as_number} ${alert.source.as_name}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-200 max-w-[16rem] truncate">
                    {alert.scenario}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 text-right">
                    {alert.events_count}
                  </td>
                  <td className="px-3 py-2.5">
                    {alert.decisions && alert.decisions.length > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-300 border border-red-800">
                        {alert.decisions[0].type}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={e => openBanModal(alert.source?.ip || alert.source?.value || '', e)}
                      className="px-2.5 py-1 rounded text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                    >
                      Ban
                    </button>
                  </td>
                </tr>

                {selectedAlertId === alert.id && (
                  <tr key={`detail-${alert.id}`} className="bg-slate-900/50">
                    <td colSpan={8} className="px-4 py-4">
                      <AlertDetail alert={alert} />
                    </td>
                  </tr>
                )}
              </>
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
        initialIp={banModalIp}
        onClose={() => setBanModalOpen(false)}
        onSuccess={() => fetchAlerts(page, since, appliedIp, appliedScenario)}
      />
    </div>
  )
}

function AlertDetail({ alert }: { alert: Alert }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div className="space-y-1">
        <h3 className="text-slate-400 text-xs uppercase tracking-wide mb-2">Alert Details</h3>
        <Row label="ID" value={String(alert.id)} />
        <Row label="Scenario" value={alert.scenario} />
        <Row label="Message" value={alert.message} />
        <Row label="Start" value={alert.start_at} />
        <Row label="Stop" value={alert.stop_at} />
        <Row label="Events" value={String(alert.events_count)} />
        <Row label="Simulated" value={alert.simulated ? 'Yes' : 'No'} />
      </div>

      <div className="space-y-1">
        <h3 className="text-slate-400 text-xs uppercase tracking-wide mb-2">Source</h3>
        <Row label="IP" value={alert.source?.ip || alert.source?.value} />
        <Row label="Range" value={alert.source?.range} />
        <Row label="Country" value={alert.source?.cn} />
        <Row label="AS" value={alert.source?.as_name ? `AS${alert.source.as_number} ${alert.source.as_name}` : undefined} />
        <Row label="Scope" value={alert.source?.scope} />
      </div>

      {alert.decisions && alert.decisions.length > 0 && (
        <div className="md:col-span-2 space-y-1">
          <h3 className="text-slate-400 text-xs uppercase tracking-wide mb-2">Decisions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left pb-1 pr-4">Type</th>
                  <th className="text-left pb-1 pr-4">Scope</th>
                  <th className="text-left pb-1 pr-4">Value</th>
                  <th className="text-left pb-1 pr-4">Duration</th>
                  <th className="text-left pb-1 pr-4">Origin</th>
                </tr>
              </thead>
              <tbody>
                {alert.decisions.map(d => (
                  <tr key={d.id} className="text-slate-300">
                    <td className="pr-4 py-0.5">{d.type}</td>
                    <td className="pr-4 py-0.5">{d.scope}</td>
                    <td className="pr-4 py-0.5 font-mono">{d.value}</td>
                    <td className="pr-4 py-0.5">{d.duration}</td>
                    <td className="pr-4 py-0.5">{d.origin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alert.meta && alert.meta.length > 0 && (
        <div className="md:col-span-2 space-y-1">
          <h3 className="text-slate-400 text-xs uppercase tracking-wide mb-2">Metadata</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-0.5">
            {alert.meta.map((m, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-slate-500 shrink-0">{m.key}:</span>
                <span className="text-slate-300 break-all">{m.value}</span>
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
    <div className="flex gap-2 text-xs">
      <span className="text-slate-500 w-20 shrink-0">{label}:</span>
      <span className="text-slate-300 break-all">{value}</span>
    </div>
  )
}
