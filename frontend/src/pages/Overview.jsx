import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'
import KPICard from '../components/KPICard'
import Card from '../components/Card'
import GlobalFilters from '../components/GlobalFilters'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import {
  getFilters, getKPI, getRevenueTrend, getByKategori, getByBranch, getTiers, getCustomerList
} from '../utils/api'

const YEAR_COLORS = { '2025': '#d31137', '2024': '#fc3961', '2023': '#fc93a6', '2022': '#feb5c2' }
const TIER_COLORS = ['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2','#fcd3db','#ffe0e7']

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13 },
  labelStyle: { color: '#fff', fontWeight: 600 },
}

function SectionTitle({ children }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--color-text)' }}>{children}</h3>
}

function RevenueProgress({ revenue, target }) {
  const pct = target > 0 ? Math.min(100, (revenue / target) * 100) : 0
  const onTrack = pct >= 80
  const color = pct >= 100 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#d31137'
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>Total Revenue vs Target</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatRupiah(revenue)}</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Target: {formatRupiah(target)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>{pct.toFixed(1)}%</div>
          <div style={{ fontSize: 12, color, fontWeight: 600 }}>{pct >= 100 ? '✓ Target Tercapai' : pct >= 80 ? '⚡ Hampir Tercapai' : '⚠ Perlu Dorongan'}</div>
        </div>
      </div>
      <div style={{ height: 12, background: '#f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6, transition: 'width 0.8s ease' }} />
      </div>
    </Card>
  )
}

function RecommendationPanel({ kpi, byKat, byBranch, tiers, lapsedCount, totalCustomers }) {
  const items = useMemo(() => {
    const recs = []
    if (!kpi) return recs

    if (lapsedCount > 0 && totalCustomers > 0) {
      const lapsedPct = (lapsedCount / totalCustomers * 100).toFixed(0)
      recs.push({
        priority: lapsedPct > 20 ? 'high' : 'medium',
        icon: '⚠',
        title: `${lapsedCount} customer belum beli 90+ hari (${lapsedPct}%)`,
        action: 'Hubungi mereka dengan penawaran khusus atau diskon reaktivasi segera.',
      })
    }

    if (kpi.revenue_change !== null && kpi.revenue_change < -10) {
      recs.push({
        priority: 'high',
        icon: '📉',
        title: `Revenue turun ${Math.abs(kpi.revenue_change)}% dibanding tahun lalu`,
        action: 'Lakukan analisis penyebab penurunan: hilangnya customer lama, penurunan AOV, atau kompetitor.',
      })
    }

    if (kpi.aov_change !== null && kpi.aov_change < -5) {
      recs.push({
        priority: 'medium',
        icon: '🛒',
        title: `AOV turun ${Math.abs(kpi.aov_change)}% — customer belanja lebih sedikit`,
        action: 'Pertimbangkan bundling produk atau minimum pembelian untuk naikkan AOV.',
      })
    }

    const topKat = byKat?.[0]
    const botKat = byKat?.[byKat.length - 1]
    if (topKat && botKat && topKat.kategori !== botKat.kategori) {
      recs.push({
        priority: 'low',
        icon: '🏆',
        title: `Kategori terlaris: ${topKat.kategori} (${formatRupiahShort(topKat.revenue)})`,
        action: `Pastikan stok ${topKat.kategori} selalu tersedia. Pertimbangkan upsell ke kategori terkait.`,
      })
    }

    const topBranch = byBranch?.[0]
    const botBranch = byBranch?.[byBranch.length - 1]
    if (botBranch && topBranch && botBranch.branch !== topBranch.branch) {
      const topRev = topBranch.revenue
      const botRev = botBranch.revenue
      if (topRev > 0 && botRev / topRev < 0.3) {
        recs.push({
          priority: 'medium',
          icon: '📍',
          title: `Branch ${botBranch.branch} jauh di bawah ${topBranch.branch}`,
          action: `Evaluasi aktivitas sales di branch ${botBranch.branch}. Apakah coverage customer kurang atau ada masalah operasional?`,
        })
      }
    }

    if (recs.length === 0) {
      recs.push({
        priority: 'low',
        icon: '✅',
        title: 'Performa dalam kondisi baik',
        action: 'Pertahankan momentum dengan menjaga konsistensi kunjungan customer dan kualitas layanan.',
      })
    }

    return recs.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]))
  }, [kpi, byKat, byBranch, lapsedCount, totalCustomers])

  const priorityColors = { high: '#d31137', medium: '#f59e0b', low: '#22c55e' }
  const priorityBg = { high: '#fde3e9', medium: '#fef3c7', low: '#f0fdf4' }

  return (
    <Card>
      <SectionTitle>💡 Rekomendasi & Next Steps</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            background: priorityBg[item.priority],
            borderLeft: `4px solid ${priorityColors[item.priority]}`,
            borderRadius: '0 8px 8px 0',
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{item.action}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function Overview() {
  const [filters, setFilters] = useState({ year: 'all', month: 'all', kategori: 'all', branch: 'all' })
  const [availFilters, setAvailFilters] = useState({})
  const [kpi, setKpi] = useState(null)
  const [trend, setTrend] = useState(null)
  const [byKat, setByKat] = useState(null)
  const [byBranch, setByBranch] = useState(null)
  const [tiers, setTiers] = useState(null)
  const [topCustomers, setTopCustomers] = useState(null)
  const [lapsedCustomers, setLapsedCustomers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [target, setTarget] = useState('')

  useEffect(() => {
    getFilters().then(setAvailFilters).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      getKPI(filters),
      getRevenueTrend(filters),
      getByKategori(filters),
      getByBranch(filters),
      getTiers(filters),
      getCustomerList({ ...filters, sort: 'revenue', page: 1, limit: 10 }),
      getCustomerList({ ...filters, sort: 'revenue', page: 1, limit: 200 }),
    ]).then(([k, t, kat, br, tier, top, all]) => {
      setKpi(k)
      setTrend(t)
      setByKat(kat)
      setByBranch(br)
      setTiers(tier)
      setTopCustomers(top)
      const lapsed = all.data?.filter(c => c.days_since_purchase >= 90) || []
      setLapsedCustomers(lapsed)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  const trendYears = trend?.years?.map(String) || []
  const targetNum = parseFloat(target.replace(/[^0-9.]/g, '')) || 0
  const tierPieData = tiers
    ? tiers.filter(t => t.count > 0).slice(0, 7).map(t => ({
        name: t.tier.split(' — ')[0],
        value: t.revenue,
      }))
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Sales Command Center</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Pantau performa bisnis & ambil tindakan berdasarkan data</p>
      </div>

      <GlobalFilters filters={filters} onChange={setFilters} availableFilters={availFilters} />

      {/* Target Input */}
      <Card style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>🎯 Target Revenue:</label>
          <input
            type="text"
            placeholder="Contoh: 5000000000"
            value={target}
            onChange={e => setTarget(e.target.value)}
            style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, flex: 1, maxWidth: 260 }}
          />
          {targetNum > 0 && (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{formatRupiah(targetNum)}</span>
          )}
        </div>
      </Card>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Revenue Progress */}
      {!loading && kpi && targetNum > 0 && (
        <RevenueProgress revenue={kpi.revenue} target={targetNum} />
      )}

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
        <SectionTitle>Revenue Semua Customer per Bulan</SectionTitle>
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
                  dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Tier Pie + Top Kategori */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <SectionTitle>Revenue per Customer Tier</SectionTitle>
          {loading ? <Skeleton height={240} /> : !tierPieData.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={tierPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} isAnimationActive>
                  {tierPieData.map((_, i) => <Cell key={i} fill={TIER_COLORS[i] || '#ccc'} />)}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionTitle>Top 5 Kategori Produk</SectionTitle>
          {loading ? <Skeleton height={240} /> : !byKat?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byKat.slice(0, 5)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis type="category" dataKey="kategori" tick={{ fontSize: 11, fill: '#888' }} width={110} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
                <Bar dataKey="revenue" name="Revenue" isAnimationActive>
                  {byKat.slice(0, 5).map((_, i) => (
                    <Cell key={i} fill={['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2'][i] || '#ccc'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Top Customers + Needs Attention */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <SectionTitle>Top 10 Customer</SectionTitle>
          {loading ? <Skeleton height={240} /> : !topCustomers?.data?.length ? <EmptyState /> : (
            <div style={{ overflowY: 'auto', maxHeight: 300 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>#</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Nama</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Revenue</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.data.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fde3e9'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '6px 8px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiahShort(c.revenue)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--color-text-muted)' }}>{c.tier?.split(' — ')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>⚠ Customer Perlu Perhatian (90+ hari)</SectionTitle>
          {loading ? <Skeleton height={240} /> : !lapsedCustomers ? <EmptyState /> : lapsedCustomers.length === 0 ? (
            <div style={{ color: '#22c55e', fontSize: 13, padding: '20px 0' }}>✓ Semua customer aktif dalam 90 hari terakhir!</div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: 300 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                {lapsedCustomers.length} customer belum beli dalam 90+ hari
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Nama</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Hari</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {lapsedCustomers.slice(0, 15).map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', background: c.days_since_purchase > 180 ? '#fde3e9' : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fde3e9'}
                      onMouseLeave={e => e.currentTarget.style.background = c.days_since_purchase > 180 ? '#fde3e9' : 'transparent'}
                    >
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: '6px 8px', color: c.days_since_purchase > 180 ? '#d31137' : '#f59e0b', fontWeight: 600 }}>
                        {c.days_since_purchase}h
                      </td>
                      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiahShort(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Recommendations */}
      {!loading && (
        <RecommendationPanel
          kpi={kpi}
          byKat={byKat}
          byBranch={byBranch}
          tiers={tiers}
          lapsedCount={lapsedCustomers?.length || 0}
          totalCustomers={topCustomers?.total || 0}
        />
      )}
    </div>
  )
}
