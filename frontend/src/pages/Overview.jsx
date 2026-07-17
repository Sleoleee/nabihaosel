import { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, BarChart, Bar, ComposedChart, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import {
  getFilters, getKPI, getRevenueTrend, getByKategori, getByBranch,
  getTiers, getCustomerList, getBillsAOV, getAlerts,
  getCategoryPairings, getSalesTargets,
} from '../utils/api'

const TIER_COLORS = [
  '#d31137','#e0243f','#ec3650','#f44f64','#f96b7e','#fc8799',
  '#fca4b5','#fbbfc9','#f8d4dc','#f2e4e8','#eedce0','#e8d6d9','#e2d0d3',
]
const DONUT_COLORS = [
  '#d31137','#5b6b82','#a8b3c4','#8b1a2b','#fc617e','#c9d1dc',
  '#f096a6','#3d4a5c','#fbbfc9','#7a8699','#e0243f','#cbd2db',
]

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 },
  labelStyle: { color: '#fff', fontWeight: 600 },
  itemStyle: { color: '#fff' },
  cursor: { fill: 'rgba(255,255,255,0.06)' },
}

function formatDuration(hours) {
  if (!hours && hours !== 0) return '-'
  const days = Math.round(hours / 24)
  return `${days} hari`
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

const SLICE_KEYS = ['kategori', 'branch', 'spv', 'salesperson']

function FilterBar({ filters, onChange, availFilters, target, onTargetChange }) {
  const years = availFilters.years || []
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  const kategoriList = availFilters.kategori || []
  const branchList = availFilters.branches || []
  const spvList = availFilters.spv || []
  const salespeople = availFilters.salespeople || []

  // Salesperson dropdown depends on selected SPV
  const spSel = filters.spv && filters.spv !== 'all'
    ? salespeople.filter(s => s.team === filters.spv)
    : salespeople

  const selStyle = {
    border: '1px solid #ddd', borderRadius: 6, padding: '5px 8px',
    fontSize: 12.5, background: '#fff', cursor: 'pointer', color: '#222',
  }

  // Selecting one slice resets the other slices (single-slice cache design)
  const pickSlice = (key, value, keepSpvForSalesperson = false) => {
    const next = { ...filters, [key]: value }
    SLICE_KEYS.forEach(k => {
      if (k !== key && !(keepSpvForSalesperson && k === 'spv')) next[k] = 'all'
    })
    onChange(next)
  }

  return (
    <div style={{
      position: 'sticky', top: 54, zIndex: 90,
      background: '#fff', borderBottom: '1px solid #e5e7eb',
      padding: '0 32px', minHeight: 48,
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      marginLeft: -32, marginRight: -32,
    }}>
      <select style={selStyle} value={filters.year || 'all'}
        onChange={e => onChange({ ...filters, year: e.target.value, month: 'all' })}>
        <option value="all">Semua Tahun</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>

      <select style={selStyle} value={filters.month || 'all'}
        onChange={e => onChange({ ...filters, month: e.target.value })}>
        <option value="all">Semua Bulan</option>
        {months.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
      </select>

      {spvList.length > 0 && (
        <select style={selStyle} value={filters.spv || 'all'}
          onChange={e => pickSlice('spv', e.target.value)}>
          <option value="all">Semua SPV</option>
          {spvList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      {salespeople.length > 0 && (
        <select style={selStyle} value={filters.salesperson || 'all'}
          onChange={e => pickSlice('salesperson', e.target.value, true)}>
          <option value="all">Semua Salesperson</option>
          {spSel.map(s => <option key={s.name} value={s.name}>{s.name} · {s.team.replace('SPV ', '')}</option>)}
        </select>
      )}

      {kategoriList.length > 0 && (
        <select style={selStyle} value={filters.kategori || 'all'}
          onChange={e => pickSlice('kategori', e.target.value)}>
          <option value="all">Semua Kategori</option>
          {kategoriList.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      )}

      {branchList.length > 0 && (
        <select style={selStyle} value={filters.branch || 'all'}
          onChange={e => pickSlice('branch', e.target.value)}>
          <option value="all">Semua Cabang</option>
          {branchList.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Target manual:</span>
        <input
          type="text"
          placeholder="Rp ________"
          value={target}
          onChange={e => onTargetChange(e.target.value)}
          style={{ ...selStyle, width: 120 }}
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
      text: `🟡 Revenue ${pct}% dari target`,
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

function KPIRow({ kpi, targetInfo, prevYearLabel, loading }) {
  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {[1,2,3,4].map(i => <SkeletonCard key={i} style={{ height: 96 }} />)}
    </div>
  )
  if (!kpi) return null

  const yoyLabel = prevYearLabel ? `vs ${prevYearLabel}` : 'vs thn lalu'
  const cards = [
    {
      title: 'TOTAL REVENUE',
      value: formatRupiahShort(kpi.revenue),
      change: kpi.revenue_change,
      showProgress: targetInfo?.target > 0,
      progressPct: targetInfo?.target > 0 ? Math.min(100, kpi.revenue / targetInfo.target * 100) : 0,
      progressLabel: targetInfo?.label,
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
            borderRadius: 10, padding: 16, minHeight: 96, boxSizing: 'border-box',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            border: c.warn ? '1px solid #fca5a5' : '1px solid #f0f0f0',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4,
          }}>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '0.05em' }}>{c.title}</div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
            {c.change != null ? (
              <span style={{ fontSize: 11, color: changeColor, fontWeight: 600 }}>
                {isPos ? '▲' : '▼'} {Math.abs(c.change)}% YoY {yoyLabel}
              </span>
            ) : <span style={{ fontSize: 11, color: '#bbb' }}>— YoY tidak tersedia</span>}
            {c.showProgress && (
              <div>
                <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2 }}>
                  <div style={{ height: 4, width: `${c.progressPct}%`, background: '#d31137', borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                  {c.progressPct.toFixed(0)}% dari target {c.progressLabel || ''}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Custom tooltip for revenue trend: shows each year + MoM growth for the primary year
function makeTrendTooltip(trendData, primary) {
  return function TrendTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const idx = trendData.findIndex(d => d.month === label)
    return (
      <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fff' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => {
          const isPrimary = String(p.dataKey) === String(primary)
          let mom = null
          if (isPrimary && idx > 0) {
            const prev = trendData[idx - 1]?.[p.dataKey]
            const cur = trendData[idx]?.[p.dataKey]
            if (prev > 0 && cur != null) mom = (cur - prev) / prev * 100
          }
          return (
            <div key={i} style={{ marginBottom: 2 }}>
              <span style={{ color: p.color }}>●</span>{' '}
              {p.dataKey}: {formatRupiah(p.value)}
              {mom != null && (
                <span style={{ color: mom >= 0 ? '#4ade80' : '#fc8799', marginLeft: 6, fontWeight: 600 }}>
                  {mom >= 0 ? '▲' : '▼'} {Math.abs(mom).toFixed(1)}% MoM
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }
}

function DonutCard({ title, data, valueKey, nameKey, loading }) {
  const total = (data || []).reduce((s, d) => s + (d[valueKey] || 0), 0)
  // Top 6 + "Lainnya"
  const sorted = [...(data || [])].sort((a, b) => (b[valueKey] || 0) - (a[valueKey] || 0))
  const top = sorted.slice(0, 6)
  const rest = sorted.slice(6)
  const chartData = [...top]
  if (rest.length) chartData.push({ [nameKey]: 'Lainnya', [valueKey]: rest.reduce((s, d) => s + (d[valueKey] || 0), 0) })

  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {loading ? <Skeleton height={190} /> : !chartData.length || total === 0 ? (
        <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
      ) : (
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={chartData} dataKey={valueKey} nameKey={nameKey}
              cx="42%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={1}>
              {chartData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
            </Pie>
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0]
              const name = p?.payload?.[nameKey] ?? p?.name ?? '-'
              const v = p?.value || 0
              return (
                <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fff', maxWidth: 220 }}>
                  <div style={{ fontWeight: 700, marginBottom: 3 }}>{name}</div>
                  <div>{formatRupiah(v)} · {(v / total * 100).toFixed(1)}%</div>
                </div>
              )
            }} />
            <Legend layout="vertical" align="right" verticalAlign="middle"
              wrapperStyle={{ fontSize: 10.5, lineHeight: '15px' }}
              formatter={(val) => val.length > 14 ? val.slice(0, 13) + '…' : val} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

export default function Overview() {
  const [availFilters, setAvailFilters] = useState({})
  const [filters, setFilters] = useState(null)
  const [target, setTarget] = useState(() => localStorage.getItem('targetRevenue') || '')
  const [kpi, setKpi] = useState(null)
  const [trend, setTrend] = useState(null)
  const [billsAov, setBillsAov] = useState(null)
  const [byKat, setByKat] = useState(null)
  const [byBranch, setByBranch] = useState(null)
  const [tiers, setTiers] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [pairings, setPairings] = useState(null)
  const [salesTargets, setSalesTargets] = useState(null)
  const [attentionCustomers, setAttentionCustomers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const attentionRef = useRef(null)

  const targetNum = parseFloat(target.replace(/[^0-9.]/g, '')) || 0

  useEffect(() => {
    getFilters().then(f => {
      setAvailFilters(f)
      const latestYear = f.years?.[0] ? String(f.years[0]) : 'all'
      setFilters({ year: latestYear, month: 'all', kategori: 'all', branch: 'all', spv: 'all', salesperson: 'all' })
    }).catch(() => setFilters({ year: 'all', month: 'all', kategori: 'all', branch: 'all', spv: 'all', salesperson: 'all' }))
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
      getByBranch(filters),
      getTiers(filters),
      getAlerts(filters),
      getCategoryPairings(filters),
      getSalesTargets(filters),
      getCustomerList({ year: filters.year, sort: 'overdue_ratio', page: 1, limit: 50 }),
    ]).then(([k, t, ba, kat, br, tier, al, pair, st, cList]) => {
      setKpi(k); setTrend(t); setBillsAov(ba); setByKat(kat); setByBranch(br)
      setTiers(tier); setAlerts(al); setPairings(pair); setSalesTargets(st)
      const attn = (cList.data || []).filter(c => c.overdue_ratio != null && c.overdue_ratio >= 1.5).slice(0, 6)
      setAttentionCustomers(attn)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [JSON.stringify(filters)])

  const handleFilters = (f) => setFilters(f)

  const trendYears = (trend?.years || []).map(String)
  const primaryYear = trend?.primary ? String(trend.primary) : (trendYears.slice(-1)[0] || null)
  const TrendTooltip = makeTrendTooltip(trend?.data || [], primaryYear)

  // Dynamic trend title
  const trendTitle = filters?.year && filters.year !== 'all'
    ? (trendYears.length > 1 ? `Revenue Trend — ${filters.year} vs ${trendYears.filter(y => y !== primaryYear).join(', ')}` : `Revenue Trend — ${filters.year}`)
    : `Revenue Trend — ${trendYears.length} Tahun`

  // Target info: prefer active salesperson / SPV target, else manual
  let targetInfo = null
  if (filters?.salesperson && filters.salesperson !== 'all' && salesTargets?.salespeople) {
    const sp = salesTargets.salespeople.find(s => s.name === filters.salesperson)
    if (sp) targetInfo = { target: sp.target, label: `(${sp.name})` }
  } else if (filters?.spv && filters.spv !== 'all' && salesTargets?.teams) {
    const tm = salesTargets.teams.find(t => t.team === filters.spv)
    if (tm) targetInfo = { target: tm.target, label: `(${tm.team})` }
  }
  if (!targetInfo && targetNum > 0) targetInfo = { target: targetNum, label: '(manual)' }

  const prevYearLabel = filters?.year && filters.year !== 'all' ? String(Number(filters.year) - 1) : null

  const aovAvg = billsAov?.length ? billsAov.reduce((s, r) => s + (r.aov || 0), 0) / billsAov.length : 0
  const lastAov = billsAov?.slice(-1)[0]?.aov || 0
  const aovWarn = aovAvg > 0 && lastAov < aovAvg * 0.9

  const tierData = (tiers || []).filter(t => t.count > 0).slice(0, 7).map(t => ({
    tier: t.tier.split(' — ')[0], revenue: t.revenue, count: t.count,
  }))
  const katData = (byKat || []).slice(0, 5)
  const pairData = (pairings || []).slice(0, 7)
  const maxPairCount = pairData.length ? Math.max(...pairData.map(p => p.count)) : 0

  const YEAR_COLORS = { '2025': '#d31137', '2024': '#9aa7ba', '2023': '#c9d1dc' }

  if (!filters) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FilterBar filters={filters} onChange={handleFilters} availFilters={availFilters}
        target={target} onTargetChange={setTarget} />

      {!loading && kpi?.cache_stale && (
        <div style={{ background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8, padding: '8px 16px', fontSize: 12, color: '#92400e' }}>
          ⚠ Data KPI dari cache gabungan (semua tahun) karena cache untuk filter ini belum diperbarui. Jalankan <code>python compute_cache.py</code>.
        </div>
      )}

      {!loading && <AlertBar alerts={alerts} targetNum={targetInfo?.target || 0} kpi={kpi} attentionRef={attentionRef} />}
      {error && (
        <div style={{ background: '#fde3e9', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#d31137' }}>
          ⚠ Gagal memuat data: {error}
        </div>
      )}

      <KPIRow kpi={kpi} targetInfo={targetInfo} prevYearLabel={prevYearLabel} loading={loading} />

      {/* Chart row 60/40 */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{trendTitle}</div>
          {loading ? <Skeleton height={220} /> : !trend?.data?.length ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} width={68} />
                <Tooltip content={<TrendTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {targetInfo?.target > 0 && (
                  <ReferenceLine y={targetInfo.target} stroke="#888" strokeDasharray="4 4"
                    label={{ value: 'Target', fill: '#888', fontSize: 11, position: 'right' }} />
                )}
                {trendYears.map((y) => {
                  const isPrimary = y === primaryYear
                  return (
                    <Line key={y} type="monotone" dataKey={y} name={y}
                      stroke={isPrimary ? (YEAR_COLORS[y] || '#d31137') : (YEAR_COLORS[y] || '#9aa7ba')}
                      strokeWidth={isPrimary ? 2.5 : 1.5}
                      strokeDasharray={isPrimary ? undefined : '5 3'}
                      dot={false} />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

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

      {/* Secondary row — Tier | Top 5 Kategori | Customer Perlu Perhatian */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
                  [`${formatRupiah(v)} (${props.payload.count} cust)`, 'Revenue']} />
                <Bar dataKey="revenue" name="Revenue" radius={[0, 3, 3, 0]}>
                  {tierData.map((_, i) => <Cell key={i} fill={TIER_COLORS[i] || '#ccc'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

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
                <Bar dataKey="revenue" name="Revenue" radius={[0, 3, 3, 0]}>
                  {katData.map((_, i) => (
                    <Cell key={i} fill={['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2'][i] || '#ccc'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card style={{ padding: 16 }}>
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
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <a href="/customers" style={{ color: '#d31137', textDecoration: 'none', fontWeight: 500 }}>Lihat semua →</a>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Third row — Donut Branch | Donut Kategori | Top Category Pairings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <DonutCard title="Kontribusi Revenue per Cabang" data={byBranch} valueKey="revenue" nameKey="branch" loading={loading} />
        <DonutCard title="Kontribusi Revenue per Kategori" data={byKat} valueKey="revenue" nameKey="kategori" loading={loading} />

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Top Category Pairings</div>
          <div style={{ fontSize: 10.5, color: '#aaa', marginBottom: 10 }}>Kategori yang sering dibeli bersamaan dalam 1 nota</div>
          {loading ? <Skeleton height={190} /> : !pairData.length ? (
            <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Tidak ada data</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {pairData.map((p, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 11.5, color: '#333', fontWeight: 500, lineHeight: 1.25 }}>
                      <span style={{ color: DONUT_COLORS[i % DONUT_COLORS.length], fontWeight: 700 }}>{p.kategori_a}</span>
                      <span style={{ color: '#bbb' }}> + </span>
                      <span style={{ color: DONUT_COLORS[i % DONUT_COLORS.length], fontWeight: 700 }}>{p.kategori_b}</span>
                    </span>
                    <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>{p.count.toLocaleString('id')} nota</span>
                  </div>
                  <div style={{ height: 6, background: '#f2f2f2', borderRadius: 3 }}>
                    <div style={{ height: 6, width: `${maxPairCount ? (p.count / maxPairCount * 100) : 0}%`, background: DONUT_COLORS[i % DONUT_COLORS.length], borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sales vs Target — grouped by SPV */}
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          Pencapaian Salesperson vs Target {filters.year !== 'all' ? filters.year : ''}
          <span style={{ fontSize: 11, fontWeight: 400, color: '#888', marginLeft: 6 }}>· Tim Inti Cabang 1.K25</span>
        </div>
        {loading ? <Skeleton height={160} /> : !salesTargets?.salespeople?.length ? (
          <div style={{ fontSize: 13, color: '#888' }}>Data target belum tersedia. Jalankan compute_cache.py.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {(salesTargets.teams || []).map(team => {
              const members = salesTargets.salespeople.filter(s => s.team === team.team)
              return (
                <div key={team.team}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, borderBottom: '2px solid #f0f0f0', paddingBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a' }}>{team.team}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: team.pct >= 100 ? '#22c55e' : team.pct >= 70 ? '#f59e0b' : '#d31137' }}>
                      {team.pct != null ? `${team.pct}%` : '-'}
                    </span>
                  </div>
                  {members.map((m, i) => {
                    const pct = m.pct || 0
                    const barColor = pct >= 100 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#d31137'
                    return (
                      <div key={i} style={{ marginBottom: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                          <span style={{ fontWeight: 500, color: m.revenue === 0 ? '#bbb' : '#333' }}>
                            {m.name}{m.revenue === 0 ? ' ⚠' : ''}
                          </span>
                          <span style={{ color: '#888' }}>{formatRupiahShort(m.revenue)} / {formatRupiahShort(m.target)}</span>
                        </div>
                        <div style={{ height: 5, background: '#f0f0f0', borderRadius: 3 }}>
                          <div style={{ height: 5, width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: 3 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 10.5, color: '#aaa' }}>
          Revenue dihitung dari transaksi cabang 1.K25. ⚠ = belum ada revenue historis (mis. Ribka — staf baru 2026 pengganti Fajar).
        </div>
      </Card>
    </div>
  )
}
