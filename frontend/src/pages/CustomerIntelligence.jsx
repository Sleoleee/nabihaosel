import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Skeleton from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import { getByKategori, getCustomerList, getFilters, getKPI, getRecency, getRevenueTrend } from '../utils/api'
import {
  DashboardHeader, DashboardPanel, DashboardSelect, DashboardTable, DateRange,
  MetricCard, RecommendationPanel,
} from '../components/ExecutiveDashboard'

const PINKS = ['#b52f49', '#d44864', '#ee6680', '#f58ba0', '#ffb1bf']
const tooltipStyle = { contentStyle: { background: '#333', border: 0, borderRadius: 8, color: '#fff', fontSize: 12 } }

const shortDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

export default function CustomerIntelligence() {
  const [year, setYear] = useState('all')
  const [customer, setCustomer] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [years, setYears] = useState([])
  const [kpi, setKpi] = useState(null)
  const [trend, setTrend] = useState(null)
  const [categories, setCategories] = useState([])
  const [recency, setRecency] = useState([])
  const [customers, setCustomers] = useState([])
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getFilters().then(data => setYears(data.years || [])).catch(() => {})
    getCustomerList({ limit: 250, page: 1 }).then(data => {
      setCustomers(data.data || [])
      setTotalCustomers(data.total || 0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const filters = { year, customer_name: customer }
    setLoading(true)
    setError(null)
    Promise.all([
      getKPI(filters), getRevenueTrend(filters), getByKategori(filters), getRecency({ year }),
      getCustomerList({ year, limit: 250, page: 1 }),
    ]).then(([kpiData, trendData, categoryData, recencyData, customerData]) => {
      setKpi(kpiData)
      setTrend(trendData)
      setCategories(categoryData || [])
      setRecency(recencyData || [])
      setCustomers(customerData.data || [])
      setTotalCustomers(customerData.total || 0)
    }).catch(cause => setError(cause.message)).finally(() => setLoading(false))
  }, [year, customer])

  const selectedCustomer = customers.find(item => item.name === customer)
  const customerOptions = useMemo(() => [...new Set(customers.map(item => item.name))].map(name => ({ value: name, label: name })), [customers])
  const trendYears = trend?.years?.length ? trend.years : [new Date().getFullYear()]
  const latestYear = String(year !== 'all' ? year : Math.max(...trendYears))

  const trendData = useMemo(() => (trend?.data || []).map((item, index) => {
    const monthDate = new Date(Number(latestYear), index, 1)
    const afterStart = !startDate || monthDate >= new Date(`${startDate}T00:00:00`)
    const beforeEnd = !endDate || monthDate <= new Date(`${endDate}T23:59:59`)
    return { month: item.month, purchase: afterStart && beforeEnd ? Number(item[latestYear] || 0) : null }
  }), [trend, latestYear, startDate, endDate])

  const customerDays = selectedCustomer?.days_since_purchase ?? Math.round(average(customers.map(item => item.days_since_purchase).filter(Number.isFinite)))
  const lastPurchase = selectedCustomer?.last_purchase || customers.reduce((latest, item) => item.last_purchase > latest ? item.last_purchase : latest, '')
  const retentionDays = Math.round(average(customers.map(item => item.active_months * 30).filter(Number.isFinite)))
  const recencyMidpoints = { '0–30': 15, '31–60': 45, '61–90': 75, '91–180': 135, '180+': 210 }
  const recencyCount = recency.reduce((sum, item) => sum + item.count, 0)
  const avgRecency = recencyCount ? Math.round(recency.reduce((sum, item) => sum + (recencyMidpoints[item.bucket] || 0) * item.count, 0) / recencyCount) : 0
  const atRisk = [...customers].filter(item => item.days_since_purchase >= 60).sort((a, b) => b.days_since_purchase - a.days_since_purchase).slice(0, 5)
  const topCategory = categories[0]
  const lastTwo = trendData.filter(item => item.purchase !== null).slice(-2)
  const isSlowing = lastTwo.length === 2 && lastTwo[1].purchase < lastTwo[0].purchase

  const recommendation = customer !== 'all' && selectedCustomer
    ? selectedCustomer.days_since_purchase >= 90
      ? { title: 'Activate win-back program', summary: `${selectedCustomer.name} belum bertransaksi selama ${selectedCustomer.days_since_purchase} hari. Prioritaskan kontak personal sebelum peluang pembelian turun lebih jauh.` }
      : { title: 'Grow this customer', summary: `${selectedCustomer.name} masih aktif. Gunakan pola kategori teratas untuk menaikkan nilai pesanan berikutnya.` }
    : isSlowing
      ? { title: 'Recover declining momentum', summary: 'Revenue pada periode terakhir melemah. Fokuskan tim pada customer bernilai tinggi yang mulai tidak aktif.' }
      : { title: 'Boost retention program', summary: `${atRisk.length} customer prioritas pada sampel aktif membutuhkan tindak lanjut berbasis recency.` }

  const actions = [
    { title: 'Hubungi customer at-risk', detail: `Mulai dari ${atRisk[0]?.name || 'customer dengan recency tertinggi'} dan selesaikan follow-up dalam 48 jam.` },
    { title: `Dorong kategori ${topCategory?.kategori || 'teratas'}`, detail: 'Siapkan bundling atau cross-sell yang relevan, bukan diskon merata.' },
    { title: 'Review hasil mingguan', detail: 'Pantau reactivation rate, nilai order berikutnya, dan jumlah customer yang kembali aktif.' },
  ]

  const attentionColumns = [
    { key: 'rank', label: '#', render: (_, index) => index + 1 },
    { key: 'name', label: 'Customer Name' },
    { key: 'tier', label: 'Customer Tier' },
    { key: 'revenue', label: 'Purchase', render: row => formatRupiah(row.revenue) },
    { key: 'days', label: 'Last Activity', render: row => <span className="attention-pill">{row.days_since_purchase} days</span> },
  ]

  return (
    <div className="executive-page">
      <DashboardHeader title="Customer Dashboard" subtitle="Purchase & Retention Monitoring">
        <DateRange startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        <DashboardSelect label="Tahun Data" value={year} onChange={setYear} options={years.map(value => String(value))} allLabel="Semua Tahun" />
        <DashboardSelect label="Customer Name" value={customer} onChange={setCustomer} options={customerOptions} allLabel="All Customers" />
      </DashboardHeader>
      {error && <ErrorState message={error} />}

      <div className="executive-metrics">
        <MetricCard label="Total Purchase" value={loading ? '...' : formatRupiahShort(kpi?.revenue)} helper={customer === 'all' ? `${totalCustomers.toLocaleString('id-ID')} customer` : selectedCustomer?.tier} />
        <MetricCard label="Average Order Value" value={loading ? '...' : formatRupiahShort(kpi?.aov)} />
        <MetricCard label="Last Purchase Date" value={loading ? '...' : shortDate(lastPurchase)} />
        <MetricCard label="Days Since Last Purchase" value={loading ? '...' : `${customerDays || 0} days`} accent={customerDays >= 60} />
        <MetricCard label="Avg. Customer Retention" value={loading ? '...' : `${retentionDays || 0} days`} />
        <MetricCard label="Avg. Recency Category" value={loading ? '...' : `${avgRecency || 0} days`} />
      </div>

      <div className="executive-grid">
        <DashboardPanel title="Revenue Trend" eyebrow={`${latestYear} purchase movement`}>
          {loading ? <Skeleton height={270} /> : <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={trendData} margin={{ top: 15, right: 8, left: 0, bottom: 0 }}>
              <defs><linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ff8299" stopOpacity={.35}/><stop offset="95%" stopColor="#ff8299" stopOpacity={.05}/></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#777' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 10, fill: '#777' }} axisLine={false} tickLine={false} width={62} />
              <Tooltip {...tooltipStyle} formatter={value => formatRupiah(value)} />
              <Area type="monotone" dataKey="purchase" stroke="#ff6c88" strokeWidth={2} fill="url(#purchaseFill)" connectNulls />
            </AreaChart>
          </ResponsiveContainer>}
        </DashboardPanel>

        <div className="executive-stack">
          <DashboardPanel title="Top 5 Product Categories" eyebrow="Purchase contribution">
            {loading ? <Skeleton height={155} /> : <ResponsiveContainer width="100%" height={155}>
              <BarChart data={categories.slice(0, 5)} layout="vertical" margin={{ left: 8, right: 25 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="kategori" tick={{ fontSize: 9, fill: '#444' }} axisLine={false} tickLine={false} width={115} />
                <Tooltip {...tooltipStyle} formatter={value => formatRupiah(value)} />
                <Bar dataKey="revenue" radius={[0, 2, 2, 0]}>{categories.slice(0, 5).map((_, index) => <Cell key={index} fill={PINKS[index]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>}
          </DashboardPanel>
          <RecommendationPanel title={recommendation.title} summary={recommendation.summary} actions={actions} />
        </div>
      </div>

      <DashboardPanel title="Customer Needs More Attention" eyebrow="Action queue">
        <DashboardTable columns={attentionColumns} rows={atRisk} />
      </DashboardPanel>
    </div>
  )
}
