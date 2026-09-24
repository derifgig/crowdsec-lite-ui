interface Props {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

export default function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null

  function btnStyle(active: boolean, disabled: boolean): React.CSSProperties {
    return {
      padding: '4px 10px',
      borderRadius: '5px',
      fontSize: '13px',
      border: '1px solid var(--border)',
      background: active ? 'var(--accent)' : 'var(--bg-surface)',
      color: active ? '#fff' : disabled ? 'var(--text-dim)' : 'var(--text-base)',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      minWidth: '32px',
      textAlign: 'center' as const,
    }
  }

  const pages: (number | '…')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <button style={btnStyle(false, page === 1)} disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} style={{ padding: '4px 6px', color: 'var(--text-dim)', fontSize: '13px' }}>…</span>
          : <button key={p} style={btnStyle(p === page, false)} onClick={() => onChange(p as number)}>{p}</button>
      )}
      <button style={btnStyle(false, page === totalPages)} disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  )
}
