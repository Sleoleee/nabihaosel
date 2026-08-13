import { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { getTiers, getCustomerList, getFilters, getCustomerSummary, getRfmBubble } from '../utils/api'

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 },
  labelStyle: { color: '#fff', fontWeight: 600 },
  itemStyle: { color: '#fff' },
  cursor: { fill: 'rgba(255,255,255,0.06)' },
}

const RFM_COLORS = {
  Champions:       { bg: '#dcfce7', text: '#166534', bar: '#22c55e' },
  Loyal:           { bg: '#d1fae5', text: '#065f46', bar: '#4ade80' },
  Promising:       { bg: '#fef9c3', text: '#854d0e', bar: '#fbbf24' },
  'Need Attention':{ bg: '#ffedd5', text: '#9a3412', bar: '#f59e0b' },
  'At Risk':       { bg: '#fee2e2', text: '#991b1b', bar: '#fc617e' },
  Lost:            { bg: '#f1f5f9', text: '#475569', bar: '#d31137' },
}

const TIER_COLORS = [
  '#d31137','#e0243f','#ec3650','#f44f64','#f96b7e','#fc8799',
  '#fca4b5','#fbbfc9','#f8d4dc','#f2e4e8','#eedce0','#e8d6d9','#e2d0d3',
]

const RFM_DISPLAY_ORDER = ['At Risk', 'Lost', 'Need Attention', 'Promising', 'Loyal', 'Champions']

// Aksi spesifik & manusiawi per segmen
const SEGMENT_ACTION = {
  'At Risk':        'Hubungi langsung dengan penawaran comeback terbatas dalam 7 hari ke depan.',
  Lost:            'Jalankan campaign win-back besar; bila tak merespons, stop biaya akuisisi ke mereka.',
  'Need Attention': 'Kirim pengingat + promo terbatas sebelum mereka benar-benar menjauh.',
  Promising:       'Tawarkan produk pelengkap agar frekuensi belanjanya meningkat.',
  Loyal:           'Beri program poin/target bulanan supaya naik kelas jadi Champions.',
  Champions:       'Beri reward eksklusif & akses awal; jadikan mereka pelanggan advokat.',
}

function tierOptionLabel(tier) {
  const parts = String(tier).split('— ')
  const range = parts[1] ? parts[1].trim() : tier
  return `Avg. Spend/bln ${range}`
}

function tierSpendRange(tier) {
  const parts = String(tier).split('— ')
  return parts[1] ? parts[1].trim() : ''
}

function formatDuration(hours) {
  if (!hours && hours !== 0) return '-'
  return `${Math.round(hours / 24)} hari`
}

function getActivityStatus(c) {
  const { hours_since_last, avg_interval_hours, bills } = c
  if (!bills || bills <= 1) {
    return hours_since_last > 720
      ? { emoji: '⚫', label: 'Baru sekali', color: '#888', bg: '#f0f0f0', ratio: 9999 }
      : { emoji: '🟢', label: 'Baru', color: '#22c55e', bg: '#f0fdf4', ratio: 0 }
  }
  if (!avg_interval_hours) return { emoji: '⚪', label: '-', color: '#888', bg: '#f0f0f0', ratio: 0 }
  const ratio = hours_since_last / avg_interval_hours
  if (ratio >= 2.0) return { emoji: '🔴', label: `${ratio.toFixed(0)}× overdue`, color: '#d31137', bg: '#fde3e9', ratio }
  if (ratio >= 1.5) return { emoji: '🟠', label: `${ratio.toFixed(1)}× interval`, color: '#f97316', bg: '#fff7ed', ratio }
  if (ratio >= 1.0) return { emoji: '🟡', label: 'Mulai telat', color: '#f59e0b', bg: '#fef9c3', ratio }
  return { emoji: '🟢', label: 'Aktif', color: '#22c55e', bg: '#f0fdf4', ratio }
}

function ChangeBadge({ change, invert = false }) {
  if (change == null) return <span style={{ fontSize: 11, color: '#bbb' }}>— vs thn lalu</span>
  const pos = change > 0
  const good = invert ? !pos : pos
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: good ? '#22c55e' : '#d31137' }}>
      {pos ? '▲' : '▼'} {Math.abs(change)}% vs thn lalu
    </span>
  )
}

export default function CustomerIntelligence() {
  const [years, setYears] = useState([])
  const [filters, setFilters] = useState(null)
  const [segFilter, setSegFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [summary, setSummary] = useState(null)
  const [tiers, setTiers] = useState(null)
  const [bubble, setBubble] = useState(null)
  const [custList, setCustList] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sumLoading, setSumLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const tableRef = useRef(null)

  useEffect(() => {
    getFilters().then(f => {
      setYears(f.years || [])
      const latestYear = f.years?.[0] ? String(f.years[0]) : 'all'
      setFilters({ year: latestYear })
    }).catch(() => setFilters({ year: 'all' }))
  }, [])

  // Year-only data: tier distribution + RFM bubble
  useEffect(() => {
    if (!filters) return
    setLoading(true); setError(null)
    Promise.all([getTiers(filters), getRfmBubble(filters)])
      .then(([t, b]) => { setTiers(t); setBubble(b) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [JSON.stringify(filters)])

  // KPI summary reacts to year + segment + tier
  useEffect(() => {
    if (!filters) return
    setSumLoading(true)
    getCustomerSummary({ year: filters.year, ...(segFilter !== 'all' ? { segment: segFilter } : {}), ...(tierFilter !== 'all' ? { tier: tierFilter } : {}) })
      .then(setSummary).catch(() => {}).finally(() => setSumLoading(false))
  }, [JSON.stringify(filters), segFilter, tierFilter])

  useEffect(() => { setPage(1) }, [segFilter, tierFilter])

  // Customer table
  useEffect(() => {
    if (!filters) return
    setListLoading(true)
    const params = {
      year: filters.year, page, limit: 25, sort: 'overdue_ratio',
      ...(search ? { search } : {}),
      ...(segFilter !== 'all' ? { segment: segFilter } : {}),
      ...(tierFilter !== 'all' ? { tier: tierFilter } : {}),
    }
    getCustomerList(params).then(setCustList).catch(() => {}).finally(() => setListLoading(false))
  }, [JSON.stringify(filters), page, search, segFilter, tierFilter])

  const setFilterAndScroll = (seg) => {
    setSegFilter(seg)
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const selStyle = {
    border: '1px solid #ddd', borderRadius: 6, padding: '5px 8px',
    fontSize: 12, background: '#fff', cursor: 'pointer',
  }

  if (!filters) return null

  // Derived: tier distribution
  const totalTierRevenue = (tiers || []).reduce((s, t) => s + (t.revenue || 0), 0)
  const tierData = (tiers || []).filter(t => t.count > 0).slice(0, 8).map(t => ({
    tier: t.tier.split(' — ')[0],
    range: tierSpendRange(t.tier),
    count: t.count,
    revenue: t.revenue,
    pctRev: totalTierRevenue ? (t.revenue / totalTierRevenue * 100) : 0,
  }))

  // Derived: segments from bubble
  const segMap = {}
  ;(bubble || []).forEach(b => { segMap[b.segment] = b })
  const seg = (name) => segMap[name] || { count: 0, revenue: 0 }

  // KPI cards
  const ch = summary?.changes || {}
  const kpiCards = [
    { title: 'TOTAL CUSTOMER', value: summary ? formatNumber(summary.total_customers) : '-', foot: <ChangeBadge change={ch.total_customers} /> },
    { title: 'AVG REVENUE / CUSTOMER', value: summary ? formatRupiahShort(summary.avg_rev_per_customer) : '-', foot: <ChangeBadge change={ch.avg_rev_per_customer} /> },
    { title: 'AVERAGE RETENTION DAYS', value: summary ? `${summary.avg_retention_days} hari` : '-', foot: <ChangeBadge change={ch.avg_retention_days} invert /> },
    {
      title: 'REVENUE AT RISK', value: summary ? formatRupiahShort(summary.revenue_at_risk) : '-', accent: '#d31137',
      foot: <span style={{ fontSize: 11, color: '#888' }}>≈ {summary?.pct_revenue_at_risk ?? 0}% dari total revenue · {summary?.overdue_count ?? 0} pelanggan jatuh tempo</span>,
    },
    {
      title: 'OVERDUE RATE', value: summary ? `${summary.overdue_rate}%` : '-', accent: '#f97316',
      foot: <span style={{ fontSize: 11, color: '#888' }}>Retensi tepat waktu {summary?.retention_rate ?? 0}%</span>,
    },
  ]

  // Recommendations (human, specific)
  const recRows = [
    { seg: 'At Risk', level: 'URGENT', dot: '🔴' },
    { seg: 'Lost', level: 'URGENT', dot: '🔴' },
    { seg: 'Loyal', level: 'PELUANG', dot: '🟢' },
    { seg: 'Need Attention', level: 'PANTAU', dot: '🟡' },
  ].map(r => ({ ...r, data: seg(r.seg) })).filter(r => r.data.count > 0)

  // Bubble chart data
  const bubbleData = RFM_DISPLAY_ORDER.map(s => segMap[s]).filter(Boolean).map(b => ({
    ...b, x: b.avg_recency_days, y: b.avg_frequency, z: b.count,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filter bar */}
      <div style={{
        position: 'sticky', top: 108, zIndex: 90, background: '#fff',
        borderBottom: '1px solid #e5e7eb', padding: '0 32px', height: 48,
        display: 'flex', alignItems: 'center', gap: 10, marginLeft: -32, marginRight: -32,
      }}>
        <select style={selStyle} value={filters.year || 'all'}
          onChange={e => { setFilters({ year: e.target.value }); setPage(1) }}>
          <option value="all">Semua Tahun</option>
          {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>

        <select style={selStyle} value={segFilter} onChange={e => setSegFilter(e.target.value)}>
          <option value="all">Semua Segmen RFM</option>
          {RFM_DISPLAY_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Judul filter tetap "Jenis Tier"; label opsi = Avg. Spend/bln */}
        <select style={selStyle} value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="all">Semua Tier</option>
          {(tiers || []).filter(t => t.count > 0).map(t => (
            <option key={t.tier} value={t.tier}>{tierOptionLabel(t.tier)}</option>
          ))}
        </select>

        <input placeholder="🔍 Cari nama customer..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ ...selStyle, width: 200, marginLeft: 4 }} />
      </div>

      {error && (
        <div style={{ background: '#fde3e9', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#d31137' }}>⚠ {error}</div>
      )}

      {/* KPI Row — 5 cards, reaktif terhadap tahun+segmen+tier */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {sumLoading ? [1,2,3,4,5].map(i => <SkeletonCard key={i} style={{ height: 96 }} />) : kpiCards.map((c, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 10, padding: 16, minHeight: 96, boxSizing: 'border-box',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0',
            borderTop: c.accent ? `3px solid ${c.accent}` : '1px solid #f0f0f0',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6,
          }}>
            <div style={{ fontSize: 10.5, color: '#888', fontWeight: 600, letterSpacing: '0.04em' }}>{c.title}</div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: c.accent || 'var(--color-text)' }}>{c.value}</div>
            <div>{c.foot}</div>
          </div>
        ))}
      </div>

      {/* Row 2: Tier Distribution (1/3) + Aksi Disarankan (2/3) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Customer Tier Distribution</div>
          {loading ? <Skeleton height={260} /> : !tierData.length ? (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, tierData.length * 34)}>
              <BarChart data={tierData} layout="vertical" margin={{ left: 8, right: 44 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} />
                <YAxis type="category" dataKey="tier" width={96} tick={({ x, y, payload }) => {
                  const d = tierData.find(t => t.tier === payload.value) || {}
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={-6} y={-2} textAnchor="end" fontSize={11} fontWeight={600} fill="#444">{payload.value}</text>
                      <text x={-6} y={10} textAnchor="end" fontSize={9} fill="#999">{d.range}</text>
                    </g>
                  )
                }} />
                <Tooltip {...tooltipStyle} formatter={(v, n, p) => [
                  `${p.payload.count} cust · ${formatRupiahShort(p.payload.revenue)} · ${p.payload.pctRev.toFixed(1)}% dari total revenue`, p.payload.tier,
                ]} />
                <Bar dataKey="count" name="Customer" radius={[0, 3, 3, 0]}>
                  {tierData.map((_, i) => <Cell key={i} fill={TIER_COLORS[i] || '#ccc'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div style={{ marginTop: 4, fontSize: 10, color: '#aaa' }}>Angka di bawah nama tier = rata-rata belanja per bulan.</div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Aksi yang Disarankan</div>
          {loading ? <Skeleton height={240} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recRows.length === 0 && <div style={{ fontSize: 13, color: '#22c55e' }}>✅ Base customer dalam kondisi sehat — tidak ada aksi mendesak.</div>}
              {recRows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                    background: RFM_COLORS[r.seg]?.bg, color: RFM_COLORS[r.seg]?.text,
                  }}>{r.dot} {r.level}</span>
                  <div style={{ fontSize: 12.5, color: '#333', lineHeight: 1.4 }}>
                    <b>{r.data.count} pelanggan {r.seg}</b> ({formatRupiahShort(r.data.revenue)}). {SEGMENT_ACTION[r.seg]}{' '}
                    <button onClick={() => setFilterAndScroll(r.seg)}
                      style={{ fontSize: 12, color: '#d31137', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                      [Filter ke {r.seg}]
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Row 3: RFM Matrix bubble (2/3) + keterangan per segmen (1/3) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>RFM Matrix</div>
          <div style={{ fontSize: 10.5, color: '#aaa', marginBottom: 8 }}>
            Sumbu X = Recency (hari sejak beli, makin kiri makin baru) · Sumbu Y = Frequency (jumlah bills) · Ukuran bubble = jumlah customer
          </div>
          {loading ? <Skeleton height={280} /> : !bubbleData.length ? (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" dataKey="x" name="Recency (hari)" tick={{ fontSize: 11, fill: '#888' }}
                  label={{ value: 'Recency (hari sejak beli)', position: 'insideBottom', offset: -14, fontSize: 11, fill: '#888' }} />
                <YAxis type="number" dataKey="y" name="Frequency (bills)" tick={{ fontSize: 11, fill: '#888' }}
                  label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#888' }} />
                <ZAxis type="number" dataKey="z" range={[300, 2600]} name="Customer" />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fff' }}>
                      <div style={{ fontWeight: 700, marginBottom: 3, color: RFM_COLORS[d.segment]?.bar }}>{d.segment}</div>
                      <div>{formatNumber(d.count)} customer · {formatRupiahShort(d.revenue)}</div>
                      <div style={{ color: '#bbb' }}>Recency {d.avg_recency_days} hari · Frequency {d.avg_frequency} bills</div>
                    </div>
                  )
                }} />
                {bubbleData.map(d => (
                  <Scatter key={d.segment} name={d.segment} data={[d]} fill={RFM_COLORS[d.segment]?.bar || '#ccc'} fillOpacity={0.75} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Ringkasan per Segmen</div>
          {loading ? <Skeleton height={280} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {RFM_DISPLAY_ORDER.map(s => segMap[s]).filter(Boolean).map((b, i) => (
                <div key={i} style={{ borderLeft: `3px solid ${RFM_COLORS[b.segment]?.bar}`, paddingLeft: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: RFM_COLORS[b.segment]?.text }}>{b.segment}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>{formatNumber(b.count)} cust · {formatRupiahShort(b.revenue)}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#777', lineHeight: 1.3 }}>{SEGMENT_ACTION[b.segment]}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Customer Table */}
      <Card style={{ padding: 16 }} ref={tableRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Daftar Customer</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {segFilter !== 'all' && (
              <span style={{ background: RFM_COLORS[segFilter]?.bg || '#f0f0f0', color: RFM_COLORS[segFilter]?.text || '#333', fontSize: 11, padding: '2px 10px', borderRadius: 12, fontWeight: 600 }}>
                {segFilter}
                <button onClick={() => setSegFilter('all')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'inherit', marginLeft: 4 }}>✕</button>
              </span>
            )}
            <select style={{ ...selStyle }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="lapsed">Lapsed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        {listLoading ? <Skeleton height={200} /> : (() => {
          const all = custList?.data || []
          const rows = statusFilter === 'all' ? all : all.filter(c => {
            const st = getActivityStatus(c)
            if (statusFilter === 'aktif') return st.ratio < 1.0
            if (statusFilter === 'lapsed') return st.ratio >= 1.0 && st.ratio < 2.0
            if (statusFilter === 'overdue') return st.ratio >= 2.0
            return true
          })
          if (!rows.length) return <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: 13 }}>Tidak ada customer yang sesuai filter ini.</div>
          return (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                      {['Nama Customer', 'Tier', 'Segmen RFM', 'Total Revenue', 'Avg/Bulan', 'Bills', 'Terakhir Beli', 'Status Keaktifan'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#888', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c, i) => {
                      const st = getActivityStatus(c)
                      const rfmC = RFM_COLORS[c.rfm_segment] || { bg: '#f0f0f0', text: '#333' }
                      const rowBg = st.ratio >= 2.0 ? '#fde3e9' : st.ratio >= 1.0 ? '#fff8e1' : 'transparent'
                      return (
                        <tr key={i} style={{ background: rowBg, borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                          <td style={{ padding: '6px 8px', fontSize: 11 }}>
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>{c.tier?.split(' — ')[0]}</span>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            {c.rfm_segment && <span style={{ background: rfmC.bg, color: rfmC.text, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{c.rfm_segment}</span>}
                          </td>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{formatRupiahShort(c.revenue)}</td>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{formatRupiahShort(c.avg_monthly)}</td>
                          <td style={{ padding: '6px 8px' }}>{c.bills}</td>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', fontSize: 11, color: '#666' }}>{c.last_purchase}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color }}>{st.emoji} {st.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 12, color: '#888' }}>{custList?.total || 0} customer{segFilter !== 'all' ? ` (${segFilter})` : ''}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer', background: '#fff', fontSize: 12, color: page === 1 ? '#ccc' : '#333' }}>← Prev</button>
                  <span style={{ padding: '5px 10px', fontSize: 12, color: '#888' }}>Hal {page}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={page * 25 >= (custList?.total || 0)}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer', background: '#fff', fontSize: 12 }}>Next →</button>
                </div>
              </div>
            </>
          )
        })()}
      </Card>
    </div>
  )
}
