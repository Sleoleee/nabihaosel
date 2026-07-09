import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'
import Card from '../components/Card'
import Skeleton from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { getKategoriTrend, getKategoriGrowth, getTopProducts, getHeatmap, getFilters } from '../utils/api'

const COLORS = ['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2']
const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13 },
  labelStyle: { color: '#fff', fontWeight: 600 },
}

function SectionTitle({ children }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{children}</h3>
}

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

export default function Products() {
  const [filters, setFilters] = useState({ year: 'all' })
  const [years, setYears] = useState([])
  const [trend, setTrend] = useState(null)
  const [growth, setGrowth] = useState(null)
  const [topProducts, setTopProducts] = useState(null)
  const [heatmap, setHeatmap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { getFilters().then(f => setYears(f.years || [])).catch(() => {}) }, [])

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([getKategoriTrend(filters), getKategoriGrowth(filters), getTopProducts(filters), getHeatmap(filters)])
      .then(([t, g, tp, hm]) => { setTrend(t); setGrowth(g); setTopProducts(tp); setHeatmap(hm) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Produk & Kategori</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Analisis performa produk dan kategori</p>
      </div>

      <Card style={{ display: 'flex', gap: 16, padding: '16px 24px', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tahun</label>
          <select value={filters.year || 'all'} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
            <option value="all">Semua</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
      </Card>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Stacked Area - Revenue per Kategori */}
      <Card>
        <SectionTitle>Revenue per Kategori per Tahun</SectionTitle>
        {loading ? <Skeleton height={280} /> : !trend?.data?.length ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trend.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#888' }} />
              <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 12, fill: '#888' }} width={72} />
              <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
              <Legend />
              {(trend.top5 || trend.categories || []).map((cat, i) => (
                <Area key={cat} type="monotone" dataKey={cat} name={cat}
                  stackId="1" fill={COLORS[i] || '#cccccc'} stroke={COLORS[i] || '#cccccc'}
                  fillOpacity={0.7} isAnimationActive={true} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Growth & Top Products */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <SectionTitle>Pertumbuhan Kategori YoY</SectionTitle>
          {loading ? <Skeleton height={280} /> : !growth?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={growth} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="kategori" tick={{ fontSize: 11, fill: '#888' }} width={110} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Growth']} />
                <ReferenceLine x={0} stroke="#888" strokeDasharray="3 3" />
                <Bar dataKey="growth" name="Growth YoY" isAnimationActive={true}>
                  {growth.map((g, i) => (
                    <Cell key={i} fill={g.growth === null ? '#ccc' : g.growth >= 0 ? '#22c55e' : '#d31137'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionTitle>Top 20 Produk by Revenue</SectionTitle>
          {loading ? <Skeleton height={280} /> : !topProducts?.length ? <EmptyState /> : (
            <div style={{ overflowY: 'auto', maxHeight: 280 }}>
              {topProducts.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ minWidth: 22, color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.description}>
                      {p.description.length > 35 ? p.description.slice(0, 35) + '…' : p.description}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Qty: {formatNumber(p.qty)}</div>
                  </div>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatRupiahShort(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <SectionTitle>Heatmap Kategori × Bulan (Seasonality)</SectionTitle>
        {loading ? <Skeleton height={200} /> : !heatmap?.length ? <EmptyState /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--color-text-muted)', minWidth: 130 }}>Kategori</th>
                  {MONTHS.map(m => <th key={m} style={{ padding: '6px 8px', color: 'var(--color-text-muted)', fontWeight: 600, minWidth: 64 }}>{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row, ri) => {
                  const vals = MONTHS.map(m => row[m] || 0)
                  const maxVal = Math.max(...vals)
                  return (
                    <tr key={ri}>
                      <td style={{ padding: '6px 10px', fontWeight: 500, whiteSpace: 'nowrap' }}>{row.kategori}</td>
                      {MONTHS.map(m => {
                        const v = row[m] || 0
                        const t = maxVal > 0 ? v / maxVal : 0
                        const bg = `rgba(211,17,55,${0.08 + t * 0.85})`
                        return (
                          <td key={m} title={formatRupiah(v)} style={{ padding: '6px 8px', textAlign: 'center', background: bg, color: t > 0.6 ? '#fff' : 'var(--color-text)', borderRadius: 2 }}>
                            {v > 0 ? formatRupiahShort(v) : '–'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
