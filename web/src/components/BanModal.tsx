import { useEffect, useRef, useState } from 'react'
import { addDecision } from '../api/client'

const DURATION_OPTIONS = ['1h', '4h', '24h', '72h', '168h', 'custom']

interface Props {
  open: boolean
  initialIp?: string
  onClose: () => void
  onSuccess: () => void
}

function isValidIp(ip: string): boolean {
  const v4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
  const v6 = /^[0-9a-fA-F:]+$/
  return v4.test(ip.trim()) || v6.test(ip.trim())
}

export default function BanModal({ open, initialIp = '', onClose, onSuccess }: Props) {
  const [ip, setIp] = useState(initialIp)
  const [durOption, setDurOption] = useState('4h')
  const [durCustom, setDurCustom] = useState('')
  const [reason, setReason] = useState('manual ban')
  const [type, setType] = useState<'ban' | 'captcha'>('ban')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ipRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setIp(initialIp)
      setDurOption('4h')
      setDurCustom('')
      setReason('manual ban')
      setType('ban')
      setError(null)
      setTimeout(() => ipRef.current?.focus(), 50)
    }
  }, [open, initialIp])

  if (!open) return null

  const duration = durOption === 'custom' ? durCustom : durOption

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidIp(ip)) { setError('Invalid IP address'); return }
    if (!duration) { setError('Duration is required'); return }
    setLoading(true)
    setError(null)
    try {
      await addDecision({ ip: ip.trim(), duration, reason, type })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban IP')
    } finally {
      setLoading(false)
    }
  }

  const s = {
    overlay: {
      position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    } as React.CSSProperties,
    card: {
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '420px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    } as React.CSSProperties,
    label: { display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' } as React.CSSProperties,
    input: {
      width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
      borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--text-base)',
      outline: 'none',
    } as React.CSSProperties,
    select: {
      width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
      borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--text-base)',
      outline: 'none',
    } as React.CSSProperties,
    btnPrimary: {
      background: 'var(--btn-primary)', color: '#fff', border: 'none',
      borderRadius: '6px', padding: '8px 18px', fontSize: '13px',
      cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
    } as React.CSSProperties,
    btnSecondary: {
      background: 'var(--btn-secondary)', color: 'var(--text-base)',
      border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 18px',
      fontSize: '13px', cursor: 'pointer',
    } as React.CSSProperties,
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.card} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-base)', margin: 0 }}>Ban IP</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={s.label}>IP Address</label>
            <input ref={ipRef} style={s.input} value={ip} onChange={e => setIp(e.target.value)} placeholder="1.2.3.4" />
          </div>

          <div>
            <label style={s.label}>Duration</label>
            <select style={s.select} value={durOption} onChange={e => setDurOption(e.target.value)}>
              {DURATION_OPTIONS.map(o => <option key={o} value={o}>{o === 'custom' ? 'Custom…' : o}</option>)}
            </select>
            {durOption === 'custom' && (
              <input style={{ ...s.input, marginTop: '6px' }} value={durCustom} onChange={e => setDurCustom(e.target.value)} placeholder="e.g. 12h, 7d" />
            )}
          </div>

          <div>
            <label style={s.label}>Reason</label>
            <input style={s.input} value={reason} onChange={e => setReason(e.target.value)} placeholder="manual ban" />
          </div>

          <div>
            <label style={s.label}>Type</label>
            <select style={s.select} value={type} onChange={e => setType(e.target.value as 'ban' | 'captcha')}>
              <option value="ban">ban</option>
              <option value="captcha">captcha</option>
            </select>
          </div>

          {error && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" style={s.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={s.btnPrimary} disabled={loading}>
              {loading ? 'Banning…' : 'Ban'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
