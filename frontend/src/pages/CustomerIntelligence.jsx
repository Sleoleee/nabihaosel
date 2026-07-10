import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { getRFM, getTiers, getCustomerList, getRecency, getFilters } from '../utils/api'

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 },
  labelStyle: { color: '#fff', fontWeight: 600 },
}

const RFM_COLORS = {
  Champions:      { bg: '#dcfce7', text: '#166534', bar: '#22c55e' },
  Loyal:          { bg: '#d1fae5', text: '#065f46', bar: '#4ade80' },
  Promising:      { bg: '#fef9c3', text: '#854d0e', bar: '#fbbf24' },
  'Need Attention':{ bg: '#ffedd5', text: '#9a3412', bar: '#f59e0b' },
  'At Risk':      { bg: '#fee2e2', text: '#991b1b', bar: '#fc617e' },
  Lost:           { bg: '#f1f5f9', text: '#475569', bar: '#d31137' },
}

const TIER_COLORS = [
  '#d31137','#e0243f','#ec3650','#f44f64','#f96b7e','#fc8799',
  '#fca4b5','#fbbfc9','#f8d4dc','#f2e4e8','#eedce0','#e8d6d9','#e2d0d3',
]

const RECENCY_COLORS = {
  '0–7':   '#22c55e',
  '8–30':  '#86efac',
  '31–60': '#fbbf24',
  '61–90': '#f97316',
  '91–180':'#fc617e',
  '180+':  '#d31137',
}

function formatDuration(hours) {
  if (!hours && hours !== 0) return '-'
  if (hours < 72) return `${Math.round(hours)}j`
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

const RFM_DISPLAY_ORDER = ['At Risk', 'Lost', 'Need Attention', 'Promising', 'Loyal', 'Champions']

export default function CustomerIntelligence() {
  const [years, setYears] = useState([])
  const [filters, setFilters] = useState(null)
  const [segFilter, setSegFilter] = useState('all') // applied to table
  const [tierFilter, setTierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rfm, setRfm] = useState(null)
  const [tiers, setTiers] = useState(null)
  const [recency, setRecency] = useState(null)
  const [custList, setCustList] = useState(null)
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    setError(null)
    Promise.all([getRFM(filters), getTiers(filters), getRecency(filters)])
      .then(([r, t, rec]) => { setRfm(r); setTiers(t); setRecency(rec) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [JSON.stringify(filters)])

  useEffect(() => {
    if (!filters) return
    setListLoading(true)
    const params = {
      year: filters.year,
      page,
      limit: 25,
      sort: 'overdue_ratio',
      ...(search ? { search } : {}),
      ...(segFilter !== 'all' ? { tier: undefined } : {}),
    }
    getCustomerList(params).then(data => {
      // Client-side filter by segFilter, tierFilter, statusFilter
      setCustList(data)
    }).catch(() => {}).finally(() => setListLoading(false))
  }, [JSON.stringify(filters), page, search])

  const setFilterAndScroll = (seg) => {
    setSegFilter(seg)
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  // RFM chart data in priority order
  const rfmData = RFM_DISPLAY_ORDER
    .map(seg => rfm?.segments?.find(s => s.segment === seg))
    .filter(Boolean)
    .map(s => ({ segment: s.segment, count: s.count, revenue: s.revenue }))

  const tierData = (tiers || []).filter(t => t.count > 0).slice(0, 7).map(t => ({
    tier: t.tier.split(' — ')[0],
    count: t.count,
    revenue: t.revenue,
  }))

  const recencyData = (recency || []).map(r => ({
    bucket: r.bucket,
    count: r.count,
    color: RECENCY_COLORS[r.bucket] || '#ccc',
  }))

  // KPI derived
  const totalCustomers = rfm?.segments?.reduce((s, x) => s + (x.count || 0), 0) || 0
  const totalRevenue = rfm?.segments?.reduce((s, x) => s + (x.revenue || 0), 0) || 0
  const avgRevPerCust = totalCustomers > 0 ? totalRevenue / totalCustomers : 0
  const perluAksiCount = (rfm?.segments?.find(s => s.segment === 'At Risk')?.count || 0) +
    (rfm?.segments?.find(s => s.segment === 'Lost')?.count || 0)
  const champLoyalCount = (rfm?.segments?.find(s => s.segment === 'Champions')?.count || 0) +
    (rfm?.segments?.find(s => s.segment === 'Loyal')?.count || 0)
  const activeRecent = recency?.find(r => r.bucket === '0–7')?.count || 0

  // Client-side filtering of custList
  const allCustomers = custList?.data || []
  const filtered = allCustomers.filter(c => {
    if (segFilter !== 'all' && c.rfm_segment !== segFilter) return false
    if (tierFilter !== 'all' && c.tier !== tierFilter) return false
    if (statusFilter !== 'all') {
      const st = getActivityStatus(c)
      if (statusFilter === 'aktif' && st.ratio >= 1.0) return false
      if (statusFilter === 'lapsed' && !(st.ratio >= 1.5 && st.ratio < 2.0)) return false
      if (statusFilter === 'overdue' && !(st.ratio >= 2.0)) return false
    }
    return true
  })

  const selStyle = {
    border: '1px solid #ddd', borderRadius: 6, padding: '5px 8px',
    fontSize: 12, background: '#fff', cursor: 'pointer',
  }

  // Recommendations from RFM data
  const atRisk = rfm?.segments?.find(s => s.segment === 'At Risk')
  const lost = rfm?.segments?.find(s => s.segment === 'Lost')
  const loyal = rfm?.segments?.find(s => s.segment === 'Loyal')
  const champions = rfm?.segments?.find(s => s.segment === 'Champions')
  const tier1 = tiers?.find(t => t.tier?.includes('Tier 1'))

  if (!filters) return null

  const kpiCards = [
    {
      title: 'TOTAL CUSTOMER',
      value: formatNumber(totalCustomers),
      sub: `${activeRecent} aktif 7 hari terakhir`,
      onClick: null,
    },
    {
      title: 'AVG REV/CUSTOMER',
      value: formatRupiahShort(avgRevPerCust),
      sub: 'per customer',
      onClick: null,
    },
    {
      title: 'PERLU AKSI',
      value: formatNumber(perluAksiCount),
      sub: 'At Risk + Lost',
      color: '#d31137',
      onClick: () => setFilterAndScroll('At Risk'),
      clickLabel: 'klik → filter',
    },
    {
      title: 'CHAMPIONS + LOYAL',
      value: formatNumber(champLoyalCount),
      sub: 'nilai tinggi',
      color: '#22c55e',
      onClick: () => setFilterAndScroll('Champions'),
      clickLabel: 'klik → filter',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filter bar */}
      <div style={{
        position: 'sticky', top: 54, zIndex: 90,
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '0 32px', height: 48,
        display: 'flex', alignItems: 'center', gap: 10,
        marginLeft: -32, marginRight: -32,
      }}>
        <select style={selStyle} value={filters.year || 'all'}
          onChange={e => { setFilters({ year: e.target.value }); setPage(1) }}>
          <option value="all">Semua Tahun</option>
          {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>

        <select style={selStyle} value={segFilter}
          onChange={e => { setSegFilter(e.target.value); setPage(1) }}>
          <option value="all">Semua Segmen RFM</option>
          {RFM_DISPLAY_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select style={selStyle} value={tierFilter}
          onChange={e => { setTierFilter(e.target.value); setPage(1) }}>
          <option value="all">Semua Tier</option>
          {(tiers || []).filter(t => t.count > 0).map(t => (
            <option key={t.tier} value={t.tier}>{t.tier}</option>
          ))}
        </select>

        <input
          placeholder="🔍 Cari nama customer..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ ...selStyle, width: 200, marginLeft: 4 }}
        />
      </div>

      {error && (
        <div style={{ background: '#fde3e9', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#d31137' }}>
          ⚠ {error}
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {loading ? [1,2,3,4].map(i => <SkeletonCard key={i} />) : kpiCards.map((c, i) => (
          <div key={i}
            onClick={c.onClick || undefined}
            style={{
              background: '#fff', borderRadius: 10, padding: 16, height: 88,
              boxSizing: 'border-box', boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              border: '1px solid #f0f0f0',
              cursor: c.onClick ? 'pointer' : 'default',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={e => { if (c.onClick) e.currentTarget.style.boxShadow = '0 2px 12px rgba(211,17,55,0.15)' }}
            onMouseLeave={e => { if (c.onClick) e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.07)' }}
          >
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '0.05em' }}>{c.title}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color || 'var(--color-text)' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: c.onClick ? '#d31137' : '#888' }}>
              {c.clickLabel || c.sub}
            </div>
          </div>
        ))}
      </div>

      {/* 3-panel row */}
      <div style={{ display: 'grid', gridTemplateColumns: '35% 30% 35%', gap: 12 }}>
        {/* RFM Segments */}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Segmen RFM</div>
          {loading ? <Skeleton height={200} /> : !rfmData.length ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rfmData} layout="vertical" margin={{ right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis type="category" dataKey="segment" tick={{ fontSize: 11, fill: '#888' }} width={88} />
                <Tooltip {...tooltipStyle}
                  formatter={(v, name, props) => [`${v} customer · ${formatRupiahShort(props.payload.revenue)}`, 'Segmen']} />
                <Bar dataKey="count" name="Customer" radius={[0, 3, 3, 0]}
                  onClick={(data) => setFilterAndScroll(data.segment)}>
                  {rfmData.map((d, i) => (
                    <Cell key={i} fill={RFM_COLORS[d.segment]?.bar || '#ccc'} cursor="pointer" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Tier Distribution */}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Tier Distribution</div>
          {loading ? <Skeleton height={200} /> : !tierData.length ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tierData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis type="category" dataKey="tier" tick={{ fontSize: 11, fill: '#888' }} width={40} />
                <Tooltip {...tooltipStyle}
                  formatter={(v, name, props) => [`${v} cust · ${formatRupiahShort(props.payload.revenue)}`, 'Tier']} />
                <Bar dataKey="count" name="Customer" radius={[0, 3, 3, 0]}>
                  {tierData.map((_, i) => <Cell key={i} fill={TIER_COLORS[i] || '#ccc'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Customer Recency */}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Customer Recency</div>
          {loading ? <Skeleton height={200} /> : !recencyData.length ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={recencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#888' }} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} width={36} />
                <Tooltip {...tooltipStyle} formatter={(v) => [v, 'Customer']} />
                <Bar dataKey="count" name="Customer" radius={[3, 3, 0, 0]}>
                  {recencyData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Compact Recommendations */}
      {!loading && (
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Aksi yang Disarankan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {atRisk?.count > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13 }}>
                <span>🔴 <strong>URGENT</strong></span>
                <span>{atRisk.count} customer At Risk · {formatRupiahShort(atRisk.revenue)} potensi hilang</span>
                <span style={{ color: '#888', fontSize: 12 }}>→ Hubungi sebelum akhir minggu ·</span>
                <button onClick={() => setFilterAndScroll('At Risk')}
                  style={{ fontSize: 12, color: '#d31137', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                  [Filter ke At Risk]
                </button>
              </div>
            )}
            {lost?.count > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13 }}>
                <span>🔴 <strong>URGENT</strong></span>
                <span>{lost.count} customer Lost · {formatRupiahShort(lost.revenue)} · Campaign win-back</span>
                <span style={{ color: '#888', fontSize: 12 }}>→ Coba promo eksklusif ·</span>
                <button onClick={() => setFilterAndScroll('Lost')}
                  style={{ fontSize: 12, color: '#d31137', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                  [Filter ke Lost]
                </button>
              </div>
            )}
            {loyal?.count > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13 }}>
                <span>🟡 <strong>PANTAU</strong></span>
                <span>{loyal.count} customer Loyal siap naik ke Champions</span>
                <span style={{ color: '#888', fontSize: 12 }}>→ Program reward / target bulanan ·</span>
                <button onClick={() => setFilterAndScroll('Loyal')}
                  style={{ fontSize: 12, color: '#d31137', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                  [Filter ke Loyal]
                </button>
              </div>
            )}
            {tier1?.count > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13 }}>
                <span>🔵 <strong>INFO</strong></span>
                <span>{tier1.count} customer Tier 1 — pastikan dilayani sales senior</span>
                <button onClick={() => { setTierFilter(tier1.tier); tableRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
                  style={{ fontSize: 12, color: '#d31137', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                  [Filter ke Tier 1]
                </button>
              </div>
            )}
            {!atRisk?.count && !lost?.count && (
              <div style={{ fontSize: 13, color: '#22c55e' }}>✅ Base customer dalam kondisi sehat</div>
            )}
          </div>
        </Card>
      )}

      {/* Customer Table */}
      <Card style={{ padding: 16 }} ref={tableRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Daftar Customer</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {segFilter !== 'all' && (
              <span style={{
                background: RFM_COLORS[segFilter]?.bg || '#f0f0f0',
                color: RFM_COLORS[segFilter]?.text || '#333',
                fontSize: 11, padding: '2px 10px', borderRadius: 12, fontWeight: 600,
              }}>{segFilter} ×
                <button onClick={() => setSegFilter('all')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'inherit', marginLeft: 4 }}>✕</button>
              </span>
            )}
            <select style={{ border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 12, background: '#fff' }}
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="lapsed">Lapsed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        {listLoading ? <Skeleton height={200} /> : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: 13 }}>
            Tidak ada customer yang sesuai filter ini.
          </div>
        ) : (
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
                  {filtered.map((c, i) => {
                    const st = getActivityStatus(c)
                    const rfmC = RFM_COLORS[c.rfm_segment] || { bg: '#f0f0f0', text: '#333' }
                    const rowBg = st.ratio >= 2.0 ? '#fde3e9' : st.ratio >= 1.0 ? '#fff8e1' : 'transparent'
                    return (
                      <tr key={i} style={{ background: rowBg, borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '6px 8px', fontSize: 11 }}>
                          <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                            {c.tier?.split(' — ')[0]}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {c.rfm_segment && (
                            <span style={{ background: rfmC.bg, color: rfmC.text, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                              {c.rfm_segment}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatRupiahShort(c.revenue)}</td>
                        <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatRupiahShort(c.avg_monthly)}</td>
                        <td style={{ padding: '6px 8px' }}>{c.bills}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', fontSize: 11, color: '#666' }}>{c.last_purchase}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                            background: st.bg, color: st.color,
                          }}>
                            {st.emoji} {st.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 12, color: '#888' }}>
                {custList?.total || 0} customer total {filtered.length < (custList?.data?.length || 0) ? `· ${filtered.length} sesuai filter` : ''}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer', background: '#fff', fontSize: 12, color: page === 1 ? '#ccc' : '#333' }}>← Prev</button>
                <span style={{ padding: '5px 10px', fontSize: 12, color: '#888' }}>Hal {page}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page * 25 >= (custList?.total || 0)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer', background: '#fff', fontSize: 12 }}>Next →</button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
