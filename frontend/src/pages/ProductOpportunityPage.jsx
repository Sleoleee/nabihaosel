import { useState, useEffect } from 'react'
import {
  ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import { useGlobalFilters } from '../context/GlobalFilters'
import { getProduct, getProductPairing, getProductPenetration } from '../utils/api'

const CH_COLORS = { 'E-Commerce':'#d31137','SUKSES JAYA':'#5b6b82','NAMI':'#f096a6','BLOOMIE':'#a8b3c4','K25':'#3d4a5c','OTHER CHANNEL':'#c9d1dc' }
const tt = { contentStyle:{background:'#1a1a1a',border:'none',borderRadius:8,color:'#fff',fontSize:12}, itemStyle:{color:'#fff'}, cursor:{fill:'rgba(255,255,255,0.06)'} }
const penColor = (p) => `rgba(21,128,61,${0.1+Math.min(100,p)/100*0.85})`

export default function ProductOpportunityPage() {
  const g = useGlobalFilters()
  const [prod, setProd] = useState(null)
  const [pair, setPair] = useState(null)
  const [pen, setPen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [coreOnly, setCoreOnly] = useState(true)

  const years = g?.years?.join(',') || undefined
  const channels = g?.channels?.join(',') || undefined

  useEffect(() => {
    if (!g?.ready) return
    setLoading(true)
    Promise.all([
      getProduct({ years, channels, core_only: coreOnly }),
      getProductPairing({ years }),
      getProductPenetration({ channels, core_only: coreOnly }),
    ]).then(([p, pr, pe]) => { setProd(p); setPair(pr); setPen(pe) }).catch(()=>{}).finally(()=>setLoading(false))
  }, [g?.ready, years, channels, coreOnly])

  if (!g) return null
  const kpi = prod?.kpi
  const matrix = (prod?.matrix||[]).filter(m=>m.growth_yoy!=null).map(m=>({...m,x:m.growth_yoy,y:m.share,z:m.revenue}))
  const chans = prod?.channels_present || []
  const catChannel = (prod?.cat_channel||[]).slice(0,12)
  const selStyle = { border:'1px solid #ddd', borderRadius:6, padding:'5px 8px', fontSize:12, background:'#fff', cursor:'pointer' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#888' }}>FILTER PRODUCT</span>
        <label style={{ fontSize:12.5, display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
          <input type="checkbox" checked={coreOnly} onChange={e=>setCoreOnly(e.target.checked)}/> Hanya produk inti
        </label>
        <span style={{ fontSize:10.5, color:'#aaa' }}>(buang MARKETPLACE, BIAYA PACKAGING, TAS PAPERBAG)</span>
      </div>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {loading||!kpi ? [1,2,3].map(i=><SkeletonCard key={i} style={{height:88}}/>) : <>
          <div style={{ background:'#fff', borderRadius:10, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #f0f0f0' }}>
            <div style={{ fontSize:10.5, color:'#888', fontWeight:600 }}>KATEGORI AKTIF</div>
            <div style={{ fontSize:22, fontWeight:700 }}>{kpi.n_kategori}</div></div>
          <div style={{ background:'#fff', borderRadius:10, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #f0f0f0' }}>
            <div style={{ fontSize:10.5, color:'#888', fontWeight:600 }}>KATEGORI TERBESAR</div>
            <div style={{ fontSize:18, fontWeight:700 }}>{kpi.biggest?.kategori||'-'}</div>
            <div style={{ fontSize:11, color:'#888' }}>{kpi.biggest?formatRupiahShort(kpi.biggest.revenue)+' · '+kpi.biggest.share+'%':''}</div></div>
          <div style={{ background:'#fff', borderRadius:10, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #f0f0f0', borderTop:'3px solid #15803d' }}>
            <div style={{ fontSize:10.5, color:'#888', fontWeight:600 }}>GROWTH TERTINGGI YoY</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#15803d' }}>{kpi.top_growth?kpi.top_growth.kategori:'-'}</div>
            <div style={{ fontSize:11, color:'#15803d' }}>{kpi.top_growth?`▲ ${kpi.top_growth.growth_yoy}%`:''}</div></div>
        </>}
      </div>

      {/* Baris 2 — Category Performance Matrix */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Category Performance Matrix</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>X=Growth YoY · Y=Share revenue · ukuran=revenue. Kanan-atas Star · kiri-atas Cash Cow · kanan-bawah Question · kiri-bawah Dog.</div>
        {loading ? <Skeleton height={300}/> : !matrix.length ? <div style={{height:300,display:'flex',alignItems:'center',justifyContent:'center',color:'#888',fontSize:13}}>Butuh tahun pembanding (aktifkan lebih dari 1 tahun / compare)</div> : (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{top:10,right:20,bottom:24,left:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis type="number" dataKey="x" name="Growth" unit="%" tick={{fontSize:11,fill:'#888'}} label={{value:'Growth YoY (%)',position:'insideBottom',offset:-14,fontSize:11,fill:'#888'}}/>
              <YAxis type="number" dataKey="y" name="Share" unit="%" tick={{fontSize:11,fill:'#888'}} label={{value:'Share (%)',angle:-90,position:'insideLeft',fontSize:11,fill:'#888'}}/>
              <ZAxis type="number" dataKey="z" range={[120,1600]}/>
              <ReferenceLine x={0} stroke="#bbb" strokeDasharray="4 4"/>
              <Tooltip content={({active,payload})=>{ if(!active||!payload?.length) return null; const d=payload[0].payload
                return <div style={{background:'#1a1a1a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#fff'}}><div style={{fontWeight:700}}>{d.kategori}</div><div>Growth {d.growth_yoy}% · Share {d.share}%</div><div style={{color:'#bbb'}}>{formatRupiah(d.revenue)}</div></div> }}/>
              <Scatter data={matrix}>{matrix.map((d,i)=><Cell key={i} fill={d.x>=0?'#15803d':'#d31137'} fillOpacity={0.68}/>)}</Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Baris 3 — Growth Movers */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {['up','down'].map(dir=>(
          <Card key={dir} style={{ padding:16 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>{dir==='up'?'Top Naik':'Top Turun'} (kategori, Δ revenue YoY)</div>
            {loading ? <Skeleton height={200}/> : (
              <ResponsiveContainer width="100%" height={Math.max(180,(prod?.movers?.[dir]||[]).length*26)}>
                <BarChart data={prod?.movers?.[dir]||[]} layout="vertical" margin={{left:8,right:40}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis type="number" tickFormatter={formatRupiahShort} tick={{fontSize:10,fill:'#888'}}/>
                  <YAxis type="category" dataKey="kategori" width={100} tick={{fontSize:10,fill:'#666'}}/>
                  <Tooltip {...tt} formatter={(v,n,p)=>[`${formatRupiah(v)} (${p.payload.growth!=null?p.payload.growth+'%':'-'})`,'Δ revenue']}/>
                  <Bar dataKey="delta" radius={[0,3,3,0]}>{(prod?.movers?.[dir]||[]).map((_,i)=><Cell key={i} fill={dir==='up'?'#15803d':'#d31137'}/>)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        ))}
      </div>

      {/* Baris 5 — Category Pairing */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Category Pairing (Market Basket)</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Pasangan kategori dalam 1 nota, urut lift tertinggi (lift &gt;1 = saling mendorong).</div>
        {loading ? <Skeleton height={200}/> : !pair?.length ? <div style={{color:'#888',fontSize:13}}>Tidak ada data</div> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ borderBottom:'2px solid #f0f0f0' }}>{['Kategori A','Kategori B','Nota Bersama','Confidence','Lift'].map(h=><th key={h} style={{ padding:'6px 8px', textAlign:h==='Kategori A'||h==='Kategori B'?'left':'right', color:'#888', fontSize:11, fontWeight:600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {pair.slice(0,15).map((p,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid #f5f5f5' }}>
                    <td style={{ padding:'5px 8px', fontWeight:500 }}>{p.kategori_a}</td>
                    <td style={{ padding:'5px 8px', fontWeight:500 }}>{p.kategori_b}</td>
                    <td style={{ padding:'5px 8px', textAlign:'right' }}>{p.count.toLocaleString('id')}</td>
                    <td style={{ padding:'5px 8px', textAlign:'right' }}>{(p.confidence*100).toFixed(1)}%</td>
                    <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:700, color:p.lift>=1?'#15803d':'#888' }}>{p.lift}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Baris 6 — Category Penetration */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Category Penetration per Tier</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>% customer di tiap tier yang pernah membeli kategori. Merah muda = penetrasi rendah (white space).</div>
        {loading ? <Skeleton height={220}/> : !pen?.cells?.length ? <div style={{color:'#888',fontSize:13}}>Tidak ada data</div> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ borderCollapse:'collapse', fontSize:10.5 }}>
              <thead><tr><th style={{ padding:'3px 6px', textAlign:'left', color:'#888' }}>Tier</th>{pen.kategori.map(k=><th key={k} style={{ padding:'3px 5px', color:'#888', writingMode:'vertical-rl', transform:'rotate(180deg)', maxHeight:80, fontSize:9.5 }}>{k}</th>)}</tr></thead>
              <tbody>
                {pen.tiers.map(t=>(
                  <tr key={t}><td style={{ padding:'3px 6px', fontWeight:600, whiteSpace:'nowrap' }}>{t}</td>
                    {pen.kategori.map(k=>{ const c=pen.cells.find(x=>x.tier===t&&x.kategori===k); const p=c?c.pct:0
                      return <td key={k} title={c?`${k}: ${p}% (${c.buyers}/${c.total})`:''} style={{ padding:'3px 5px', textAlign:'center', minWidth:30, background:c?penColor(p):'#fafafa', color:p>50?'#fff':'#333' }}>{c?Math.round(p):''}</td> })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Baris 8 — Kategori × Channel */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Kategori × Channel</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Komposisi channel tiap kategori (100% stacked).</div>
        {loading ? <Skeleton height={260}/> : !catChannel.length ? <div style={{color:'#888',fontSize:13}}>Tidak ada data</div> : (
          <ResponsiveContainer width="100%" height={Math.max(220, catChannel.length*30)}>
            <BarChart data={catChannel} layout="vertical" stackOffset="expand" margin={{left:10,right:20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis type="number" tickFormatter={v=>`${Math.round(v*100)}%`} tick={{fontSize:10,fill:'#888'}}/>
              <YAxis type="category" dataKey="kategori" width={100} tick={{fontSize:10,fill:'#666'}}/>
              <Tooltip {...tt} formatter={(v)=>formatRupiah(v)}/>
              {chans.map(ch=><Bar key={ch} dataKey={ch} stackId="a" fill={CH_COLORS[ch]||'#ccc'}/>)}
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div style={{ fontSize:10.5, color:'#bbb' }}>Baris SKU-level (Pareto SKU, efek volume vs harga) & Customer×Category matrix menyusul — perlu tabel agregat SKU-tahunan.</div>
    </div>
  )
}
