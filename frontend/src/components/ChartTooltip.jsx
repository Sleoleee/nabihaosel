import { formatRupiah } from '../utils/format'

export default function ChartTooltip({ active, payload, label, formatValue }) {
  if (!active || !payload || !payload.length) return null

  return (
    <div style={{
      background: '#1a1a1a', color: '#fff', borderRadius: 8,
      padding: '10px 14px', fontSize: 13,
    }}>
      <div style={{ marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', marginRight: 4 }}>{p.name}:</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatValue ? formatValue(p.value) : formatRupiah(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
