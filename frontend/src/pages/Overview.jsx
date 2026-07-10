import { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import {
  getFilters, getKPI, getRevenueTrend, getByKategori, getByBranch,
  getTiers, getCustomerList, getBillsAOV, getAlerts,
} from '../utils/api'

const TIER_COLORS = [
  '#d31137','#e0243f','#ec3650','#f44f64','#f96b7e','#fc8799',
  '#fca4b5','#fbbfc9','#f8d4dc','#f2e4e8','#eedce0','#e8d6d9','#e2d0d3',
]

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 },
  labelStyle: { color: '#fff', fontWeight: 600 },
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
      ? { emoji: '⚫', label: 'Baru sekali', color: '#888', ratio: null }
      : { emoji: '🟢', label: 'Baru', color: '#22c55e', ratio: null }
  }
  if (!avg_interval_hours) return { emoji: '⚪', label: '-', color: '#888', ratio: null }
  const ratio = hours_since_last / avg_interval_hours
  if (ratio >= 2.0) return { emoji: '🔴', label: `${ratio.toFixed(0)}× overdue`, color: '#d31137', ratio }
  if (ratio >= 1.5) return { emoji: '🟠', label: `${ratio.toFixed(1)}× interval`, color: '#f97316', ratio }
  if (ratio >= 1.0) return { emoji: '🟡', label: 'Mulai telat', color: '#f59e0b', ratio }
  return { emoji: '🟢', label: 'Aktif', color: '#22c55e', ratio }
}

function FilterBar({ filters, onChange, availFilters, target, onTargetChange }) {
  const years = availFilters.years || []
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  const kategoriList = availFilters.kategori || []
  const branches = availFilters.branches || []

  const selStyle = {
    border: '1px solid #ddd', borderRadius: 6, padding: '5px 8px',
    fontSize: 13, background: '#fff', cursor: 'pointer', color: '#222',
  }

  return (
    <div style={{
      position: 'sticky', top: 54, zIndex: 90,
      background: '#fff', borderBottom: '1px solid #e5e7eb',
      padding: '0 32px', height: 48,
      display: 'flex', alignItems: 'center', gap: 10,
      marginLeft: -32, marginRight: -32,
    }}>
      <select style={selStyle} value={filters.year || 'all'}
        onChange={e => onChange({ ...filters, year: e.target.value })}>
        <option value="all">Semua Tahun</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>

      <select style={selStyle} value={filters.month || 'all'}
        onChange={e => onChange({ ...filters, month: e.target.value })}>
        <option value="all">Semua Bulan</option>
        {months.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
      </select>

      <select style={selStyle} value={filters.kategori || 'all'}
        onChange={e => onChange({ ...filters, kategori: e.target.value })}>
        <option value="all">Semua Kategori</option>
        {kategoriList.map(k => <option key={k} value={k}>{k}</option>)}
      </select>

      <select style={selStyle} value={filters.branch || 'all'}
        onChange={e => onChange({ ...filters, branch: e.target.value })}>
        <option value="all">Semua Branch</option>
        {branches.map(b => <option key={b} value={b}>{b}</option>)}
      </select>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Target bulan ini:</span>
        <input
          type="text"
          placeholder="Rp ________"
          value={target}
          onChange={e => onTargetChange(e.target.value)}
          style={{ ...selStyle, width: 130 }}
        />
      </div>
    </div>
  )
}

function AlertBar({ alerts, targetNum, kpi, attentionRef }) {
  const chips = []

  if (alerts?.at_risk_count > 0) {
    chips.push({
      color: '#d31137', bg: '#fde3e9',
      text: `🔴 ${alerts.at_risk_count} customer At Risk — ${formatRupiahShort(alerts.at_risk_revenue)} potensi hilang`,
      ref: attentionRef,
    })
  }
  if (alerts?.lapsed_count > 0) {
    chips.push({
      color: '#f97316', bg: '#fff7ed',
      text: `🟠 ${alerts.lapsed_count} customer lapsed melebihi 2× interval normal`,
      ref: attentionRef,
    })
  }
  if (targetNum > 0 && kpi?.revenue != null) {
    const pct = (kpi.revenue / targetNum * 100).toFixed(1)
    chips.push({
      color: parseFloat(pct) >= 100 ? '#22c55e' : parseFloat(pct) >= 80 ? '#f59e0b' : '#d31137',
      bg: parseFloat(pct) >= 100 ? '#f0fdf4' : parseFloat(pct) >= 80 ? '#fef3c7' : '#fde3e9',
      text: `🟡 Revenue bulan ini ${pct}% dari target`,
      ref: null,
    })
  }

  if (!chips.length) return null

  return (
    <div style={{
      background: '#fff8f0', borderLeft: '4px solid #d31137', borderRadius: 8,
      padding: '10px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
    }}>
      {chips.map((chip, i) => (
        <span key={i}
          onClick={() => chip.ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          style={{
            background: chip.bg, color: chip.color, border: `1px solid ${chip.color}`,
            borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
            cursor: chip.ref ? 'pointer' : 'default', whiteSpace: 'nowrap',
          }}>
          {chip.text} {chip.ref ? '→' : ''}
        </span>
      ))}
    </div>
  )
}

function KPIRow({ kpi, targetNum, loading }) {
  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {[1,2,3,4].map(i => <SkeletonCard key={i} style={{ height: 88 }} />)}
    </div>
  )
  if (!kpi) return null

  const cards = [
    {
      title: 'TOTAL REVENUE',
      value: formatRupiahShort(kpi.revenue),
      change: kpi.revenue_change,
      showProgress: targetNum > 0,
      progressPct: targetNum > 0 ? Math.min(100, kpi.revenue / targetNum * 100) : 0,
    },
    { title: 'JUMLAH BILLS', value: kpi.bills?.toLocaleString('id'), change: kpi.bills_change },
    {
      title: 'AOV',
      value: formatRupiahShort(kpi.aov),
      change: kpi.aov_change,
      warn: kpi.aov_change != null && kpi.aov_change < -10,
    },
    { title: 'CUSTOMER AKTIF', value: kpi.customers?.toLocaleString('id'), change: kpi.customers_change },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {cards.map((c, i) => {
        const isPos = c.change > 0
        const changeColor = isPos ? '#22c55e' : '#d31137'
        return (
          <div key={i} style={{
            background: c.warn ? '#fde3e9' : '#fff',
            borderRadius: 10, padding: 16, height: 88, boxSizing: 'border-box',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            border: c.warn ? '1px solid #fca5a5' : '1px solid #f0f0f0',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '0.05em' }}>{c.title}</div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {c.change != null ? (
                <span style={{ fontSize: 11, color: changeColor, fontWeight: 600 }}>
                  {isPos ? '▲' : '▼'} {Math.abs(c.change)}% vs sblm
                </span>
              ) : <span />}
              {c.showProgress && (
                <div style={{ flex: 1, marginLeft: 8 }}>
                  <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2 }}>
                    <div style={{ height: 4, width: `${c.progressPct}%`, background: '#d31137', borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#888', textAlign: 'right' }}>{c.progressPct.toFixed(0)}% target</div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Overview() {
  const [availFilters, setAvailFilters] = useState({})
  const [filters, setFilters] = useState(null) // null until we know defaults
  const [target, setTarget] = useState(() => localStorage.getItem('targetRevenue') || '')
  const [kpi, setKpi] = useState(null)
  const [trend, setTrend] = useState(null)
  const [billsAov, setBillsAov] = useState(null)
  const [byKat, setByKat] = useState(null)
  const [tiers, setTiers] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [attentionCustomers, setAttentionCustomers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const attentionRef = useRef(null)

  const targetNum = parseFloat(target.replace(/[^0-9.]/g, '')) || 0

  useEffect(() => {
    getFilters().then(f => {
      setAvailFilters(f)
      // Set defaults: latest year + latest month from data
      const latestYear = f.years?.[0] ? String(f.years[0]) : 'all'
      setFilters({ year: latestYear, month: 'all', kategori: 'all', branch: 'all' })
    }).catch(() => setFilters({ year: 'all', month: 'all', kategori: 'all', branch: 'all' }))
  }, [])

  useEffect(() => {
    if (!target && target !== '') return
    localStorage.setItem('targetRevenue', target)
  }, [target])

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    setError(null)
    Promise.all([
      getKPI(filters),
      getRevenueTrend(filters),
      getBillsAOV(filters),
      getByKategori(filters),
      getTiers(filters),
      getAlerts(filters),
      getCustomerList({ year: filters.year, sort: 'overdue_ratio', page: 1, limit: 50 }),
    ]).then(([k, t, ba, kat, tier, al, cList]) => {
      setKpi(k)
      setTrend(t)
      setBillsAov(ba)
      setByKat(kat)
      setTiers(tier)
      setAlerts(al)
      // Filter customers needing attention (overdue ratio >= 1.5)
      const attn = (cList.data || []).filter(c =>
        c.overdue_ratio != null && c.overdue_ratio >= 1.5
      ).slice(0, 6)
      setAttentionCustomers(attn)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [JSON.stringify(filters)])

  const handleFilters = (f) => setFilters(f)

  const trendYears = (trend?.years || []).map(String)
  const YEAR_COLORS = { '2025': '#d31137', '2024': '#fc93a6', '2023': '#feb5c2', '2022': '#ffd5dc' }

  // AOV average for annotation
  const aovAvg = billsAov?.length ? billsAov.reduce((s, r) => s + (r.aov || 0), 0) / billsAov.length : 0
  const lastAov = billsAov?.slice(-1)[0]?.aov || 0
  const aovWarn = aovAvg > 0 && lastAov < aovAvg * 0.9

  // Tier bars: filter non-zero, top 7
  const tierData = (tiers || []).filter(t => t.count > 0).slice(0, 7).map(t => ({
    tier: t.tier.split(' — ')[0],
    revenue: t.revenue,
    count: t.count,
    label: `${formatRupiahShort(t.revenue)} (${t.count})`,
  }))

  const katData = (byKat || []).slice(0, 5)

  if (!filters) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FilterBar
        filters={filters}
        onChange={handleFilters}
        availFilters={availFilters}
        target={target}
        onTargetChange={setTarget}
      />

      {/* Alert Bar */}
      {!loading && <AlertBar alerts={alerts} targetNum={targetNum} kpi={kpi} attentionRef={attentionRef} />}
      {error && (
        <div style={{ background: '#fde3e9', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#d31137' }}>
          ⚠ Gagal memuat data: {error}
        </div>
      )}

      {/* KPI Row */}
      <KPIRow kpi={kpi} targetNum={targetNum} loading={loading} />

      {/* Chart row 60/40 */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12 }}>
        {/* Revenue Trend */}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Revenue Trend — 3 Tahun</div>
          {loading ? <Skeleton height={220} /> : !trend?.data?.length ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} width={68} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {targetNum > 0 && (
                  <ReferenceLine y={targetNum} stroke="#888" strokeDasharray="4 4"
                    label={{ value: 'Target', fill: '#888', fontSize: 11, position: 'right' }} />
                )}
                {trendYears.slice(0, 3).map((y, idx) => (
                  <Line key={y} type="monotone" dataKey={y} name={y}
                    stroke={YEAR_COLORS[y] || '#ccc'}
                    strokeWidth={idx === 0 ? 2.5 : 1.5}
                    strokeDasharray={idx === 2 ? '5 3' : undefined}
                    dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Bills vs AOV */}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            Bills vs AOV
            {aovWarn && !loading && <span style={{ marginLeft: 8, fontSize: 11, color: '#f59e0b', fontWeight: 500 }}>⚠ AOV turun</span>}
          </div>
          {loading ? <Skeleton height={220} /> : !billsAov?.length ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={billsAov}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#888' }} width={40} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} width={60} />
                <Tooltip {...tooltipStyle} formatter={(v, name) => name === 'AOV' ? formatRupiah(v) : v} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="bills" name="Bills" fill="#fc93a6" />
                <Line yAxisId="right" type="monotone" dataKey="aov" name="AOV" stroke="#d31137" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Secondary row — 3 col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {/* Tier bar */}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Revenue per Customer Tier</div>
          {loading ? <Skeleton height={200} /> : !tierData.length ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tierData} layout="vertical" margin={{ right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis type="category" dataKey="tier" tick={{ fontSize: 11, fill: '#888' }} width={48} />
                <Tooltip {...tooltipStyle} formatter={(v, name, props) =>
                  [`${formatRupiah(v)} (${props.payload.count} cust)`, 'Revenue']}
                />
                <Bar dataKey="revenue" name="Revenue" isAnimationActive radius={[0, 3, 3, 0]}>
                  {tierData.map((_, i) => <Cell key={i} fill={TIER_COLORS[i] || '#ccc'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top 5 Kategori */}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top 5 Kategori</div>
          {loading ? <Skeleton height={200} /> : !katData.length ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={katData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis type="category" dataKey="kategori" tick={{ fontSize: 11, fill: '#888' }} width={80} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
                <Bar dataKey="revenue" name="Revenue" isAnimationActive radius={[0, 3, 3, 0]}>
                  {katData.map((_, i) => (
                    <Cell key={i} fill={['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2'][i] || '#ccc'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Customer Perlu Perhatian */}
        <Card style={{ padding: 16 }} ref_={attentionRef}>
          <div ref={attentionRef} style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Customer Perlu Perhatian</div>
          {loading ? <Skeleton height={200} /> : !attentionCustomers ? null : attentionCustomers.length === 0 ? (
            <div style={{ color: '#22c55e', fontSize: 13, paddingTop: 12 }}>✓ Tidak ada customer overdue saat ini</div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    {['Nama', 'Avg Interval', 'Sejak Beli', 'Status'].map(h => (
                      <th key={h} style={{ padding: '4px 6px', textAlign: 'left', color: '#888', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attentionCustomers.map((c, i) => {
                    const st = getActivityStatus(c)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '5px 6px', fontWeight: 500, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '5px 6px', color: '#888' }}>{formatDuration(c.avg_interval_hours)}</td>
                        <td style={{ padding: '5px 6px', color: '#888' }}>{formatDuration(c.hours_since_last)}</td>
                        <td style={{ padding: '5px 6px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.emoji} {st.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                <a href="/customers" style={{ color: '#d31137', textDecoration: 'none', fontWeight: 500 }}>Lihat semua →</a>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
