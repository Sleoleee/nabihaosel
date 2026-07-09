import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell
} from 'recharts'
import Card from '../components/Card'
import KPICard from '../components/KPICard'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import {
  getDiscountOverview, getDiscountDist, getDiscountMonthly,
  getDiscountByCustomer, getPriceIntegrity, getFilters
} from '../utils/api'

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13 },
  labelStyle: { color: '#fff', fontWeight: 600 },
}

function SectionTitle({ children }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{children}</h3>
}

export default function Discounts() {
  const [filters, setFilters] = useState({ year: 'all', kategori: 'all' })
  const [years, setYears] = useState([])
  const [katList, setKatList] = useState([])
  const [overview, setOverview] = useState(null)
  const [dist, setDist] = useState(null)
  const [monthly, setMonthly] = useState(null)
  const [byCustomer, setByCustomer] = useState(null)
  const [priceInt, setPriceInt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getFilters().then(f => { setYears(f.years || []); setKatList(f.kategori || []) }).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([
      getDiscountOverview(filters), getDiscountDist(filters), getDiscountMonthly(filters),
      getDiscountByCustomer(filters), getPriceIntegrity(filters),
    ]).then(([o, d, m, bc, pi]) => {
      setOverview(o); setDist(d); setMonthly(m); setByCustomer(bc); setPriceInt(pi)
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Discount & Pricing</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Analisis kebocoran revenue dan efektivitas diskon</p>
      </div>

      <Card style={{ display: 'flex', gap: 16, padding: '16px 24px', alignItems: 'flex-end' }}>
        {[
          { label: 'Tahun', key: 'year', opts: years.map(y => ({ value: String(y), label: String(y) })) },
          { label: 'Kategori', key: 'kategori', opts: katList.map(k => ({ value: k, label: k })) },
        ].map(({ label, key, opts }) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
            <select value={filters[key] || 'all'} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff', cursor: 'pointer', minWidth: 120 }}>
              <option value="all">Semua</option>
              {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </Card>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {loading ? [1,2,3,4].map(i => <SkeletonCard key={i} />) : overview ? <>
          <KPICard title="Revenue Hilang (Diskon)" value={overview.revenue_lost} format="rupiah" />
          <KPICard title="Bills dengan Diskon" value={overview.bills_with_disc} format="number" />
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>% Bills dengan Diskon</div>
            <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 600 }}>{overview.pct_bills_with_disc?.toFixed(1)}%</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rata-rata Disc for Document</div>
            <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 600 }}>{overview.avg_disc_for_document?.toFixed(1)}%</div>
          </div>
        </> : null}
      </div>

      {/* Distribution & Monthly */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <SectionTitle>Distribusi Disc for Document</SectionTitle>
          {loading ? <Skeleton height={220} /> : !dist?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: '#888' }} />
                <YAxis tick={{ fontSize: 12, fill: '#888' }} />
                <Tooltip {...tooltipStyle} content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = dist.find(x => x.bucket === label)
                  return (
                    <div style={{ background: '#1a1a1a', color: '#fff', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                      <div>{payload[0]?.value} bills</div>
                      <div style={{ color: '#fc93a6' }}>Hilang: {formatRupiah(d?.revenue_lost)}</div>
                    </div>
                  )
                }} />
                <Bar dataKey="bills" name="Bills" fill="#d31137" isAnimationActive={true} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionTitle>Revenue Retained vs Hilang per Bulan</SectionTitle>
          {loading ? <Skeleton height={220} /> : !monthly?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#888' }} />
                <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 12, fill: '#888' }} width={64} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatRupiah(v)} />
                <Legend />
                <Bar dataKey="retained" name="Revenue Diterima" stackId="a" fill="#d31137" isAnimationActive={true} />
                <Bar dataKey="lost" name="Revenue Hilang" stackId="a" fill="#fc93a6" isAnimationActive={true} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Price Integrity */}
      <Card>
        <SectionTitle>Harga Awal vs Harga Jual per Kategori</SectionTitle>
        {loading ? <Skeleton height={220} /> : !priceInt?.length ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={Math.max(180, priceInt.length * 32)}>
            <BarChart data={priceInt} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={formatRupiahShort} tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis type="category" dataKey="kategori" tick={{ fontSize: 11, fill: '#888' }} width={120} />
              <Tooltip {...tooltipStyle} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const d = priceInt.find(x => x.kategori === label)
                return (
                  <div style={{ background: '#1a1a1a', color: '#fff', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
                    <div>Harga Awal: {formatRupiah(d?.avg_harga_awal)}</div>
                    <div>Harga Jual: {formatRupiah(d?.avg_harga_jual)}</div>
                    <div style={{ color: '#fc93a6' }}>Gap: {d?.gap_pct?.toFixed(1)}%</div>
                  </div>
                )
              }} />
              <Legend />
              <Bar dataKey="avg_harga_awal" name="Harga Awal" fill="#fc93a6" isAnimationActive={true} />
              <Bar dataKey="avg_harga_jual" name="Harga Jual" fill="#d31137" isAnimationActive={true} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* By Customer */}
      <Card>
        <SectionTitle>Customer yang Sering Mendapat Diskon</SectionTitle>
        {loading ? <Skeleton height={200} /> : !byCustomer?.length ? <EmptyState /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  {['Nama Customer', 'Total Bills', 'Bills + Diskon', '% dengan Diskon', 'Avg Disc %', 'Total Nilai Diskon'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byCustomer.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fde3e9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '8px 10px' }}>{c.total_bills}</td>
                    <td style={{ padding: '8px 10px' }}>{c.bills_with_disc}</td>
                    <td style={{ padding: '8px 10px' }}>{c.pct_with_disc?.toFixed(1)}%</td>
                    <td style={{ padding: '8px 10px' }}>{c.avg_disc?.toFixed(1)}%</td>
                    <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: '#d31137', fontWeight: 500 }}>{formatRupiah(c.total_discount_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
