import { useState, useEffect } from 'react'
import {
  ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import { useGlobalFilters } from '../context/GlobalFilters'
import { getProduct, getProductPairing, getProductPenetration, getProductSku, getDiscount } from '../utils/api'

const CH_COLORS = { 'E-Commerce':'#d31137','SUKSES JAYA':'#5b6b82','NAMI':'#f096a6','BLOOMIE':'#a8b3c4','K25':'#3d4a5c','OTHER CHANNEL':'#c9d1dc' }
const tt = { contentStyle:{background:'#1a1a1a',border:'none',borderRadius:8,color:'#fff',fontSize:12}, itemStyle:{color:'#fff'}, cursor:{fill:'rgba(255,255,255,0.06)'} }
const penColor = (p) => `rgba(21,128,61,${0.1+Math.min(100,p)/100*0.85})`

export default function ProductOpportunityPage() {
  const g = useGlobalFilters()
  const [prod, setProd] = useState(null)
  const [pair, setPair] = useState(null)
  const [pen, setPen] = useState(null)
  const [sku, setSku] = useState(null)
  const [disc, setDisc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [skuLoading, setSkuLoading] = useState(true)
  const [coreOnly, setCoreOnly] = useState(true)

  const years = g?.years?.join(',') || undefined
  const channels = g?.channels?.join(',') || undefined

  // Bagian ringan (tampil duluan)
  useEffect(() => {
    if (!g?.ready) return
    setLoading(true)
    Promise.all([
      getProduct({ years, channels, core_only: coreOnly }),
      getProductPairing({ years }),
      getProductPenetration({ channels, core_only: coreOnly }),
      getDiscount({ years, core_only: coreOnly }),
    ]).then(([p, pr, pe, dd]) => { setProd(p); setPair(pr); setPen(pe); setDisc(dd) }).catch(()=>{}).finally(()=>setLoading(false))
  }, [g?.ready, years, channels, coreOnly])

  // Bagian SKU (berat — dimuat terpisah agar tak memblokir page)
  useEffect(() => {
    if (!g?.ready) return
    setSkuLoading(true); setSku(null)
    getProductSku({ years, core_only: coreOnly }).then(setSku).catch(()=>setSku(null)).finally(()=>setSkuLoading(false))
  }, [g?.ready, years, coreOnly])

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

      {/* Baris 4 — Pareto SKU (ABC) + efek Volume vs Harga */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:12 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Pareto SKU (80/20)</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>{sku ? <><b>{sku.a_count}</b> SKU (kelas A) menyumbang 80% revenue dari {sku.n_sku} SKU.</> : '—'}</div>
          {skuLoading ? <Skeleton height={230}/> : !sku?.pareto?.length ? <div style={{color:'#888',fontSize:13}}>SKU sedang dimuat / belum tersedia (jalankan rebuild bila kosong).</div> : (
            <div style={{ maxHeight:260, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
                <thead><tr style={{ borderBottom:'2px solid #f0f0f0', position:'sticky', top:0, background:'#fff' }}>{['SKU','Kategori','Revenue','Qty','Cust','ABC'].map(h=><th key={h} style={{ padding:'5px 6px', textAlign:h==='SKU'||h==='Kategori'?'left':'right', color:'#888', fontSize:10.5, fontWeight:600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {sku.pareto.slice(0,60).map((s,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid #f5f5f5' }}>
                      <td style={{ padding:'4px 6px', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.item_desc}>{s.item_desc||s.item_no}</td>
                      <td style={{ padding:'4px 6px', fontSize:10.5, color:'#888' }}>{s.kategori}</td>
                      <td style={{ padding:'4px 6px', textAlign:'right' }}>{formatRupiahShort(s.revenue)}</td>
                      <td style={{ padding:'4px 6px', textAlign:'right' }}>{s.qty} {s.unit}</td>
                      <td style={{ padding:'4px 6px', textAlign:'right' }}>{s.customers}</td>
                      <td style={{ padding:'4px 6px', textAlign:'right', fontWeight:700, color:s.abc==='A'?'#15803d':s.abc==='B'?'#f59e0b':'#bbb' }}>{s.abc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Growth Movers SKU — Volume vs Harga</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Tumbuh karena laku lebih banyak (volume) atau harga berubah?</div>
          {skuLoading ? <Skeleton height={230}/> : !sku?.movers?.up?.length ? <div style={{color:'#888',fontSize:13}}>—</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={[...sku.movers.up.slice(0,5),...sku.movers.down.slice(0,5)].map(s=>({name:(s.item_desc||s.item_no).slice(0,14),Volume:s.vol_effect,Harga:s.price_effect}))} layout="vertical" margin={{left:6,right:20}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis type="number" tickFormatter={formatRupiahShort} tick={{fontSize:9,fill:'#888'}}/>
                <YAxis type="category" dataKey="name" width={92} tick={{fontSize:9,fill:'#666'}}/>
                <Tooltip {...tt} formatter={(v)=>formatRupiah(v)}/>
                <ReferenceLine x={0} stroke="#bbb"/>
                <Bar dataKey="Volume" stackId="a" fill="#5b6b82"/><Bar dataKey="Harga" stackId="a" fill="#f096a6"/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ===== SECTION: DISKON & HARGA (PROMPT 6) ===== */}
      <div id="diskon" style={{ borderTop:'3px solid #d31137', paddingTop:14, marginTop:6 }}>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:2 }}>Diskon & Harga</div>
        <div style={{ fontSize:11, color:'#888', marginBottom:10 }}>Tanpa margin/HPP (data biaya tidak tersedia) — hanya diskon dari harga_awal vs harga_jual.</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:12 }}>
          {loading||!disc ? [1,2,3,4].map(i=><SkeletonCard key={i} style={{height:80}}/>) : [
            {t:'REVENUE GROSS',v:formatRupiahShort(disc.kpi.revenue_gross)},
            {t:'REVENUE NET',v:formatRupiahShort(disc.kpi.revenue_net), sub: disc.kpi.net_growth!=null?`${disc.kpi.net_growth>0?'▲':'▼'} ${Math.abs(disc.kpi.net_growth)}% YoY`:''},
            {t:'TOTAL DISKON',v:formatRupiahShort(disc.kpi.disc_amount), accent:'#d31137'},
            {t:'DISKON RATA2 (TERTIMBANG)',v:`${disc.kpi.disc_pct}%`, accent:'#f97316'},
          ].map((c,i)=>(
            <div key={i} style={{ background:'#fff', borderRadius:10, padding:14, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #f0f0f0', borderTop:c.accent?`3px solid ${c.accent}`:'1px solid #f0f0f0' }}>
              <div style={{ fontSize:10, color:'#888', fontWeight:600 }}>{c.t}</div>
              <div style={{ fontSize:18, fontWeight:700, color:c.accent||'#1a1a1a' }}>{c.v}</div>
              <div style={{ fontSize:10, color:'#999' }}>{c.sub||' '}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Card style={{ padding:16 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Diskon Rata-rata % per Kategori</div>
            {loading ? <Skeleton height={220}/> : !disc?.by_cat?.length ? <div style={{color:'#888',fontSize:13}}>Tidak ada data</div> : (
              <ResponsiveContainer width="100%" height={Math.max(200,disc.by_cat.slice(0,12).length*24)}>
                <BarChart data={disc.by_cat.slice(0,12)} layout="vertical" margin={{left:6,right:30}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis type="number" tickFormatter={v=>v+'%'} tick={{fontSize:10,fill:'#888'}}/>
                  <YAxis type="category" dataKey="kategori" width={100} tick={{fontSize:10,fill:'#666'}}/>
                  <Tooltip {...tt} formatter={(v)=>`${v}%`}/>
                  <Bar dataKey="disc_pct" fill="#fc617e" radius={[0,3,3,0]}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card style={{ padding:16 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Diskon % vs Growth Revenue</div>
            <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Kanan-bawah: diskon tinggi tapi revenue tidak tumbuh.</div>
            {loading ? <Skeleton height={220}/> : !disc?.by_cat?.length ? <div style={{color:'#888',fontSize:13}}>Tidak ada data</div> : (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{top:6,right:16,bottom:20,left:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis type="number" dataKey="disc_pct" name="Diskon" unit="%" tick={{fontSize:10,fill:'#888'}} label={{value:'Diskon %',position:'insideBottom',offset:-10,fontSize:10,fill:'#aaa'}}/>
                  <YAxis type="number" dataKey="growth" name="Growth" unit="%" tick={{fontSize:10,fill:'#888'}} width={36}/>
                  <ZAxis type="number" dataKey="revenue" range={[80,800]}/>
                  <ReferenceLine y={0} stroke="#bbb" strokeDasharray="4 4"/>
                  <Tooltip content={({active,payload})=>{ if(!active||!payload?.length) return null; const d=payload[0].payload
                    return <div style={{background:'#1a1a1a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#fff'}}><div style={{fontWeight:700}}>{d.kategori}</div><div>Diskon {d.disc_pct}% · Growth {d.growth ?? '-'}%</div></div> }}/>
                  <Scatter data={disc.by_cat.filter(d=>d.growth!=null)}>{disc.by_cat.filter(d=>d.growth!=null).map((d,i)=><Cell key={i} fill={d.disc_pct>15&&d.growth<0?'#d31137':'#5b6b82'} fillOpacity={0.7}/>)}</Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
