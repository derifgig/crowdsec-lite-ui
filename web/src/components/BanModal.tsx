import { useEffect, useState } from 'react'
import { addDecision } from '../api/client'

interface Props {
  open: boolean
  initialIp?: string
  onClose: () => void
  onSuccess: () => void
}

const PRESET_DURATIONS = ['1h', '4h', '24h', '72h', '168h']

function isValidIp(value: string): boolean {
  // IPv4
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(value)
  if (v4) {
    const parts = value.split('.').map(Number)
    return parts.every(p => p >= 0 && p <= 255)
  }
  // IPv6 — basic check: contains colons
  return value.includes(':') && value.length >= 2
}

export default function BanModal({ open, initialIp = '', onClose, onSuccess }: Props) {
  const [ip, setIp] = useState(initialIp)
  const [durationPreset, setDurationPreset] = useState('24h')
  const [durationCustom, setDurationCustom] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [reason, setReason] = useState('manual ban')
  const [type, setType] = useState<'ban' | 'captcha'>('ban')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync ip when initialIp changes while modal is open
  useEffect(() => {
    if (open) {
      setIp(initialIp)
      setError(null)
      setSubmitting(false)
    }
  }, [open, initialIp])

  if (!open) return null

  const duration = useCustom ? durationCustom.trim() : durationPreset

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!ip.trim()) {
      setError('IP address is required.')
      return
    }
    if (!isValidIp(ip.trim())) {
      setError('Invalid IP address.')
      return
    }
    if (!duration) {
      setError('Duration is required.')
      return
    }

    setSubmitting(true)
    try {
      await addDecision({ ip: ip.trim(), duration, reason: reason.trim() || 'manual ban', type })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add decision.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold text-base">Add Decision / Ban IP</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* IP Address */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">IP Address</label>
            <input
              type="text"
              value={ip}
              onChange={e => setIp(e.target.value)}
              placeholder="e.g. 1.2.3.4"
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">Duration</label>
            <div className="flex gap-2">
              <select
                value={useCustom ? 'custom' : durationPreset}
                onChange={e => {
                  if (e.target.value === 'custom') {
                    setUseCustom(true)
                  } else {
                    setUseCustom(false)
                    setDurationPreset(e.target.value)
                  }
                }}
                className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {PRESET_DURATIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
              {useCustom && (
                <input
                  type="text"
                  value={durationCustom}
                  onChange={e => setDurationCustom(e.target.value)}
                  placeholder="e.g. 7d"
                  className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="manual ban"
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as 'ban' | 'captcha')}
              className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="ban">ban</option>
              <option value="captcha">captcha</option>
            </select>
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm bg-slate-600 hover:bg-slate-500 text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {submitting ? 'Adding…' : 'Add Decision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
