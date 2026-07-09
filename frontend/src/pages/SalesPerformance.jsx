import { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, ReferenceLine
} from 'recharts'
import Card from '../components/Card'
import Skeleton from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { getLeaderboard, getSalesDrilldown, getSalesScatter, getFilters } from '../utils/api'

const COLORS = ['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2']
const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13 },
  labelStyle: { color: '#fff', fontWeight: 600 },
}
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

function SectionTitle({ children }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{children}</h3>
}

export default function SalesPerformance() {
  const [filters, setFilters] = useState({ year: 'all', branch: 'all' })
  const [years, setYears] = useState([])
  const [branches, setBranches] = useState([])
  const [leaderboard, setLeaderboard] = useState(null)
  const [scatter, setScatter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSales, setSelectedSales] = useState('')
  const [drilldown, setDrilldown] = useState(null)
  const [ddLoading, setDdLoading] = useState(false)

  useEffect(() => {
    getFilters().then(f => { setYears(f.years || []); setBranches(f.branches || []) }).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([getLeaderboard(filters), getSalesScatter(filters)])
      .then(([lb, sc]) => { setLeaderboard(lb); setScatter(sc) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  useEffect(() => {
    if (!selectedSales) return
    setDdLoading(true)
    getSalesDrilldown(selectedSales, filters)
      .then(setDrilldown).catch(() => {}).finally(() => setDdLoading(false))
  }, [selectedSales, JSON.stringify(filters)])

  const avgRevenue = leaderboard?.length
    ? leaderboard.reduce((s, x) => s + x.revenue, 0) / leaderboard.length
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Sales Performance</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Performa salesperson (channel digital dikeluarkan)</p>
      </div>

      <Card style={{ display: 'flex', gap: 16, padding: '16px 24px', alignItems: 'flex-end' }}>
        {[
          { label: 'Tahun', key: 'year', opts: years.map(y => ({ value: String(y), label: String(y) })) },
          { label: 'Branch', key: 'branch', opts: branches.map(b => ({ value: b, label: b })) },
        ].map(({ label, key, opts }) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
            <select value={filters[key] || 'all'} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
              <option value="all">Semua</option>
              {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </Card>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Leaderboard */}
      <Card>
        <SectionTitle>Leaderboard Sales</SectionTitle>
        {loading ? <Skeleton height={200} /> : !leaderboard?.length ? <EmptyState /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  {['#', 'Nama Sales', 'Total Revenue', 'Customer', 'AOV', 'Bills', 'Avg/Customer'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => (
                  <tr key={i}
                    style={{
                      background: i === 0 ? '#fde3e9' : 'transparent',
                      borderBottom: '1px solid var(--color-border)',
                      borderLeft: i === 0 ? '3px solid #d31137' : '3px solid transparent',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fde3e9'}
                    onMouseLeave={e => e.currentTarget.style.background = i === 0 ? '#fde3e9' : 'transparent'}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: i === 0 ? '#d31137' : 'var(--color-text-muted)' }}>{row.rank}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                      <span title={`Top kategori: ${row.top_categories?.join(', ')}`}>{row.name}</span>
                    </td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(row.revenue)}</td>
                    <td style={{ padding: '8px 12px' }}>{row.customers}</td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(row.aov)}</td>
                    <td style={{ padding: '8px 12px' }}>{row.bills}</td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(row.avg_per_customer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Sales Chart */}
      <Card>
        <SectionTitle>Perbandingan Revenue Sales</SectionTitle>
        {loading ? <Skeleton height={260} /> : !leaderboard?.length ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={Math.max(200, leaderboard.length * 28)}>
            <BarChart data={leaderboard} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#888' }} width={120} />
              <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
              <ReferenceLine x={avgRevenue} stroke="#888" strokeDasharray="4 4" label={{ value: 'Rata-rata', fill: '#888', fontSize: 11 }} />
              <Bar dataKey="revenue" name="Revenue" isAnimationActive={true}>
                {leaderboard.map((_, i) => {
                  const t = leaderboard.length > 1 ? i / (leaderboard.length - 1) : 0
                  const r = Math.round(211 + (254 - 211) * t)
                  const g = Math.round(17 + (181 - 17) * t)
                  const b = Math.round(55 + (194 - 55) * t)
                  return <Cell key={i} fill={`rgb(${r},${g},${b})`} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Scatter */}
      <Card>
        <SectionTitle>Customer vs Revenue per Sales</SectionTitle>
        {loading ? <Skeleton height={260} /> : !scatter?.length ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="customers" name="Jumlah Customer" tick={{ fontSize: 11, fill: '#888' }} label={{ value: 'Jumlah Customer', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#888' }} />
              <YAxis dataKey="revenue" name="Revenue" tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip {...tooltipStyle} content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]?.payload
                return (
                  <div style={{ background: '#1a1a1a', color: '#fff', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{d?.name}</div>
                    <div>Customer: {d?.customers}</div>
                    <div>Revenue: {formatRupiah(d?.revenue)}</div>
                  </div>
                )
              }} />
              <Scatter data={scatter} fill="#d31137" />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Drilldown */}
      <Card>
        <SectionTitle>Drill-down per Sales</SectionTitle>
        <div style={{ marginBottom: 16 }}>
          <select value={selectedSales} onChange={e => setSelectedSales(e.target.value)} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#fff', cursor: 'pointer', minWidth: 200 }}>
            <option value="">Pilih Salesperson...</option>
            {leaderboard?.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        {ddLoading ? <Skeleton height={200} /> : drilldown ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-muted)' }}>Revenue Bulanan</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={drilldown.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888' }} />
                    <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} width={60} />
                    <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
                    <Line type="monotone" dataKey="revenue" stroke="#d31137" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-muted)' }}>Kategori yang Dijual</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={drilldown.categories} dataKey="revenue" nameKey="kategori" cx="50%" cy="50%" outerRadius={70} isAnimationActive={true}>
                      {drilldown.categories?.map((_, i) => <Cell key={i} fill={COLORS[i] || '#ccc'} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-muted)' }}>Customer yang Dilayani</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Nama Customer</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Total Revenue</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Terakhir Beli</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldown.customers?.slice(0, 15).map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fde3e9'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '6px 10px' }}>{c.name}</td>
                      <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(c.revenue)}</td>
                      <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>{c.last_purchase}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : selectedSales ? null : (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '20px 0' }}>Pilih salesperson untuk melihat detail.</div>
        )}
      </Card>
    </div>
  )
}
