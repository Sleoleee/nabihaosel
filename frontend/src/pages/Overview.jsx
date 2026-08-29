import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, ComposedChart, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { useGlobalFilters } from '../context/GlobalFilters'
import { getAnalyticsOverview, getSalesTargets, getCustomerSummary } from '../utils/api'

const DONUT_COLORS = ['#d31137','#5b6b82','#a8b3c4','#8b1a2b','#fc617e','#c9d1dc','#f096a6','#3d4a5c','#fbbfc9','#7a8699','#e0243f']
const YEAR_COLORS = { '2026':'#d31137','2025':'#d31137','2024':'#9aa7ba','2023':'#c9d1dc' }
const tt = { contentStyle:{background:'#1a1a1a',border:'none',borderRadius:8,color:'#fff',fontSize:12}, itemStyle:{color:'#fff'}, cursor:{fill:'rgba(255,255,255,0.06)'} }

// ---------- AI Insights (mockup statis) ----------
function AIInsights() {
  const cards = [
    { tag:'RISIKO', color:'#d31137', bg:'#fef2f4',
      headline:<>Ada <b style={{color:'#d31137'}}>338 pelanggan</b> yang mulai berhenti belanja, dan sekitar <b style={{color:'#d31137'}}>Rp 7,5 M</b> omzet ikut terancam.</>,
      sub:'Mereka sudah melewati dua kali jeda belanja normalnya. Baiknya dihubungi minggu ini sebelum benar-benar pergi.' },
    { tag:'PELUANG', color:'#15803d', bg:'#f0fdf4',
      headline:<>Pembeli <b style={{color:'#15803d'}}>Aksesoris</b> hampir selalu juga mengambil <b style={{color:'#15803d'}}>Aksesoris Rambut</b>.</>,
      sub:'Keduanya muncul bersama di lebih dari 32.000 nota. Kalau dijadikan satu paket, potensi tambahannya sekitar Rp 1,1 M per bulan.' },
    { tag:'TARGET', color:'#1d4ed8', bg:'#eff6ff',
      headline:<>SPV REGEN sudah melewati target di <b style={{color:'#15803d'}}>112%</b>, tetapi SPV Abdul Wahid baru <b style={{color:'#d31137'}}>78%</b>.</>,
      sub:'Masih ada sekitar Rp 900 juta yang perlu dikejar tim Abdul Wahid sampai akhir tahun.' },
  ]
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ fontSize:14, fontWeight:700, background:'linear-gradient(90deg,#d31137,#7c3aed)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>AI Insights</span>
        <span style={{ fontSize:10.5, color:'#888', background:'#f4f4f5', borderRadius:12, padding:'2px 8px' }}>Diperbarui otomatis</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {cards.map((c,i)=>(
          <div key={i} style={{ background:c.bg, borderLeft:`3px solid ${c.color}`, borderRadius:8, padding:'10px 12px', display:'flex', flexDirection:'column', gap:5 }}>
            <span style={{ fontSize:10, fontWeight:700, color:c.color, letterSpacing:'0.04em' }}>{c.tag}</span>
            <div style={{ fontSize:12.5, color:'#222', lineHeight:1.35 }}>{c.headline}</div>
            <div style={{ fontSize:11, color:'#666', lineHeight:1.35 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:12, borderRadius:8, padding:'11px 14px', background:'linear-gradient(90deg,#fff8f0,#faf5ff)', borderLeft:'3px solid #7c3aed' }}>
        <div style={{ fontSize:12.5, color:'#333', lineHeight:1.5 }}>
          <b>Next Action:</b> Buat promo paket <b>Aksesoris + Aksesoris Rambut</b>, lalu tawarkan khusus kepada 338 pelanggan yang mulai berhenti belanja. Serahkan pelaksanaannya kepada tim <b>SPV Abdul Wahid</b> yang masih tertinggal target.
        </div>
      </div>
      <div style={{ marginTop:8, fontSize:10, color:'#bbb' }}>Angka masih ilustratif — akan dihubungkan ke data live pada tahap berikutnya.</div>
    </Card>
  )
}

function makeTrendTooltip(data, primary) {
  return function TT({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const idx = data.findIndex(d => d.month === label)
    return (
      <div style={{ background:'#1a1a1a', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#fff' }}>
        <div style={{ fontWeight:600, marginBottom:4 }}>{label}</div>
        {payload.map((p,i)=>{
          const isP = String(p.dataKey)===String(primary); let mom=null
          if (isP && idx>0){ const prev=data[idx-1]?.[p.dataKey]; const cur=data[idx]?.[p.dataKey]; if(prev>0&&cur!=null) mom=(cur-prev)/prev*100 }
          return <div key={i} style={{ marginBottom:2 }}><span style={{color:p.color}}>●</span> {p.dataKey}: {formatRupiah(p.value)}
            {mom!=null && <span style={{ color:mom>=0?'#4ade80':'#fc8799', marginLeft:6, fontWeight:600 }}>{mom>=0?'▲':'▼'} {Math.abs(mom).toFixed(1)}% MoM</span>}</div>
        })}
      </div>
    )
  }
}

function DonutCard({ title, data, valueKey, nameKey, loading }) {
  const total = (data||[]).reduce((s,d)=>s+(d[valueKey]||0),0)
  const sorted = [...(data||[])].sort((a,b)=>(b[valueKey]||0)-(a[valueKey]||0))
  const top = sorted.slice(0,6); const rest = sorted.slice(6)
  const cd = [...top]; if (rest.length) cd.push({ [nameKey]:'Lainnya', [valueKey]:rest.reduce((s,d)=>s+(d[valueKey]||0),0) })
  return (
    <Card style={{ padding:16 }}>
      <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>{title}</div>
      {loading ? <Skeleton height={190}/> : (!cd.length||total===0) ? (
        <div style={{ height:190, display:'flex', alignItems:'center', justifyContent:'center', color:'#888', fontSize:13 }}>Tidak ada data untuk filter ini</div>
      ) : (
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={cd} dataKey={valueKey} nameKey={nameKey} cx="42%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={1}>
              {cd.map((_,i)=><Cell key={i} fill={DONUT_COLORS[i%DONUT_COLORS.length]}/>)}
            </Pie>
            <Tooltip content={({active,payload})=>{ if(!active||!payload?.length) return null; const p=payload[0]; const nm=p?.payload?.[nameKey]??'-'; const v=p?.value||0
              return <div style={{ background:'#1a1a1a', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#fff', maxWidth:220 }}><div style={{fontWeight:700, marginBottom:3}}>{nm}</div><div>{formatRupiah(v)} · {(v/total*100).toFixed(1)}%</div></div> }}/>
            <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize:10.5, lineHeight:'15px' }} formatter={(val)=>val.length>14?val.slice(0,13)+'…':val}/>
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

function Pilar({ tag, color, headline, sub, to }) {
  return (
    <Link to={to} style={{ textDecoration:'none' }}>
      <div style={{ background:'#fff', borderRadius:10, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #f0f0f0', borderTop:`3px solid ${color}`, minHeight:96 }}>
        <div style={{ fontSize:10.5, fontWeight:700, color, letterSpacing:'0.05em' }}>{tag}</div>
        <div style={{ fontSize:16, fontWeight:700, color:'#1a1a1a', margin:'6px 0 4px', lineHeight:1.2 }}>{headline}</div>
        <div style={{ fontSize:11.5, color:'#666' }}>{sub} <span style={{ color, fontWeight:600 }}>→</span></div>
      </div>
    </Link>
  )
}

export default function Overview() {
  const g = useGlobalFilters()
  const [data, setData] = useState(null)
  const [targets, setTargets] = useState(null)
  const [custSum, setCustSum] = useState(null)
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState(() => localStorage.getItem('targetRevenue') || '')
  const targetNum = parseFloat(target.replace(/[^0-9.]/g,'')) || 0
  useEffect(() => { localStorage.setItem('targetRevenue', target) }, [target])

  const firstYear = g?.years?.[0] || 'all'

  useEffect(() => {
    if (!g?.ready) return
    setLoading(true)
    Promise.all([
      getAnalyticsOverview(g.apiParams),
      getSalesTargets({ year: firstYear }).catch(()=>null),
      getCustomerSummary({ year: firstYear }).catch(()=>null),
    ]).then(([o,t,c])=>{ setData(o); setTargets(t); setCustSum(c) })
      .catch(()=>{}).finally(()=>setLoading(false))
  }, [g?.ready, JSON.stringify(g?.apiParams)])  // eslint-disable-line

  if (!g) return null
  const kpi = data?.kpi
  const trend = data?.trend
  const trendYears = (trend?.years||[]).map(String)
  const primary = trend?.primary ? String(trend.primary) : trendYears.slice(-1)[0]
  const TT = makeTrendTooltip(trend?.data||[], primary)

  // Pilar Sales
  const sps = targets?.salespeople || []
  const below = sps.filter(s => (s.pct||0) < 100).length
  const sortedSp = [...sps].filter(s=>s.target).sort((a,b)=>(b.pct||0)-(a.pct||0))
  const top3 = sortedSp.slice(0,3), bot3 = sortedSp.slice(-3).reverse()

  const topKat = (data?.by_kategori||[])[0]
  const katTotal = (data?.by_kategori||[]).reduce((s,d)=>s+d.revenue,0)

  const kpiCards = kpi ? [
    { title:'TOTAL REVENUE', value:formatRupiahShort(kpi.revenue), change:kpi.revenue_change,
      progress: targetNum>0 ? Math.min(100, kpi.revenue/targetNum*100) : null },
    { title:'JUMLAH BILLS', value:formatNumber(kpi.bills), change:kpi.bills_change },
    { title:'AOV', value:formatRupiahShort(kpi.aov), change:kpi.aov_change },
    { title:'CUSTOMER AKTIF', value:formatNumber(kpi.customers), change:kpi.customers_change },
  ] : []

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* filter lokal Overview: target manual */}
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:12, color:'#666' }}>Target revenue:</span>
        <input value={target} onChange={e=>setTarget(e.target.value)} placeholder="Rp ________"
          style={{ border:'1px solid #ddd', borderRadius:6, padding:'5px 8px', fontSize:12.5, width:130 }}/>
      </div>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {loading || !kpi ? [1,2,3,4].map(i=><SkeletonCard key={i} style={{height:96}}/>) : kpiCards.map((c,i)=>{
          const pos = c.change>0
          return (
            <div key={i} style={{ background:'#fff', borderRadius:10, padding:16, minHeight:96, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #f0f0f0', display:'flex', flexDirection:'column', justifyContent:'space-between', gap:4 }}>
              <div style={{ fontSize:11, color:'#888', fontWeight:600, letterSpacing:'0.05em' }}>{c.title}</div>
              <div style={{ fontSize:22, fontWeight:700, lineHeight:1 }}>{c.value}</div>
              {c.change!=null ? <span style={{ fontSize:11, color:pos?'#22c55e':'#d31137', fontWeight:600 }}>{pos?'▲':'▼'} {Math.abs(c.change)}% YoY</span>
                : <span style={{ fontSize:11, color:'#bbb' }}>{g.compare?'—':'aktifkan "bandingkan"'}</span>}
              {c.progress!=null && <div><div style={{ height:4, background:'#f0f0f0', borderRadius:2 }}><div style={{ height:4, width:`${c.progress}%`, background:'#d31137', borderRadius:2 }}/></div><div style={{ fontSize:10, color:'#888', marginTop:2 }}>{c.progress.toFixed(0)}% dari target</div></div>}
            </div>
          )
        })}
      </div>

      {!loading && <AIInsights/>}

      {/* 4 Pilar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <Pilar tag="SALES" color="#1d4ed8" to="/sales"
          headline={targets ? `${below} dari ${sps.length} di bawah target` : '—'}
          sub="Lihat performa tim penjualan" />
        <Pilar tag="CUSTOMER" color="#d31137" to="/customers"
          headline={custSum ? `${formatRupiahShort(custSum.revenue_at_risk)} revenue at risk` : '—'}
          sub={custSum ? `${custSum.overdue_rate}% pelanggan overdue` : 'Kesehatan pelanggan'} />
        <Pilar tag="PRODUCT" color="#15803d" to="/products"
          headline={topKat ? `${topKat.kategori}` : '—'}
          sub={topKat ? `Kategori terbesar · ${(topKat.revenue/katTotal*100).toFixed(1)}% revenue` : 'Peluang produk'} />
        <Pilar tag="TERRITORY" color="#b45309" to="/territory"
          headline="Peta & aktivasi wilayah"
          sub="Di mana tumbuh, jenuh, & pipeline tidur" />
      </div>

      {/* Trend + Bills/AOV */}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:12 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Revenue Trend</div>
          {loading ? <Skeleton height={220}/> : !trend?.data?.length ? <div style={{height:220,display:'flex',alignItems:'center',justifyContent:'center',color:'#888',fontSize:13}}>Tidak ada data untuk filter ini</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="month" tick={{fontSize:11,fill:'#888'}}/>
                <YAxis tickFormatter={formatRupiahShort} tick={{fontSize:11,fill:'#888'}} width={68}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11}}/>
                {targetNum>0 && <ReferenceLine y={targetNum} stroke="#888" strokeDasharray="4 4" label={{value:'Target',fill:'#888',fontSize:11,position:'right'}}/>}
                {trendYears.map(y=>{ const isP=y===primary; return <Line key={y} type="monotone" dataKey={y} name={y} stroke={isP?(YEAR_COLORS[y]||'#d31137'):'#9aa7ba'} strokeWidth={isP?2.5:1.5} strokeDasharray={isP?undefined:'5 3'} dot={false}/> })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Bills vs AOV</div>
          {loading ? <Skeleton height={220}/> : !data?.bills_aov?.length ? <div style={{height:220,display:'flex',alignItems:'center',justifyContent:'center',color:'#888',fontSize:13}}>Tidak ada data</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data.bills_aov}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="month" tick={{fontSize:11,fill:'#888'}}/>
                <YAxis yAxisId="left" tick={{fontSize:11,fill:'#888'}} width={40}/>
                <YAxis yAxisId="right" orientation="right" tickFormatter={formatRupiahShort} tick={{fontSize:11,fill:'#888'}} width={60}/>
                <Tooltip {...tt} formatter={(v,n)=>n==='AOV'?formatRupiah(v):v}/><Legend wrapperStyle={{fontSize:11}}/>
                <Bar yAxisId="left" dataKey="bills" name="Bills" fill="#fc93a6"/>
                <Line yAxisId="right" type="monotone" dataKey="aov" name="AOV" stroke="#d31137" strokeWidth={2} dot={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Donuts + Top/Bottom salesperson mini */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        <DonutCard title="Kontribusi Revenue per Channel" data={data?.by_channel} valueKey="revenue" nameKey="channel" loading={loading}/>
        <DonutCard title="Kontribusi Revenue per Kategori" data={data?.by_kategori} valueKey="revenue" nameKey="kategori" loading={loading}/>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Top & Bottom Salesperson</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>% pencapaian target · tim inti K25</div>
          {loading ? <Skeleton height={170}/> : !sortedSp.length ? <div style={{color:'#888',fontSize:13}}>Data target belum tersedia</div> : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {top3.map((s,i)=><div key={'t'+i} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}><span>🟢 {s.name}</span><b style={{color:'#15803d'}}>{s.pct}%</b></div>)}
              <div style={{ borderTop:'1px dashed #eee', margin:'2px 0' }}/>
              {bot3.map((s,i)=><div key={'b'+i} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}><span>🔴 {s.name}</span><b style={{color:'#d31137'}}>{s.pct ?? 0}%</b></div>)}
              <Link to="/sales" style={{ color:'#d31137', textDecoration:'none', fontWeight:500, fontSize:12, marginTop:4 }}>Lihat semua →</Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
