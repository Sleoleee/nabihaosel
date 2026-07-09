import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'
import KPICard from '../components/KPICard'
import Card from '../components/Card'
import GlobalFilters from '../components/GlobalFilters'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import {
  getFilters, getKPI, getRevenueTrend, getBillsAOV, getByKategori, getByBranch
} from '../utils/api'

const YEAR_COLORS = { '2025': '#d31137', '2024': '#fc3961', '2023': '#fc93a6', '2022': '#feb5c2' }

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13 },
  labelStyle: { color: '#fff', fontWeight: 600 },
  itemStyle: { color: 'rgba(255,255,255,0.85)' },
}

function SectionTitle({ children }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--color-text)' }}>{children}</h3>
}

export default function Overview() {
  const [filters, setFilters] = useState({ year: 'all', month: 'all', kategori: 'all', branch: 'all' })
  const [availFilters, setAvailFilters] = useState({})
  const [kpi, setKpi] = useState(null)
  const [trend, setTrend] = useState(null)
  const [billsAov, setBillsAov] = useState(null)
  const [byKat, setByKat] = useState(null)
  const [byBranch, setByBranch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getFilters().then(setAvailFilters).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      getKPI(filters), getRevenueTrend(filters), getBillsAOV(filters),
      getByKategori(filters), getByBranch(filters),
    ]).then(([k, t, b, kat, br]) => {
      setKpi(k); setTrend(t); setBillsAov(b); setByKat(kat); setByBranch(br)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  const trendYears = trend?.years?.map(String) || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Overview</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Ringkasan performa penjualan</p>
      </div>

      <GlobalFilters filters={filters} onChange={setFilters} availableFilters={availFilters} />

      {error && <ErrorState message={error} onRetry={load} />}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {loading ? [1,2,3,4].map(i => <SkeletonCard key={i} />) : kpi ? <>
          <KPICard title="Total Revenue" value={kpi.revenue} change={kpi.revenue_change} format="rupiah" />
          <KPICard title="Jumlah Bills" value={kpi.bills} change={kpi.bills_change} format="number" />
          <KPICard title="AOV" value={kpi.aov} change={kpi.aov_change} format="rupiah" />
          <KPICard title="Customer Aktif" value={kpi.customers} change={kpi.customers_change} format="number" />
        </> : null}
      </div>

      {/* Revenue Trend */}
      <Card>
        <SectionTitle>Revenue Trend per Bulan</SectionTitle>
        {loading ? <Skeleton height={260} /> : !trend?.data?.length ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#888' }} />
              <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 12, fill: '#888' }} width={72} />
              <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
              <Legend />
              {trendYears.map(y => (
                <Line key={y} type="monotone" dataKey={y} name={y}
                  stroke={YEAR_COLORS[y] || '#cccccc'} strokeWidth={2}
                  dot={false} isAnimationActive={true} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Bills vs AOV */}
      <Card>
        <SectionTitle>Bills vs AOV per Bulan</SectionTitle>
        {loading ? <Skeleton height={260} /> : !billsAov?.length ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={billsAov}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#888' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#888' }} width={50} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={formatRupiahShort} tick={{ fontSize: 12, fill: '#888' }} width={72} />
              <Tooltip {...tooltipStyle} formatter={(v, name) => name === 'aov' ? formatRupiah(v) : formatNumber(v)} />
              <Legend />
              <Bar yAxisId="left" dataKey="bills" name="Bills" fill="#fc93a6" isAnimationActive={true} />
              <Line yAxisId="right" type="monotone" dataKey="aov" name="AOV" stroke="#d31137" strokeWidth={2} dot={false} isAnimationActive={true} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Kategori & Branch */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <SectionTitle>Revenue per Kategori</SectionTitle>
          {loading ? <Skeleton height={260} /> : !byKat?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byKat.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis type="category" dataKey="kategori" tick={{ fontSize: 11, fill: '#888' }} width={110} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
                <Bar dataKey="revenue" name="Revenue" isAnimationActive={true}>
                  {byKat.slice(0, 10).map((_, i) => (
                    <Cell key={i} fill={['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2'][i] || '#cccccc'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionTitle>Revenue per Branch</SectionTitle>
          {loading ? <Skeleton height={260} /> : !byBranch?.length ? <EmptyState /> : (
            <div style={{ overflowY: 'auto', maxHeight: 260 }}>
              {byBranch.map((b, i) => {
                const total = byBranch.reduce((s, x) => s + x.revenue, 0)
                const pct = total > 0 ? b.revenue / total * 100 : 0
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{b.branch}</span>
                      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                      <div style={{ height: 6, width: `${pct}%`, background: ['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2'][i] || '#ccc', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
