import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, Legend,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort, formatNumber } from '../utils/format'
import { useGlobalFilters } from '../context/GlobalFilters'
import {
  getCustomerAnalytics, getCustomerLifecycle, getCustomerCohort, getCustomerListNew,
} from '../utils/api'

const RFM_COLORS = {
  Champions:{bar:'#22c55e',bg:'#dcfce7',text:'#166534'}, Loyal:{bar:'#4ade80',bg:'#d1fae5',text:'#065f46'},
  Promising:{bar:'#fbbf24',bg:'#fef9c3',text:'#854d0e'}, 'Need Attention':{bar:'#f59e0b',bg:'#ffedd5',text:'#9a3412'},
  'At Risk':{bar:'#fc617e',bg:'#fee2e2',text:'#991b1b'}, Lost:{bar:'#d31137',bg:'#f1f5f9',text:'#475569'},
}
const RFM_ORDER = ['At Risk','Lost','Need Attention','Promising','Loyal','Champions']
const TIER_COLORS = ['#d31137','#e0243f','#ec3650','#f44f64','#f96b7e','#fc8799','#fca4b5','#fbbfc9','#f8d4dc','#f2e4e8','#eedce0','#e8d6d9','#e2d0d3']
const tt = { contentStyle:{background:'#1a1a1a',border:'none',borderRadius:8,color:'#fff',fontSize:12}, itemStyle:{color:'#fff'}, cursor:{fill:'rgba(255,255,255,0.06)'} }
const SEGMENT_ACTION = {
  'At Risk':'Hubungi + insentif comeback dalam 7 hari.', Lost:'Campaign win-back; bila gagal, stop biaya akuisisi.',
  'Need Attention':'Pengingat + promo terbatas sebelum menjauh.', Promising:'Tawarkan produk pelengkap agar frekuensi naik.',
  Loyal:'Program poin agar naik ke Champions.', Champions:'Reward eksklusif; jadikan advokat.',
}
const heat = (p) => { const t=Math.max(0,Math.min(100,p))/100; const r=Math.round(211+(240-211)*(1-t)); const g=Math.round(17+(253-17)*(1-t)*0.4+ (0)); return `rgba(211,17,55,${0.12+t*0.8})` }

function tierRange(t){ const p=String(t).split('— '); return p[1]?p[1].trim():'' }

export default function CustomerIntelligence() {
  const g = useGlobalFilters()
  const [an, setAn] = useState(null)
  const [life, setLife] = useState(null)
  const [cohort, setCohort] = useState(null)
  const [list, setList] = useState(null)
  const [attention, setAttention] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seg, setSeg] = useState('all'); const [tier, setTier] = useState('all')
  const [status, setStatus] = useState('all'); const [search, setSearch] = useState(''); const [page, setPage] = useState(1)
  const [lifeMode, setLifeMode] = useState('count')

  const years = g?.years?.join(',') || undefined
  const channels = g?.channels?.join(',') || undefined

  useEffect(() => {
    if (!g?.ready) return
    setLoading(true)
    Promise.all([
      getCustomerAnalytics({ channels }),
      getCustomerLifecycle({ years, channels }),
      getCustomerCohort(),
      getCustomerListNew({ page:1, limit:6, status:'Overdue', channel: g.channels?.length===1?g.channels[0]:undefined }),
    ]).then(([a,l,c,at])=>{ setAn(a); setLife(l); setCohort(c); setAttention(at?.data||[]) })
      .catch(()=>{}).finally(()=>setLoading(false))
  }, [g?.ready, years, channels])

  useEffect(() => {
    if (!g?.ready) return
    getCustomerListNew({ segment:seg, tier, status, search, page, limit:25,
      channel: g.channels?.length===1?g.channels[0]:undefined }).then(setList).catch(()=>{})
  }, [g?.ready, seg, tier, status, search, page, channels])
  useEffect(()=>setPage(1),[seg,tier,status,search])

  if (!g) return null
  const kpi = an?.kpi
  const newCust = (life||[]).reduce((s,m)=>s+m.New,0)
  const segMap = {}; (an?.rfm_bubble||[]).forEach(b=>segMap[b.segment]=b)
  const tierData = (an?.tier_dist||[]).filter(t=>t.count>0)
    .sort((a,b)=>(a.tier>b.tier?1:-1)).slice(0,13)
    .map(t=>({ tier:String(t.tier).split(' — ')[0], range:tierRange(t.tier), count:t.count, revenue:t.revenue, pctRev:t.pctRev }))
  const bubbleData = RFM_ORDER.map(s=>segMap[s]).filter(Boolean).map(b=>({...b,x:b.avg_recency_days,y:b.avg_frequency,z:b.count}))
  const selStyle = { border:'1px solid #ddd', borderRadius:6, padding:'5px 8px', fontSize:12, background:'#fff', cursor:'pointer' }

  // Cohort pivot (12 cohort terbaru, n 0..11)
  const cohortMonths = [...new Set((cohort||[]).map(c=>c.cohort_bulan))].sort().slice(-12)
  const cohortMap = {}; (cohort||[]).forEach(c=>{ cohortMap[`${c.cohort_bulan}|${c.bulan_ke_n}`]=c })

  const kpiCards = kpi ? [
    { t:'TOTAL CUSTOMER', v:formatNumber(kpi.total_customers) },
    { t:'AVG REVENUE / CUSTOMER', v:formatRupiahShort(kpi.avg_rev_per_customer) },
    { t:'AVG RETENTION DAYS', v:`${kpi.avg_retention_days} hari` },
    { t:'REVENUE AT RISK', v:formatRupiahShort(kpi.revenue_at_risk), accent:'#d31137' },
    { t:'OVERDUE RATE', v:`${kpi.overdue_rate}%`, accent:'#f97316', sub:`retensi ${(100-kpi.overdue_rate).toFixed(1)}%` },
    { t:'CUSTOMER BARU (PERIODE)', v:formatNumber(newCust), accent:'#15803d' },
  ] : []

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* filter lokal */}
      <div style={{ position:'sticky', top:108, zIndex:80, background:'#fff', borderBottom:'1px solid #e5e7eb',
        padding:'8px 32px', marginLeft:-32, marginRight:-32, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#888' }}>FILTER CUSTOMER</span>
        <select style={selStyle} value={seg} onChange={e=>setSeg(e.target.value)}><option value="all">Semua Segmen</option>{RFM_ORDER.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <select style={selStyle} value={tier} onChange={e=>setTier(e.target.value)}><option value="all">Semua Tier</option>{(an?.tier_dist||[]).map(t=><option key={t.tier} value={t.tier}>{t.tier}</option>)}</select>
        <select style={selStyle} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Semua Status</option><option value="Active">Active</option><option value="Overdue">Overdue</option><option value="Lost">Lost</option></select>
        <input placeholder="🔍 cari customer" value={search} onChange={e=>setSearch(e.target.value)} style={{...selStyle,width:160}}/>
      </div>

      {/* Baris 1 — KPI 6 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
        {loading||!kpi ? [1,2,3,4,5,6].map(i=><SkeletonCard key={i} style={{height:88}}/>) : kpiCards.map((c,i)=>(
          <div key={i} style={{ background:'#fff', borderRadius:10, padding:14, minHeight:88, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #f0f0f0', borderTop:c.accent?`3px solid ${c.accent}`:'1px solid #f0f0f0', display:'flex', flexDirection:'column', justifyContent:'space-between', gap:4 }}>
            <div style={{ fontSize:10, color:'#888', fontWeight:600 }}>{c.t}</div>
            <div style={{ fontSize:18, fontWeight:700, color:c.accent||'#1a1a1a' }}>{c.v}</div>
            <div style={{ fontSize:10, color:'#999' }}>{c.sub||' '}</div>
          </div>
        ))}
      </div>

      {/* Baris 2 — Lifecycle Flow */}
      <Card style={{ padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div><div style={{ fontSize:13, fontWeight:600 }}>Customer Lifecycle Flow</div>
            <div style={{ fontSize:10.5, color:'#aaa' }}>Customer baru / repeat / reactivated per bulan · garis = total aktif</div></div>
          <select style={selStyle} value={lifeMode} onChange={e=>setLifeMode(e.target.value)}><option value="count">Jumlah customer</option><option value="rev">Revenue</option></select>
        </div>
        {loading ? <Skeleton height={220}/> : !life?.length ? <div style={{height:220,display:'flex',alignItems:'center',justifyContent:'center',color:'#888',fontSize:13}}>Tidak ada data untuk filter ini</div> : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={life.map(m=>({label:m.label,New:lifeMode==='rev'?m.rev_new:m.New,Repeat:lifeMode==='rev'?m.rev_repeat:m.Repeat,Reactivated:lifeMode==='rev'?m.rev_react:m.Reactivated,net:lifeMode==='rev'?(m.rev_new+m.rev_repeat+m.rev_react):m.net}))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="label" tick={{fontSize:10,fill:'#888'}}/>
              <YAxis tick={{fontSize:10,fill:'#888'}} tickFormatter={lifeMode==='rev'?formatRupiahShort:undefined} width={lifeMode==='rev'?54:36}/>
              <Tooltip {...tt} formatter={lifeMode==='rev'?(v)=>formatRupiah(v):undefined}/><Legend wrapperStyle={{fontSize:11}}/>
              <Bar dataKey="New" stackId="a" fill="#15803d"/><Bar dataKey="Repeat" stackId="a" fill="#9aa7ba"/><Bar dataKey="Reactivated" stackId="a" fill="#f59e0b"/>
              <Line type="monotone" dataKey="net" name="Total aktif" stroke="#d31137" strokeWidth={2} dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Baris 4 — Cohort Retention Heatmap */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Cohort Retention</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>% customer masih aktif N bulan setelah akuisisi (12 cohort terbaru).</div>
        {loading ? <Skeleton height={220}/> : !cohortMonths.length ? <div style={{color:'#888',fontSize:13}}>Tidak ada data</div> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ borderCollapse:'collapse', fontSize:10.5 }}>
              <thead><tr><th style={{ padding:'3px 6px', color:'#888', textAlign:'left' }}>Cohort</th>{Array.from({length:12}).map((_,n)=><th key={n} style={{ padding:'3px 6px', color:'#888' }}>M{n}</th>)}</tr></thead>
              <tbody>
                {cohortMonths.map(cm=>(
                  <tr key={cm}><td style={{ padding:'3px 6px', fontWeight:600, whiteSpace:'nowrap' }}>{cm}</td>
                    {Array.from({length:12}).map((_,n)=>{ const c=cohortMap[`${cm}|${n}`]; return (
                      <td key={n} style={{ padding:'3px 6px', textAlign:'center', background:c?heat(c.pct_retained):'transparent', color:c&&c.pct_retained>55?'#fff':'#333', minWidth:34 }}>{c?`${Math.round(c.pct_retained)}`:''}</td>
                    )})}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Baris 5 — Concentration + Reorder */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Revenue Concentration</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Top 10 customer = <b style={{color:'#d31137'}}>{an?.concentration?.top10_pct ?? 0}%</b> revenue.</div>
          {loading ? <Skeleton height={180}/> : (
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={an?.concentration?.pareto||[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="rank" tick={{fontSize:10,fill:'#888'}} label={{value:'peringkat customer',position:'insideBottom',offset:-2,fontSize:10,fill:'#aaa'}}/>
                <YAxis domain={[0,100]} tickFormatter={v=>v+'%'} tick={{fontSize:10,fill:'#888'}} width={36}/>
                <Tooltip {...tt} formatter={(v)=>`${v}%`}/>
                <Line type="monotone" dataKey="cum" name="kumulatif" stroke="#d31137" strokeWidth={2} dot={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Reorder Behaviour</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Repeat Rate <b style={{color:'#15803d'}}>{an?.reorder?.repeat_rate ?? 0}%</b> · distribusi jeda beli & jumlah nota.</div>
          {loading ? <Skeleton height={180}/> : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={an?.reorder?.interval_dist||[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="k" tick={{fontSize:10,fill:'#888'}}/><YAxis tick={{fontSize:10,fill:'#888'}} width={30}/>
                <Tooltip {...tt}/><Bar dataKey="v" name="customer" fill="#fc93a6" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Baris 6 — RFM Matrix + Tier Distribution */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>RFM Matrix</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>X=Recency (hari) · Y=Frequency · ukuran=jumlah customer</div>
          {loading ? <Skeleton height={260}/> : !bubbleData.length ? <div style={{color:'#888',fontSize:13}}>Tidak ada data</div> : (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{top:10,right:16,bottom:20,left:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis type="number" dataKey="x" name="Recency" tick={{fontSize:10,fill:'#888'}} label={{value:'Recency (hari)',position:'insideBottom',offset:-10,fontSize:10,fill:'#aaa'}}/>
                <YAxis type="number" dataKey="y" name="Frequency" tick={{fontSize:10,fill:'#888'}} width={30}/>
                <ZAxis type="number" dataKey="z" range={[200,2200]}/>
                <Tooltip content={({active,payload})=>{ if(!active||!payload?.length) return null; const d=payload[0].payload
                  return <div style={{background:'#1a1a1a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#fff'}}><div style={{fontWeight:700,color:RFM_COLORS[d.segment]?.bar}}>{d.segment}</div><div>{formatNumber(d.count)} cust · {formatRupiahShort(d.revenue)}</div><div style={{color:'#bbb'}}>Recency {d.avg_recency_days}h · Freq {d.avg_frequency}</div></div> }}/>
                {bubbleData.map(d=><Scatter key={d.segment} name={d.segment} data={[d]} fill={RFM_COLORS[d.segment]?.bar||'#ccc'} fillOpacity={0.75}/>)}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>Customer Tier Distribution</div>
          {loading ? <Skeleton height={260}/> : !tierData.length ? <div style={{color:'#888',fontSize:13}}>Tidak ada data</div> : (
            <ResponsiveContainer width="100%" height={Math.max(260,tierData.length*22)}>
              <BarChart data={tierData} layout="vertical" margin={{left:6,right:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis type="number" tick={{fontSize:10,fill:'#888'}}/>
                <YAxis type="category" dataKey="tier" width={44} tick={{fontSize:10,fill:'#666'}}/>
                <Tooltip {...tt} formatter={(v,n,p)=>[`${p.payload.count} cust · ${p.payload.pctRev}% revenue`,p.payload.tier]}/>
                <Bar dataKey="count" radius={[0,3,3,0]}>{tierData.map((_,i)=><Cell key={i} fill={TIER_COLORS[i]||'#ccc'}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Baris 7 — Customer Perlu Perhatian */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Customer Perlu Perhatian <span style={{fontSize:11,fontWeight:400,color:'#888'}}>· overdue, urut revenue at risk</span></div>
        {loading ? <Skeleton height={160}/> : !attention?.length ? <div style={{color:'#22c55e',fontSize:13}}>✓ Tidak ada customer overdue</div> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ borderBottom:'1px solid #f0f0f0' }}>{['Nama','Tier','Segmen','Salesperson','Terakhir Beli','Overdue','Revenue at Risk'].map(h=><th key={h} style={{ padding:'5px 8px', textAlign:'left', color:'#888', fontSize:11, fontWeight:600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {attention.map((c,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid #f5f5f5' }}>
                    <td style={{ padding:'5px 8px', fontWeight:600, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.customer_name}</td>
                    <td style={{ padding:'5px 8px', fontSize:11 }}>{String(c.tier||'').split(' — ')[0]}</td>
                    <td style={{ padding:'5px 8px' }}>{c.segmen_rfm&&<span style={{ background:RFM_COLORS[c.segmen_rfm]?.bg, color:RFM_COLORS[c.segmen_rfm]?.text, fontSize:11, padding:'2px 8px', borderRadius:10, fontWeight:600 }}>{c.segmen_rfm}</span>}</td>
                    <td style={{ padding:'5px 8px', fontSize:11, color:'#666' }}>{c.salesperson_utama||'-'}</td>
                    <td style={{ padding:'5px 8px', fontSize:11, color:'#666' }}>{c.last_order_date}</td>
                    <td style={{ padding:'5px 8px', color:'#d31137', fontWeight:600 }}>{c.days_since_last_order} hari</td>
                    <td style={{ padding:'5px 8px', color:'#d31137', fontWeight:600 }}>{formatRupiahShort(c.revenue_at_risk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Baris 8 — Tabel Daftar Customer */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Daftar Customer</div>
        {!list ? <Skeleton height={200}/> : !list.data?.length ? <div style={{ textAlign:'center', padding:'30px 0', color:'#888', fontSize:13 }}>Tidak ada customer sesuai filter.</div> : (
          <>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ borderBottom:'2px solid #f0f0f0' }}>{['Nama','Tier','Segmen','Total Revenue','Avg/Bulan','Bills','Terakhir Beli','Status'].map(h=><th key={h} style={{ padding:'6px 8px', textAlign:'left', color:'#888', fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {list.data.map((c,i)=>{ const rowBg=c.status==='Lost'?'#f1f5f9':c.status==='Overdue'?'#fff8e1':'transparent'
                    return (
                    <tr key={i} style={{ background:rowBg, borderBottom:'1px solid #f5f5f5' }}>
                      <td style={{ padding:'6px 8px', fontWeight:600, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.customer_name}</td>
                      <td style={{ padding:'6px 8px', fontSize:11 }}><span style={{ background:'#f1f5f9', color:'#475569', padding:'2px 6px', borderRadius:4 }}>{String(c.tier||'').split(' — ')[0]}</span></td>
                      <td style={{ padding:'6px 8px' }}>{c.segmen_rfm&&<span style={{ background:RFM_COLORS[c.segmen_rfm]?.bg, color:RFM_COLORS[c.segmen_rfm]?.text, fontSize:11, padding:'2px 8px', borderRadius:10, fontWeight:600 }}>{c.segmen_rfm}</span>}</td>
                      <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>{formatRupiahShort(c.total_revenue)}</td>
                      <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>{formatRupiahShort(c.avg_spending_per_month_active)}</td>
                      <td style={{ padding:'6px 8px' }}>{c.jumlah_bills}</td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#666' }}>{c.last_order_date}</td>
                      <td style={{ padding:'6px 8px' }}><span style={{ fontSize:11, fontWeight:700, color:c.status==='Lost'?'#d31137':c.status==='Overdue'?'#f59e0b':'#22c55e' }}>{c.status}</span></td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12 }}>
              <span style={{ fontSize:12, color:'#888' }}>{list.total} customer</span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{ ...selStyle, color:page===1?'#ccc':'#333' }}>← Prev</button>
                <span style={{ padding:'5px 10px', fontSize:12, color:'#888' }}>Hal {page}</span>
                <button onClick={()=>setPage(p=>p+1)} disabled={page*25>=(list.total||0)} style={selStyle}>Next →</button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
