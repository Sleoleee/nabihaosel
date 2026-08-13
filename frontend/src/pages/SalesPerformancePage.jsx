import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, ComposedChart, Line, LineChart, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell, Legend,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { useGlobalFilters } from '../context/GlobalFilters'
import { getSalesPerformance, getSalesMix, getSalesTrend } from '../utils/api'

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
function momOf(series) {
  if (!series) return null
  let last = -1
  for (let i = 11; i >= 0; i--) { if (series[i] > 0) { last = i; break } }
  if (last <= 0 || !(series[last-1] > 0)) return null
  return Math.round((series[last] - series[last-1]) / series[last-1] * 1000) / 10
}

const SPV_LIST = ['SPV REGEN', 'SPV ARI', 'SPV ABDUL WAHID']
const MIX_COLORS = ['#d31137','#5b6b82','#f096a6','#a8b3c4','#3d4a5c','#fbbfc9']
const tt = { contentStyle:{background:'#1a1a1a',border:'none',borderRadius:8,color:'#fff',fontSize:12}, itemStyle:{color:'#fff'}, cursor:{fill:'rgba(255,255,255,0.06)'} }

const pctColor = (p) => p == null ? '#999' : p >= 100 ? '#15803d' : p >= 70 ? '#f59e0b' : '#d31137'
const growthColor = (g) => g == null ? '#999' : g >= 0 ? '#15803d' : '#d31137'

function downloadCSV(rows, filename) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => {
    const v = r[c] ?? ''
    return typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g,'""')}"` : v
  }).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}

function KpiCard({ title, value, sub, accent }) {
  return (
    <div style={{ background:'#fff', borderRadius:10, padding:16, minHeight:92, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #f0f0f0', borderTop:accent?`3px solid ${accent}`:'1px solid #f0f0f0', display:'flex', flexDirection:'column', justifyContent:'space-between', gap:4 }}>
      <div style={{ fontSize:10.5, color:'#888', fontWeight:600, letterSpacing:'0.04em' }}>{title}</div>
      <div style={{ fontSize:20, fontWeight:700, lineHeight:1.1, color:accent||'#1a1a1a' }}>{value}</div>
      <div style={{ fontSize:11, color:'#888' }}>{sub}</div>
    </div>
  )
}

export default function SalesPerformancePage() {
  const g = useGlobalFilters()
  const [data, setData] = useState(null)
  const [mix, setMix] = useState(null)
  const [trend, setTrend] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState('core')       // core | all | unassigned
  const [spvSel, setSpvSel] = useState([])          // multi
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('revenue')
  const [sortDir, setSortDir] = useState('desc')

  const years = g?.years?.join(',') || undefined
  const channels = g?.channels?.join(',') || undefined

  useEffect(() => {
    if (!g?.ready) return
    setLoading(true)
    Promise.all([getSalesPerformance({ years, channels }), getSalesMix({ years, channels }), getSalesTrend({ years, channels })])
      .then(([d, m, t]) => { setData(d); setMix(m); setTrend(t) }).catch(()=>{}).finally(()=>setLoading(false))
  }, [g?.ready, years, channels])

  const all = data?.salespeople || []
  const scoped = useMemo(() => {
    let r = all
    if (scope === 'core') r = r.filter(s => s.is_core)
    else if (scope === 'unassigned') r = r.filter(s => !s.is_core)
    if (spvSel.length) r = r.filter(s => spvSel.includes(s.spv))
    if (search) r = r.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    return r
  }, [all, scope, spvSel, search])

  const sorted = useMemo(() => {
    const r = [...scoped].sort((a,b) => {
      const av = a[sortKey] ?? -Infinity, bv = b[sortKey] ?? -Infinity
      return sortDir === 'desc' ? (bv>av?1:-1) : (av>bv?1:-1)
    })
    return r
  }, [scoped, sortKey, sortDir])

  // KPI (scoped)
  const totRev = scoped.reduce((s,x)=>s+x.revenue,0)
  const totTgt = scoped.reduce((s,x)=>s+(x.target||0),0)
  const withT = scoped.filter(s=>s.target)
  const achieved = withT.filter(s=>(s.pct||0)>=100).length
  const revs = scoped.map(s=>s.revenue).sort((a,b)=>a-b)
  const mean = revs.length ? totRev/revs.length : 0
  const median = revs.length ? revs[Math.floor(revs.length/2)] : 0

  const quadrantData = scoped.filter(s=>s.pct!=null && s.growth_yoy!=null)
    .map(s=>({ ...s, x:s.pct, y:s.growth_yoy, z:s.revenue }))

  // Pareto kontribusi
  const byRev = [...scoped].sort((a,b)=>b.revenue-a.revenue)
  const ptot = byRev.reduce((s,x)=>s+x.revenue,0) || 1
  let _cum = 0
  const paretoData = byRev.map(s=>{ _cum += s.revenue; return { name:s.name, revenue:s.revenue, cum:Math.round(_cum/ptot*1000)/10 } })
  const n80 = (paretoData.findIndex(d=>d.cum>=80)+1) || paretoData.length

  const sel = (v) => <span onClick={()=>{ setSortKey(v); setSortDir(d=>sortKey===v&&d==='desc'?'asc':'desc') }} style={{cursor:'pointer'}}>⇅</span>
  const th = { padding:'6px 8px', textAlign:'right', fontSize:10.5, color:'#888', fontWeight:600, whiteSpace:'nowrap' }
  const td = { padding:'5px 8px', textAlign:'right', fontSize:12, whiteSpace:'nowrap' }

  if (!g) return null
  const selStyle = { border:'1px solid #ddd', borderRadius:6, padding:'5px 8px', fontSize:12.5, background:'#fff', cursor:'pointer' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* filter lokal */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#888' }}>FILTER SALES</span>
        <select style={selStyle} value={scope} onChange={e=>setScope(e.target.value)}>
          <option value="core">Tim inti K25</option>
          <option value="all">Semua salesperson</option>
          <option value="unassigned">Unassigned / Non-core</option>
        </select>
        {SPV_LIST.map(t=>(
          <label key={t} style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, cursor:'pointer' }}>
            <input type="checkbox" checked={spvSel.includes(t)} onChange={()=>setSpvSel(s=>s.includes(t)?s.filter(x=>x!==t):[...s,t])}/>{t.replace('SPV ','')}
          </label>
        ))}
        <input placeholder="🔍 cari nama" value={search} onChange={e=>setSearch(e.target.value)} style={{ ...selStyle, width:150 }}/>
      </div>

      {/* Baris 1 — KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {loading ? [1,2,3,4,5].map(i=><SkeletonCard key={i} style={{height:92}}/>) : <>
          <KpiCard title="TOTAL REVENUE TIM" value={formatRupiahShort(totRev)} sub={`${scoped.length} salesperson`} />
          <KpiCard title="% ACHIEVEMENT" value={totTgt?`${(totRev/totTgt*100).toFixed(1)}%`:'—'} sub={totTgt?`target ${formatRupiahShort(totTgt)}`:'tanpa target'} accent={totTgt?pctColor(totRev/totTgt*100):null} />
          <KpiCard title="GAP KE TARGET" value={totTgt?formatRupiahShort(Math.max(0,totTgt-totRev)):'—'} sub={totTgt&&totRev<totTgt?`kurang untuk capai target`:'target tercapai'} accent="#d31137" />
          <KpiCard title="MENCAPAI TARGET" value={withT.length?`${achieved} dari ${withT.length}`:'—'} sub="salesperson ≥100%" />
          <KpiCard title="AVG REVENUE / SP" value={formatRupiahShort(mean)} sub={`median ${formatRupiahShort(median)}`} />
        </>}
      </div>

      {/* Baris 2 — Target vs Actual per SPV */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Target vs Actual per SPV</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:10 }}>Batang = revenue aktual · garis = target · tim inti K25</div>
        {loading ? <Skeleton height={180}/> : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {(data?.teams||[]).map((t,i)=>{
              const pct = t.pct||0, w=Math.min(100,pct)
              return (
                <div key={i}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                    <b>{t.team}</b>
                    <span style={{ color:pctColor(pct), fontWeight:600 }}>{t.pct!=null?`${t.pct}%`:'—'} · {formatRupiahShort(t.revenue)} / {formatRupiahShort(t.target)}</span>
                  </div>
                  <div style={{ position:'relative', height:14, background:'#f0f0f0', borderRadius:4 }}>
                    <div style={{ height:14, width:`${w}%`, background:pctColor(pct), borderRadius:4 }}/>
                    <div style={{ position:'absolute', left:'100%', top:-2, width:2, height:18, background:'#1a1a1a' }}/>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Baris 3 — Quadrant Kualitas Pencapaian */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Kualitas Pencapaian</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>X = % achievement · Y = growth YoY · ukuran = revenue. Kanan-bawah = capai target tapi revenue turun (target terlalu rendah).</div>
        {loading ? <Skeleton height={300}/> : !quadrantData.length ? <div style={{height:300,display:'flex',alignItems:'center',justifyContent:'center',color:'#888',fontSize:13}}>Butuh data target & tahun pembanding</div> : (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top:10, right:20, bottom:24, left:8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis type="number" dataKey="x" name="% Ach" unit="%" tick={{fontSize:11,fill:'#888'}} label={{value:'% Achievement',position:'insideBottom',offset:-14,fontSize:11,fill:'#888'}}/>
              <YAxis type="number" dataKey="y" name="Growth YoY" unit="%" tick={{fontSize:11,fill:'#888'}} label={{value:'Growth YoY',angle:-90,position:'insideLeft',fontSize:11,fill:'#888'}}/>
              <ZAxis type="number" dataKey="z" range={[100,1400]}/>
              <ReferenceLine x={100} stroke="#bbb" strokeDasharray="4 4"/>
              <ReferenceLine y={0} stroke="#bbb" strokeDasharray="4 4"/>
              <Tooltip content={({active,payload})=>{ if(!active||!payload?.length) return null; const d=payload[0].payload
                return <div style={{background:'#1a1a1a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#fff'}}><div style={{fontWeight:700}}>{d.name}</div><div>Ach {d.pct}% · Growth {d.growth_yoy}%</div><div style={{color:'#bbb'}}>{formatRupiah(d.revenue)}</div></div> }}/>
              <Scatter data={quadrantData}>
                {quadrantData.map((d,i)=><Cell key={i} fill={d.x>=100&&d.y<0?'#f59e0b':d.x>=100?'#15803d':d.y>=0?'#5b6b82':'#d31137'} fillOpacity={0.72}/>)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Baris 4 — Leaderboard */}
      <Card style={{ padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:600 }}>Leaderboard Salesperson</div>
          <button onClick={()=>downloadCSV(sorted.map(s=>({Nama:s.name,SPV:s.spv||'-',Revenue:s.revenue,Pct_Ach:s.pct??'',Gap:s.gap??'',Growth_YoY:s.growth_yoy??'',Bills:s.bills,AOV:s.aov,Customer:s.customers,New:s.customer_new,RevenueAtRisk:s.revenue_at_risk})),'leaderboard_sales.csv')}
            style={{ ...selStyle, fontSize:12 }}>⬇ Export CSV</button>
        </div>
        {loading ? <Skeleton height={240}/> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ borderBottom:'2px solid #f0f0f0' }}>
                <th style={{ ...th, textAlign:'left' }}>Nama</th><th style={{...th,textAlign:'left'}}>SPV</th>
                <th style={th}>Revenue {sel('revenue')}</th><th style={th}>% Ach {sel('pct')}</th><th style={th}>Gap</th>
                <th style={th}>Growth YoY {sel('growth_yoy')}</th><th style={th}>MoM</th><th style={th}>Bills {sel('bills')}</th><th style={th}>AOV</th>
                <th style={th}>Cust</th><th style={th}>New</th><th style={th}>At Risk</th>
              </tr></thead>
              <tbody>
                {sorted.map((s,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid #f5f5f5' }}>
                    <td style={{ ...td, textAlign:'left', fontWeight:600 }}>{s.name}{!s.is_core&&<span style={{fontSize:10,color:'#bbb'}}> ·nc</span>}</td>
                    <td style={{ ...td, textAlign:'left', color:'#888', fontSize:11 }}>{s.spv?.replace('SPV ','')||'-'}</td>
                    <td style={td}>{formatRupiahShort(s.revenue)}</td>
                    <td style={{ ...td, color:pctColor(s.pct), fontWeight:600 }}>{s.pct!=null?`${s.pct}%`:'-'}</td>
                    <td style={{ ...td, color:'#888' }}>{s.gap!=null?formatRupiahShort(s.gap):'-'}</td>
                    <td style={{ ...td, color:growthColor(s.growth_yoy), fontWeight:600 }}>{s.growth_yoy!=null?`${s.growth_yoy>0?'▲':'▼'}${Math.abs(s.growth_yoy)}%`:'-'}</td>
                    {(()=>{ const mom=momOf(trend?.[s.name]); return <td style={{ ...td, color:growthColor(mom), fontWeight:600 }}>{mom!=null?`${mom>0?'▲':'▼'}${Math.abs(mom)}%`:'-'}</td> })()}
                    <td style={td}>{formatNumber(s.bills)}</td><td style={td}>{formatRupiahShort(s.aov)}</td>
                    <td style={td}>{s.customers}</td><td style={td}>{s.customer_new}</td>
                    <td style={{ ...td, color:s.revenue_at_risk>0?'#d31137':'#888' }}>{formatRupiahShort(s.revenue_at_risk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Baris 5 — Pareto + Sparklines 12 bulan */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Pareto Kontribusi Revenue</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>
            {byRev.length ? <><b>{n80}</b> orang menyumbang 80% revenue dari total {byRev.length} salesperson.</> : '—'}
          </div>
          {loading ? <Skeleton height={220}/> : !paretoData.length ? <div style={{height:220,display:'flex',alignItems:'center',justifyContent:'center',color:'#888',fontSize:13}}>Tidak ada data</div> : (
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={paretoData.slice(0,20)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="name" tick={false} height={6}/>
                <YAxis yAxisId="l" tickFormatter={formatRupiahShort} tick={{fontSize:10,fill:'#888'}} width={54}/>
                <YAxis yAxisId="r" orientation="right" domain={[0,100]} tickFormatter={v=>v+'%'} tick={{fontSize:10,fill:'#888'}} width={38}/>
                <Tooltip {...tt} formatter={(v,n)=>n==='cum'?`${v}%`:formatRupiah(v)}/>
                <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill="#fc93a6"/>
                <Line yAxisId="r" type="monotone" dataKey="cum" name="cum" stroke="#d31137" strokeWidth={2} dot={false}/>
                <ReferenceLine yAxisId="r" y={80} stroke="#bbb" strokeDasharray="4 4"/>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Tren 12 Bulan per Salesperson</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Bentuk tren revenue tiap salesperson (top 9).</div>
          {loading ? <Skeleton height={220}/> : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {byRev.slice(0,9).map((s,i)=>{
                const ser=(trend?.[s.name]||[]).map((v,m)=>({m:MONTHS[m],v}))
                return (
                  <div key={i} style={{ border:'1px solid #f0f0f0', borderRadius:6, padding:'6px 8px' }}>
                    <div style={{ fontSize:10.5, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
                    <ResponsiveContainer width="100%" height={40}>
                      <LineChart data={ser}><Line type="monotone" dataKey="v" stroke="#d31137" strokeWidth={1.5} dot={false}/></LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Baris 6 & 7 — Portfolio quality + Mix kategori */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Kualitas Portfolio</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Membedakan yang menambah customer baru dari yang hanya menjaga customer lama.</div>
          {loading ? <Skeleton height={240}/> : (
            <ResponsiveContainer width="100%" height={Math.max(200, sorted.slice(0,12).length*26)}>
              <BarChart data={sorted.slice(0,12).map(s=>({name:s.name,New:s.customer_new,Repeat:s.customer_repeat,Reactivated:s.customer_reactivated}))} layout="vertical" margin={{left:10}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis type="number" tick={{fontSize:10,fill:'#888'}}/>
                <YAxis type="category" dataKey="name" width={80} tick={{fontSize:10,fill:'#666'}}/>
                <Tooltip {...tt}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey="New" stackId="a" fill="#15803d"/><Bar dataKey="Repeat" stackId="a" fill="#9aa7ba"/><Bar dataKey="Reactivated" stackId="a" fill="#f59e0b"/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Mix Kategori per Salesperson</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Komposisi revenue (top 5 kategori). Sorot yang terlalu bergantung 1 kategori.</div>
          {loading ? <Skeleton height={240}/> : (
            <div style={{ maxHeight:260, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
              {sorted.slice(0,12).map((s,i)=>{
                const km = (mix?.[s.name])||[]; const tot=km.reduce((a,x)=>a+x.revenue,0)||1
                const dom = km[0] ? km[0].revenue/tot*100 : 0
                return (
                  <div key={i}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:2 }}>
                      <span>{s.name} {dom>70&&<span style={{color:'#d31137'}} title="terlalu bergantung 1 kategori">⚠</span>}</span>
                    </div>
                    <div style={{ display:'flex', height:12, borderRadius:3, overflow:'hidden', background:'#f0f0f0' }}>
                      {km.map((k,j)=><div key={j} title={`${k.kategori}: ${formatRupiahShort(k.revenue)}`} style={{ width:`${k.revenue/tot*100}%`, background:MIX_COLORS[j%MIX_COLORS.length] }}/>)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Baris 8 — Action List */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Action List per Salesperson</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Customer overdue & revenue at risk yang dipegang tiap salesperson.</div>
        {loading ? <Skeleton height={160}/> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ borderBottom:'2px solid #f0f0f0' }}>
                <th style={{...th,textAlign:'left'}}>Salesperson</th><th style={th}>Customer Overdue</th><th style={th}>Revenue at Risk</th><th style={{...th,textAlign:'left'}}>Aksi</th>
              </tr></thead>
              <tbody>
                {[...scoped].filter(s=>s.overdue_customers>0).sort((a,b)=>b.revenue_at_risk-a.revenue_at_risk).slice(0,10).map((s,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid #f5f5f5' }}>
                    <td style={{...td,textAlign:'left',fontWeight:600}}>{s.name}</td>
                    <td style={td}>{s.overdue_customers}</td>
                    <td style={{...td,color:'#d31137',fontWeight:600}}>{formatRupiahShort(s.revenue_at_risk)}</td>
                    <td style={{...td,textAlign:'left'}}><a href="/customers" style={{color:'#d31137',textDecoration:'none',fontSize:11,fontWeight:600}}>Buka daftar customer →</a></td>
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
