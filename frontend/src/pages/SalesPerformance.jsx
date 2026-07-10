import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import Skeleton from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import {
  getByKategori, getCustomerList, getFilters, getLeaderboard, getRevenueTrend,
  getSalesDrilldown, getTiers,
} from '../utils/api'
import {
  DashboardHeader, DashboardPanel, DashboardSelect, DashboardTable, DateRange,
  MetricCard, RecommendationPanel,
} from '../components/ExecutiveDashboard'

const PINKS = ['#a92d47', '#d04360', '#f15472', '#f47f96', '#ffadbc']
const tooltipStyle = { contentStyle: { background: '#333', border: 0, borderRadius: 8, color: '#fff', fontSize: 12 } }
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

export default function SalesPerformance() {
  const [year, setYear] = useState('all')
  const [branch, setBranch] = useState('all')
  const [salesPerson, setSalesPerson] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [years, setYears] = useState([])
  const [branches, setBranches] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [categories, setCategories] = useState([])
  const [tiers, setTiers] = useState([])
  const [trend, setTrend] = useState(null)
  const [drilldown, setDrilldown] = useState(null)
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getFilters().then(data => { setYears(data.years || []); setBranches(data.branches || []) }).catch(() => {})
  }, [])

  useEffect(() => {
    const filters = { year, branch }
    setLoading(true)
    setError(null)
    Promise.all([
      getLeaderboard(filters), getByKategori(filters), getTiers({ year }),
      getRevenueTrend(filters), getCustomerList({ year, limit: 250, page: 1 }),
    ]).then(([salesData, categoryData, tierData, trendData, customerData]) => {
      setLeaderboard(salesData || [])
      setCategories(categoryData || [])
      setTiers(tierData || [])
      setTrend(trendData)
      setCustomers(customerData.data || [])
    }).catch(cause => setError(cause.message)).finally(() => setLoading(false))
  }, [year, branch])

  useEffect(() => {
    if (salesPerson === 'all') { setDrilldown(null); return }
    setLoading(true)
    getSalesDrilldown(salesPerson, { year }).then(setDrilldown).catch(cause => setError(cause.message)).finally(() => setLoading(false))
  }, [salesPerson, year])

  const activeSales = salesPerson === 'all' ? null : leaderboard.find(item => item.name === salesPerson)
  const teamRevenue = leaderboard.reduce((sum, item) => sum + item.revenue, 0)
  const teamBills = leaderboard.reduce((sum, item) => sum + item.bills, 0)
  const currentRevenue = activeSales?.revenue ?? teamRevenue
  const currentBills = activeSales?.bills ?? teamBills
  const aov = currentBills ? currentRevenue / currentBills : 0
  const target = Number(import.meta.env.VITE_SALES_TARGET || 0)
  const progress = target ? Math.min(100, currentRevenue / target * 100) : 0
  const tierCoverage = tiers.filter(item => item.count > 0).length
  const retentionDuration = Math.round(average(customers.map(item => item.active_months * 30).filter(Number.isFinite)))
  const trendYears = trend?.years?.length ? trend.years : [new Date().getFullYear()]
  const latestYear = String(year !== 'all' ? year : Math.max(...trendYears))

  const monthlyTrend = useMemo(() => {
    const source = drilldown?.trend || (trend?.data || []).map(item => ({ month: item.month, revenue: item[latestYear] || 0 }))
    return source.map((item, index) => {
      const date = new Date(Number(latestYear), index, 1)
      const visible = (!startDate || date >= new Date(`${startDate}T00:00:00`)) && (!endDate || date <= new Date(`${endDate}T23:59:59`))
      return { ...item, revenue: visible ? Number(item.revenue || 0) : null }
    })
  }, [drilldown, trend, latestYear, startDate, endDate])

  const pieData = tiers.filter(item => item.revenue > 0).slice(0, 5).map(item => ({ name: item.tier.split(' — ')[0], value: item.revenue }))
  const topCustomers = drilldown?.customers?.slice(0, 5).map(item => ({ ...item, tier: '-' })) || customers.slice(0, 5)
  const attentionCustomers = [...customers].sort((a, b) => b.days_since_purchase - a.days_since_purchase).slice(0, 5)
  const avgSalesRevenue = leaderboard.length ? teamRevenue / leaderboard.length : 0
  const underTarget = activeSales && activeSales.revenue < avgSalesRevenue
  const staleCount = customers.filter(item => item.days_since_purchase >= 90).length
  const topCategoryShare = categories.length && categories.reduce((sum, item) => sum + item.revenue, 0)
    ? categories[0].revenue / categories.reduce((sum, item) => sum + item.revenue, 0) * 100 : 0

  const recommendation = target === 0
    ? { title: 'Set a measurable sales target', summary: 'Target revenue belum diset. Tambahkan target periodik agar progress dan tindakan korektif dapat dihitung secara objektif.' }
    : underTarget
      ? { title: `Coach ${salesPerson}`, summary: `Revenue ${salesPerson} berada di bawah rata-rata tim. Fokuskan coaching pada coverage customer dan kategori.` }
      : staleCount > 0
        ? { title: 'Launch customer recovery sprint', summary: `${staleCount} customer pada daftar aktif sudah tidak bertransaksi selama 90 hari atau lebih.` }
        : { title: 'Scale the winning playbook', summary: 'Performa tim stabil. Replikasi kombinasi customer dan kategori dari salesperson teratas.' }

  const actions = [
    { title: target ? 'Close the target gap' : 'Define target revenue', detail: target ? `Masih ada gap ${formatRupiah(Math.max(0, target - currentRevenue))}. Pecah menjadi target mingguan per salesperson.` : 'Isi VITE_SALES_TARGET dengan target periode yang disepakati.' },
    { title: `Prioritize ${attentionCustomers[0]?.name || 'inactive customers'}`, detail: 'Jadikan customer dengan recency tertinggi sebagai call list pertama tim.' },
    { title: topCategoryShare > 50 ? 'Reduce category concentration' : `Expand ${categories[0]?.kategori || 'top category'}`, detail: topCategoryShare > 50 ? 'Tambahkan cross-sell kategori kedua agar revenue tidak bergantung pada satu kategori.' : 'Gunakan produk pemenang sebagai pintu masuk untuk bundling kategori lain.' },
  ]

  const topColumns = [
    { key: 'rank', label: '#', render: (_, index) => index + 1 },
    { key: 'name', label: 'Customer Name' },
    { key: 'tier', label: 'Customer Tier' },
    { key: 'revenue', label: 'Amount', render: row => formatRupiah(row.revenue) },
  ]
  const attentionColumns = [
    { key: 'rank', label: '#', render: (_, index) => index + 1 },
    { key: 'name', label: 'Customer Name' },
    { key: 'last_purchase', label: 'Last Purchase' },
    { key: 'progress', label: '% Progress', render: row => <span className="attention-pill">{Math.max(0, 100 - Math.round(row.days_since_purchase / 1.8))}%</span> },
  ]

  return (
    <div className="executive-page">
      <DashboardHeader title="Team Sales Dashboard" subtitle="Sales KPI Monitoring">
        <DateRange startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        <DashboardSelect label="Tahun" value={year} onChange={setYear} options={years.map(value => String(value))} allLabel="Semua Tahun" />
        <DashboardSelect label="Branch" value={branch} onChange={setBranch} options={branches} allLabel="Semua Branch" />
        <DashboardSelect label="SPV / Sales Person" value={salesPerson} onChange={setSalesPerson} options={leaderboard.map(item => item.name)} allLabel="All Sales" />
      </DashboardHeader>

      {error && <ErrorState message={error} />}

      <div className="executive-progress">
        <div className="executive-progress__revenue">
          <div className="target-progress"><div style={{ width: `${progress}%` }} /><span>{target ? `${progress.toFixed(0)}%` : 'Target belum diset'}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <MetricCard label="Total Revenue" value={loading ? '...' : formatRupiahShort(currentRevenue)} />
            <MetricCard label="Target Revenue" value={target ? formatRupiahShort(target) : 'Belum diatur'} accent={!target} />
          </div>
        </div>
        <MetricCard label="Average Order Value" value={loading ? '...' : formatRupiahShort(aov)} />
        <MetricCard label="Retention Duration" value={loading ? '...' : `${retentionDuration || 0} days`} />
        <MetricCard label="Customer Tier Coverage" value={loading ? '...' : `${tierCoverage} tier`} />
        <MetricCard label="Product Category Coverage" value={loading ? '...' : `${categories.length} category`} />
      </div>

      <div className="executive-grid executive-grid--sales">
        <DashboardPanel title="Revenue All Customers" eyebrow={salesPerson === 'all' ? 'Team movement' : salesPerson}>
          {loading ? <Skeleton height={240} /> : <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#777' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 9, fill: '#777' }} axisLine={false} tickLine={false} width={55} />
              <Tooltip {...tooltipStyle} formatter={value => formatRupiah(value)} />
              <Line type="monotone" dataKey="revenue" stroke="#e6506e" strokeWidth={2.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>}
        </DashboardPanel>

        <DashboardPanel title="Revenue per Customer Tier" eyebrow="Portfolio mix">
          {loading ? <Skeleton height={240} /> : <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="46%" outerRadius={75}>{pieData.map((_, index) => <Cell key={index} fill={PINKS[index % PINKS.length]} />)}</Pie><Tooltip {...tooltipStyle} formatter={value => formatRupiah(value)} /><Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} /></PieChart>
          </ResponsiveContainer>}
        </DashboardPanel>

        <DashboardPanel title="Top 5 Product Categories" eyebrow="Revenue contribution">
          {loading ? <Skeleton height={240} /> : <ResponsiveContainer width="100%" height={240}>
            <BarChart data={categories.slice(0, 5)} layout="vertical" margin={{ left: 8, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="kategori" tick={{ fontSize: 9, fill: '#444' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip {...tooltipStyle} formatter={value => formatRupiah(value)} />
              <Bar dataKey="revenue" radius={[0, 2, 2, 0]}>{categories.slice(0, 5).map((_, index) => <Cell key={index} fill={PINKS[index]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>}
        </DashboardPanel>
      </div>

      <RecommendationPanel title={recommendation.title} summary={recommendation.summary} actions={actions} />

      <div className="executive-grid executive-grid--tables">
        <DashboardPanel title="Top Customers" eyebrow="Highest contribution"><DashboardTable columns={topColumns} rows={topCustomers} /></DashboardPanel>
        <DashboardPanel title="Customer Needs More Attention" eyebrow="Next sales call queue"><DashboardTable columns={attentionColumns} rows={attentionCustomers} /></DashboardPanel>
      </div>
    </div>
  )
}
