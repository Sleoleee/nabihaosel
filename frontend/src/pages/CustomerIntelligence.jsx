import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { getRFM, getTiers, getCustomerList, getRecency, getFilters, getRevenueTrend, getByKategori } from '../utils/api'

const YEAR_COLORS = { '2025': '#d31137', '2024': '#fc3961', '2023': '#fc93a6', '2022': '#feb5c2' }

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13 },
  labelStyle: { color: '#fff', fontWeight: 600 },
}

function SectionTitle({ children }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{children}</h3>
}

function KPITile({ title, value, sub, highlight }) {
  return (
    <Card>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: highlight || 'var(--color-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{sub}</div>}
    </Card>
  )
}

function RecommendationPanel({ rfm, recency, tiers, lapsedCount, totalCustomers, custList }) {
  const items = useMemo(() => {
    const recs = []

    const champions = rfm?.segments?.find(s => s.segment === 'Champions')
    const atRisk = rfm?.segments?.find(s => s.segment === 'At Risk')
    const lost = rfm?.segments?.find(s => s.segment === 'Lost')
    const loyal = rfm?.segments?.find(s => s.segment === 'Loyal')

    if (atRisk && atRisk.count > 0) {
      recs.push({
        priority: 'high',
        icon: '🔴',
        title: `${atRisk.count} customer "At Risk" terdeteksi`,
        action: `Customer At Risk pernah aktif tapi mulai jarang beli. Hubungi mereka dengan penawaran personal sebelum benar-benar hilang. Revenue potensial: ${formatRupiahShort(atRisk.revenue)}.`,
      })
    }

    if (lost && lost.count > 0) {
      recs.push({
        priority: 'high',
        icon: '⚫',
        title: `${lost.count} customer sudah "Lost"`,
        action: `Customer ini sudah lama tidak bertransaksi. Coba campaign win-back dengan diskon atau promo eksklusif. Jika tidak respon, pertimbangkan untuk di-archive.`,
      })
    }

    if (lapsedCount > 0) {
      recs.push({
        priority: 'high',
        icon: '⚠',
        title: `${lapsedCount} customer belum beli 90+ hari`,
        action: 'Buat daftar follow-up prioritas. Hubungi via telepon atau WhatsApp dengan penawaran reaktivasi.',
      })
    }

    if (champions && champions.count > 0) {
      recs.push({
        priority: 'low',
        icon: '🏆',
        title: `${champions.count} customer Champions — lindungi mereka`,
        action: `Champions adalah customer terbaik (beli sering, nilai tinggi, baru-baru ini). Berikan pelayanan VIP, early access produk baru, atau program loyalty eksklusif.`,
      })
    }

    if (loyal && loyal.count > 0) {
      recs.push({
        priority: 'medium',
        icon: '⭐',
        title: `${loyal.count} customer Loyal siap diupgrade ke Champions`,
        action: `Dorong customer Loyal untuk beli lebih sering dengan program reward atau target pembelian bulanan.`,
      })
    }

    const tier1 = tiers?.find(t => t.tier?.includes('Tier 1'))
    if (tier1 && tier1.count > 0) {
      recs.push({
        priority: 'low',
        icon: '💎',
        title: `${tier1.count} customer Tier 1 (≥30jt/bulan) — prioritas utama`,
        action: `Customer Tier 1 adalah pilar pendapatan. Pastikan sales senior menangani langsung dan tidak ada keluhan yang terlambat ditangani.`,
      })
    }

    const recency91180 = recency?.find(r => r.bucket === '91–180')
    const recency180plus = recency?.find(r => r.bucket === '180+')
    const longLapsed = (recency91180?.count || 0) + (recency180plus?.count || 0)
    if (longLapsed > 5) {
      recs.push({
        priority: 'medium',
        icon: '📞',
        title: `${longLapsed} customer tidak aktif 3-6+ bulan`,
        action: 'Jadwalkan panggilan follow-up mingguan. Tanyakan apakah ada masalah layanan atau kompetitor yang lebih menarik.',
      })
    }

    if (recs.length === 0) {
      recs.push({
        priority: 'low',
        icon: '✅',
        title: 'Base customer dalam kondisi sehat',
        action: 'Fokus pada pertumbuhan: rekrut customer baru dan tingkatkan AOV customer bestaan.',
      })
    }

    return recs.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]))
  }, [rfm, recency, tiers, lapsedCount])

  const priorityColors = { high: '#d31137', medium: '#f59e0b', low: '#22c55e' }
  const priorityBg = { high: '#fde3e9', medium: '#fef3c7', low: '#f0fdf4' }
  const priorityLabel = { high: 'URGENT', medium: 'PERHATIAN', low: 'INFO' }

  return (
    <Card>
      <SectionTitle>💡 Rekomendasi Customer Management</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            background: priorityBg[item.priority],
            borderLeft: `4px solid ${priorityColors[item.priority]}`,
            borderRadius: '0 8px 8px 0',
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: priorityColors[item.priority], color: '#fff', letterSpacing: '0.05em',
                  }}>{priorityLabel[item.priority]}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{item.action}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function CustomerIntelligence() {
  const [filters, setFilters] = useState({ year: 'all' })
  const [years, setYears] = useState([])
  const [rfm, setRfm] = useState(null)
  const [tiers, setTiers] = useState(null)
  const [recency, setRecency] = useState(null)
  const [custList, setCustList] = useState(null)
  const [trend, setTrend] = useState(null)
  const [byKat, setByKat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    getFilters().then(f => setYears(f.years || [])).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      getRFM(filters),
      getTiers(filters),
      getRecency(filters),
      getRevenueTrend(filters),
      getByKategori(filters),
    ])
      .then(([r, t, rec, tr, kat]) => {
        setRfm(r); setTiers(t); setRecency(rec); setTrend(tr); setByKat(kat)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  const loadList = () => {
    getCustomerList({ year: filters.year, page, limit: 25, search: search || undefined })
      .then(setCustList).catch(() => {})
  }
  useEffect(() => { loadList() }, [JSON.stringify(filters), page, search])

  // Derived metrics
  const totalCustomers = custList?.total || 0
  const avgAOV = rfm?.segments?.length
    ? rfm.segments.reduce((s, x) => s + (x.revenue || 0), 0) / Math.max(1, rfm.segments.reduce((s, x) => s + (x.count || 0), 0))
    : 0

  const recency180 = recency?.find(r => r.bucket === '180+')?.count || 0
  const recency0_30 = recency?.find(r => r.bucket === '0–30')?.count || 0
  const lapsedCount = custList
    ? (custList.data?.filter(c => c.days_since_purchase >= 90).length || 0)
    : 0
  const trendYears = trend?.years?.map(String) || []

  const SEGMENT_COLORS = {
    'Champions': '#d31137',
    'Loyal': '#fc3961',
    'Promising': '#22c55e',
    'Need Attention': '#f59e0b',
    'At Risk': '#f97316',
    'Lost': '#888',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Customer Dashboard</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Analisis, segmentasi, dan rekomendasi aksi untuk customer</p>
      </div>

      {/* Year Filter */}
      <Card style={{ display: 'flex', gap: 16, padding: '14px 20px', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tahun</label>
          <select value={filters.year || 'all'}
            onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}
            style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
            <option value="all">Semua</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
      </Card>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* KPI Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {loading ? [1,2,3,4].map(i => <SkeletonCard key={i} />) : <>
          <KPITile
            title="Total Customer"
            value={formatNumber(totalCustomers)}
            sub={`${recency0_30} aktif 30 hari terakhir`}
          />
          <KPITile
            title="Avg Revenue/Customer"
            value={formatRupiahShort(avgAOV)}
            sub="berdasarkan segmen RFM"
          />
          <KPITile
            title="Customer Tidak Aktif"
            value={formatNumber(recency180)}
            sub="belum beli 180+ hari"
            highlight={recency180 > 10 ? '#d31137' : undefined}
          />
          <KPITile
            title="Champions + Loyal"
            value={formatNumber(
              (rfm?.segments?.find(s => s.segment === 'Champions')?.count || 0) +
              (rfm?.segments?.find(s => s.segment === 'Loyal')?.count || 0)
            )}
            sub="customer bernilai tinggi"
            highlight="#22c55e"
          />
        </>}
      </div>

      {/* Revenue Trend */}
      <Card>
        <SectionTitle>Revenue Trend</SectionTitle>
        {loading ? <Skeleton height={240} /> : !trend?.data?.length ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#888' }} />
              <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 12, fill: '#888' }} width={72} />
              <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
              <Legend />
              {trendYears.map(y => (
                <Line key={y} type="monotone" dataKey={y} name={y}
                  stroke={YEAR_COLORS[y] || '#cccccc'} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Top 5 Kategori + RFM Segments */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        <Card>
          <SectionTitle>Top 5 Kategori Produk</SectionTitle>
          {loading ? <Skeleton height={220} /> : !byKat?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={220}>
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

        <Card>
          <SectionTitle>Segmen Customer (RFM)</SectionTitle>
          {loading ? <Skeleton height={220} /> : !rfm?.segments?.length ? <EmptyState /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {rfm.segments.sort((a, b) => b.count - a.count).map((seg, i) => {
                const maxCount = Math.max(...rfm.segments.map(s => s.count))
                const pct = maxCount > 0 ? seg.count / maxCount * 100 : 0
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: SEGMENT_COLORS[seg.segment] || '#ccc' }} />
                        <span style={{ fontSize: 13 }}>{seg.segment}</span>
                      </div>
                      <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                        <strong>{seg.count}</strong>
                        <span style={{ color: 'var(--color-text-muted)', marginLeft: 6, fontSize: 12 }}>{formatRupiahShort(seg.revenue)}</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                      <div style={{ height: 6, width: `${pct}%`, background: SEGMENT_COLORS[seg.segment] || '#ccc', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Recommendations */}
      {!loading && (
        <RecommendationPanel
          rfm={rfm}
          recency={recency}
          tiers={tiers}
          lapsedCount={lapsedCount}
          totalCustomers={totalCustomers}
          custList={custList}
        />
      )}

      {/* Customer Table */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <SectionTitle>Daftar Customer</SectionTitle>
          <input
            placeholder="Cari nama customer..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, width: 220 }}
          />
        </div>
        {!custList ? <Skeleton height={200} /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    {['Nama Customer', 'Tier', 'Total Revenue', 'Avg/Bulan', 'Bills', 'Terakhir Beli', 'Hari Sejak Beli'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {custList.data?.map((c, i) => {
                    const isLapsed = c.days_since_purchase >= 90
                    const isVeryLapsed = c.days_since_purchase >= 180
                    return (
                      <tr key={i} style={{
                        background: isVeryLapsed ? '#fde3e9' : isLapsed ? '#fef3c7' : 'transparent',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fde3e9'}
                        onMouseLeave={e => e.currentTarget.style.background = isVeryLapsed ? '#fde3e9' : isLapsed ? '#fef3c7' : 'transparent'}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 500 }}>{c.name}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>{c.tier}</td>
                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(c.revenue)}</td>
                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(c.avg_monthly)}</td>
                        <td style={{ padding: '8px 10px' }}>{c.bills}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{c.last_purchase}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                            background: isVeryLapsed ? '#fde3e9' : isLapsed ? '#fef3c7' : '#f0fdf4',
                            color: isVeryLapsed ? '#d31137' : isLapsed ? '#d97706' : '#22c55e',
                          }}>
                            {c.days_since_purchase >= 9999 ? '—' : `${c.days_since_purchase}h`}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {custList.total} customer ditemukan
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', cursor: 'pointer', background: '#fff', fontSize: 13 }}>← Prev</button>
                <span style={{ padding: '6px 12px', fontSize: 13 }}>Hal {page}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page * 25 >= custList.total}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', cursor: 'pointer', background: '#fff', fontSize: 13 }}>Next →</button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
