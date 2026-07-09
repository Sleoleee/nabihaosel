import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import Card from '../components/Card'
import Skeleton from '../components/Skeleton'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { getRFM, getTiers, getCustomerList, getRecency, getFilters } from '../utils/api'

const tooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13 },
  labelStyle: { color: '#fff', fontWeight: 600 },
}

function SectionTitle({ children }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{children}</h3>
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px',
        fontSize: 13, background: '#fff', cursor: 'pointer',
      }}>
        <option value="all">Semua</option>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    </div>
  )
}

// RFM Matrix
function RFMMatrix({ data }) {
  if (!data?.matrix?.length) return <EmptyState />
  const maxRev = Math.max(...data.matrix.map(c => c.revenue))

  const getColor = (rev) => {
    if (maxRev === 0) return '#fde3e9'
    const t = rev / maxRev
    const r = Math.round(253 + (211 - 253) * t)
    const g = Math.round(227 + (17 - 227) * t)
    const b = Math.round(233 + (55 - 233) * t)
    return `rgb(${r},${g},${b})`
  }

  const SEGMENTS = [
    { name: 'Champions', color: '#d31137' },
    { name: 'Loyal', color: '#fc3961' },
    { name: 'At Risk', color: '#f59e0b' },
    { name: 'Lost', color: '#888' },
    { name: 'Promising', color: '#22c55e' },
    { name: 'Need Attention', color: '#fc93a6' },
  ]

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--color-text-muted)' }}>M\F</th>
              {[1,2,3,4].map(f => <th key={f} style={{ padding: '8px', textAlign: 'center', color: 'var(--color-text-muted)' }}>F={f}</th>)}
            </tr>
          </thead>
          <tbody>
            {[4,3,2,1].map(m => (
              <tr key={m}>
                <td style={{ padding: '8px', color: 'var(--color-text-muted)', fontWeight: 600 }}>M={m}</td>
                {[1,2,3,4].map(f => {
                  const cell = data.matrix.find(c => c.f_score === f && c.m_score === m)
                  const rev = cell?.revenue || 0
                  const cnt = cell?.count || 0
                  return (
                    <td key={f} style={{
                      padding: '12px', textAlign: 'center',
                      background: getColor(rev), borderRadius: 4, border: '2px solid #fff',
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{cnt}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{formatRupiahShort(rev)}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        {SEGMENTS.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
            <span>{s.name}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>
              ({data.segments?.find(x => x.segment === s.name)?.count || 0})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CustomerIntelligence() {
  const [filters, setFilters] = useState({ year: 'all' })
  const [years, setYears] = useState([])
  const [rfm, setRfm] = useState(null)
  const [tiers, setTiers] = useState(null)
  const [recency, setRecency] = useState(null)
  const [custList, setCustList] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getFilters().then(f => setYears(f.years || [])).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([getRFM(filters), getTiers(filters), getRecency(filters)])
      .then(([r, t, rec]) => { setRfm(r); setTiers(t); setRecency(rec) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [JSON.stringify(filters)])

  const loadList = () => {
    getCustomerList({ ...filters, page, limit: 25, search: search || undefined })
      .then(setCustList).catch(() => {})
  }
  useEffect(() => { loadList() }, [JSON.stringify(filters), page, search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Customer Intelligence</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Analisis segmentasi dan perilaku pelanggan</p>
      </div>

      <Card style={{ display: 'flex', gap: 16, padding: '16px 24px', alignItems: 'flex-end' }}>
        <Select label="Tahun" value={filters.year || 'all'}
          onChange={v => setFilters(f => ({ ...f, year: v }))}
          options={years.map(y => ({ value: String(y), label: String(y) }))} />
      </Card>

      {error && <ErrorState message={error} onRetry={load} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <SectionTitle>RFM Matrix (Frequency × Monetary)</SectionTitle>
          {loading ? <Skeleton height={260} /> : <RFMMatrix data={rfm} />}
        </Card>

        <Card>
          <SectionTitle>Distribusi Customer Recency</SectionTitle>
          {loading ? <Skeleton height={260} /> : !recency?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={recency}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: '#888' }} />
                <YAxis tick={{ fontSize: 12, fill: '#888' }} />
                <Tooltip {...tooltipStyle} formatter={(v) => [formatNumber(v), 'Customer']} />
                <Bar dataKey="count" name="Customer" isAnimationActive={true}>
                  {recency?.map((_, i) => (
                    <Cell key={i} fill={['#d31137','#fc3961','#fc617e','#fc93a6','#feb5c2'][i] || '#ccc'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Tier Distribution */}
      <Card>
        <SectionTitle>Distribusi Customer Tier</SectionTitle>
        {loading ? <Skeleton height={320} /> : !tiers?.length ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={tiers} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis type="category" dataKey="tier" tick={{ fontSize: 11, fill: '#888' }} width={145} />
              <Tooltip {...tooltipStyle}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = tiers.find(t => t.tier === label)
                  return (
                    <div style={{ background: '#1a1a1a', color: '#fff', borderRadius: 8, padding: '10px 14px', fontSize: 13, maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
                      <div>{payload[0].value} customer</div>
                      <div style={{ color: '#fc93a6' }}>{formatRupiah(d?.revenue)}</div>
                      {d?.customers?.length > 0 && (
                        <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, fontSize: 11 }}>
                          {d.customers.map((c, i) => <div key={i}>{c}</div>)}
                          {d.extra > 0 && <div style={{ color: '#fc93a6' }}>+{d.extra} lainnya</div>}
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              <Bar dataKey="count" name="Customer" fill="#d31137" isAnimationActive={true} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

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
                    {['Nama Customer', 'Tier', 'Total Revenue', 'Avg/Bulan', 'Bills', 'Bln Aktif', 'Terakhir Beli', 'Payment'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {custList.data?.map((c, i) => {
                    const isLate = c.payment_status === 'Late'
                    const isLapsed = c.days_since_purchase >= 90
                    return (
                      <tr key={i} style={{
                        background: isLate ? '#fde3e9' : isLapsed ? '#f5f5f5' : 'transparent',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fde3e9'}
                        onMouseLeave={e => e.currentTarget.style.background = isLate ? '#fde3e9' : isLapsed ? '#f5f5f5' : 'transparent'}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 500 }}>{c.name}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>{c.tier}</td>
                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(c.revenue)}</td>
                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(c.avg_monthly)}</td>
                        <td style={{ padding: '8px 10px' }}>{c.bills}</td>
                        <td style={{ padding: '8px 10px' }}>{c.active_months}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{c.last_purchase}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 12,
                            background: isLate ? '#fde3e9' : '#f0fdf4',
                            color: isLate ? '#d31137' : '#22c55e',
                            fontWeight: 600,
                          }}>
                            {c.payment_status}
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
