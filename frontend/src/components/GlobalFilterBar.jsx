import { useState, useRef, useEffect } from 'react'
import { useGlobalFilters } from '../context/GlobalFilters'

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

function MultiDropdown({ label, options, selected, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const summary = selected.length === 0 ? `Semua ${label}` : selected.length === 1 ? selected[0] : `${label}: ${selected.length}`
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        border: '1px solid #ddd', borderRadius: 6, padding: '5px 10px', fontSize: 12.5,
        background: selected.length ? '#fdecef' : '#fff', cursor: 'pointer', color: '#222', whiteSpace: 'nowrap',
      }}>{summary} ▾</button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: '#fff',
          border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
          padding: 6, minWidth: 150, maxHeight: 260, overflowY: 'auto' }}>
          {options.map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
              fontSize: 12.5, cursor: 'pointer', borderRadius: 5 }}>
              <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)} />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GlobalFilterBar() {
  const g = useGlobalFilters()
  if (!g) return null
  const chips = [
    ...g.years.map(y => ({ k: 'years', v: y, label: y })),
    ...g.channels.map(c => ({ k: 'channels', v: c, label: c })),
    ...g.months.map(m => ({ k: 'months', v: m, label: MONTHS[Number(m) - 1] })),
    ...(g.compare ? [{ k: 'compare', v: true, label: 'vs tahun lalu' }] : []),
  ]
  return (
    <div style={{
      position: 'sticky', top: 54, zIndex: 95, background: '#fff', borderBottom: '1px solid #e5e7eb',
      padding: '8px 32px', marginLeft: -32, marginRight: -32, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.05em', marginRight: 4 }}>FILTER GLOBAL</span>
        <MultiDropdown label="Tahun" options={g.avail.years} selected={g.years} onToggle={(v) => g.toggle('years', v)} />
        <MultiDropdown label="Bulan" options={MONTHS.map((_, i) => String(i + 1))} selected={g.months} onToggle={(v) => g.toggle('months', v)} />
        <MultiDropdown label="Channel" options={g.avail.channels} selected={g.channels} onToggle={(v) => g.toggle('channels', v)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer', marginLeft: 4 }}>
          <input type="checkbox" checked={g.compare} onChange={(e) => g.update({ compare: e.target.checked })} />
          Bandingkan tahun lalu
        </label>
      </div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((c, i) => (
            <span key={i} style={{ background: '#f4f4f5', border: '1px solid #e5e7eb', borderRadius: 20,
              padding: '2px 8px 2px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              {c.label}
              <button onClick={() => c.k === 'compare' ? g.update({ compare: false }) : g.toggle(c.k, c.v)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: 12, padding: 0 }}>✕</button>
            </span>
          ))}
          <button onClick={g.resetAll} style={{ border: 'none', background: 'none', color: '#d31137',
            fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Reset semua</button>
        </div>
      )}
    </div>
  )
}
