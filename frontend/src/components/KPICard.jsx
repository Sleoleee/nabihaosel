import { formatRupiah, formatNumber, formatPct } from '../utils/format'

export default function KPICard({ title, value, change, format = 'rupiah', suffix = '' }) {
  const displayValue = format === 'rupiah' ? formatRupiah(value)
    : format === 'number' ? formatNumber(value)
    : value !== null && value !== undefined ? value : '-'

  const isPositive = change > 0
  const isNegative = change < 0

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: 24,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
        {displayValue}{suffix}
      </div>
      {change !== null && change !== undefined && (
        <div style={{ fontSize: 13, color: isPositive ? 'var(--color-success)' : isNegative ? 'var(--color-primary)' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{isPositive ? '↑' : isNegative ? '↓' : '→'}</span>
          <span>{Math.abs(change).toFixed(1)}% vs tahun lalu</span>
        </div>
      )}
    </div>
  )
}
