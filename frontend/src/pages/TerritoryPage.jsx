import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell, ComposedChart, Line, Legend,
} from 'recharts'
import Card from '../components/Card'
import Skeleton, { SkeletonCard } from '../components/Skeleton'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import { useGlobalFilters } from '../context/GlobalFilters'
import { getTerritory, getTerritoryDetail, getTerritoryMeta } from '../utils/api'

const tt = { contentStyle:{background:'#1a1a1a',border:'none',borderRadius:8,color:'#fff',fontSize:12}, itemStyle:{color:'#fff'}, cursor:{fill:'rgba(255,255,255,0.06)'} }
const RED = '#d31137'

// kandidat lokasi GeoJSON 38 provinsi (taruh salah satu file ini di frontend/public/)
const GEO_CANDIDATES = [
  '/geojson/indonesia-provinsi-38.geojson',
  '/geojson/indonesia-provinsi-38.json',
  '/geojson/indonesia-provinces.json',
]
const GEO_NAME_KEYS = ['province_name','Propinsi','PROVINSI','provinsi','NAME_1','state','name','Provinsi','WADMPR']

const METRICS = [
  { k:'revenue',          label:'Revenue',              fmt:(v)=>formatRupiahShort(v), diverging:false },
  { k:'growth_yoy',       label:'Growth YoY %',          fmt:(v)=>v==null?'—':`${v>0?'+':''}${v}%`, diverging:true },
  { k:'customer_aktif',   label:'Customer aktif',        fmt:(v)=>v, diverging:false },
  { k:'rev_per_cust',     label:'Revenue / customer',    fmt:(v)=>formatRupiahShort(v), diverging:false },
  { k:'tingkat_aktivasi', label:'Tingkat aktivasi %',    fmt:(v)=>`${v}%`, diverging:false },
  { k:'overdue_rate',     label:'Overdue rate %',        fmt:(v)=>`${v}%`, diverging:true },
]

const csvExport = (rows, cols, name) => {
  const head = cols.map(c=>c.label).join(',')
  const body = rows.map(r=>cols.map(c=>{ const v=c.get(r); return typeof v==='string'&&v.includes(',')?`"${v}"`:v }).join(',')).join('\n')
  const blob = new Blob([head+'\n'+body], { type:'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
}

/* ---------- Choropleth SVG mandiri (mercator, tanpa library) ---------- */
function Choropleth({ geo, provinces, metric, selected, onPick, diverging }) {
  const W = 900, H = 380
  const byName = useMemo(() => {
    const m = {}
    provinces.forEach(p => { m[p.province_name.toUpperCase()] = p })
    return m
  }, [provinces])

  const { paths, ok } = useMemo(() => {
    if (!geo?.features?.length) return { paths: [], ok: false }
    const merc = (lon, lat) => [lon * Math.PI/180, Math.log(Math.tan(Math.PI/4 + (lat*Math.PI/180)/2))]
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
    const rings = []
    const push = (coords, name) => {
      const poly = coords.map(([lon,lat]) => { const [x,y]=merc(lon,lat); if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y; return [x,y] })
      rings.push({ poly, name })
    }
    for (const f of geo.features) {
      let nm = ''
      for (const k of GEO_NAME_KEYS) { if (f.properties && f.properties[k]) { nm = String(f.properties[k]).toUpperCase(); break } }
      const g = f.geometry; if (!g) continue
      if (g.type === 'Polygon') g.coordinates.forEach(r => push(r, nm))
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(mp => mp.forEach(r => push(r, nm)))
    }
    const sx = W/(maxX-minX||1), sy = H/(maxY-minY||1), s = Math.min(sx,sy)*0.96
    const ox = (W-(maxX-minX)*s)/2, oy = (H-(maxY-minY)*s)/2
    const paths = rings.map(r => ({
      name: r.name,
      d: 'M' + r.poly.map(([x,y]) => `${(ox+(x-minX)*s).toFixed(1)},${(oy+(maxY-y)*s).toFixed(1)}`).join('L') + 'Z',
    }))
    return { paths, ok: true }
  }, [geo])

  const vals = provinces.map(p => p[metric]).filter(v => v!=null && !isNaN(v))
  const max = Math.max(1, ...vals.map(Math.abs))
  const color = (p) => {
    const v = p?.[metric]
    if (v==null || isNaN(v) || (p.revenue===0 && metric!=='tingkat_aktivasi')) return '#e9e9ec'
    if (diverging) {
      const t = Math.max(-1, Math.min(1, v/max))
      return t>=0 ? `rgba(21,128,61,${0.15+t*0.8})` : `rgba(211,17,55,${0.15+(-t)*0.8})`
    }
    return `rgba(211,17,55,${0.12+Math.min(1, v/max)*0.85})`
  }
  if (!ok) return null
  const alias = (n) => n.replace('DAERAH ISTIMEWA ','DI ').replace('DKI ','DKI ').replace('KEP. ','KEPULAUAN ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto' }}>
      {paths.map((pt,i) => {
        const prov = byName[pt.name] || byName[alias(pt.name)]
        const sel = prov && selected.includes(prov.province_code)
        return (
          <path key={i} d={pt.d} fill={color(prov)}
            stroke={sel?'#1a1a1a':'#fff'} strokeWidth={sel?1.6:0.5}
            style={{ cursor: prov?'pointer':'default', transition:'fill .2s' }}
            onClick={() => prov && onPick(prov.province_code)}>
            <title>{prov ? `${prov.province_name}` : pt.name}</title>
          </path>
        )
      })}
    </svg>
  )
}

export default function TerritoryPage() {
  const g = useGlobalFilters()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [geo, setGeo] = useState(null)
  const [metric, setMetric] = useState('revenue')
  const [level, setLevel] = useState('province')  // province | region
  const [selected, setSelected] = useState([])     // province_code[]
  const [showNonTrade, setShowNonTrade] = useState(false)
  const [detail, setDetail] = useState(null)
  const [dormOnly, setDormOnly] = useState(false)
  const [meta, setMeta] = useState(null)

  const years = g?.years?.join(',') || undefined
  const months = g?.months?.join(',') || undefined

  useEffect(() => {
    if (!g?.ready) return
    setLoading(true)
    getTerritory({ years, months }).then(setData).catch(()=>setData(null)).finally(()=>setLoading(false))
  }, [g?.ready, years, months])

  useEffect(() => { getTerritoryMeta().then(setMeta).catch(()=>{}) }, [])

  const masterAge = useMemo(() => {
    if (!meta?.master_updated_at) return null
    const d = new Date(meta.master_updated_at)
    const days = Math.floor((Date.now() - d.getTime()) / 86400000)
    return { text: d.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }), days }
  }, [meta])

  useEffect(() => {
    let done = false
    ;(async () => {
      for (const url of GEO_CANDIDATES) {
        try { const r = await fetch(url); if (r.ok) { const j = await r.json(); if (!done) { setGeo(j); return } } } catch {}
      }
    })()
    return () => { done = true }
  }, [])

  // drill
  const picked = selected.length === 1 ? selected[0] : null
  useEffect(() => {
    if (!picked) { setDetail(null); return }
    setDetail({ loading:true })
    getTerritoryDetail(picked, { years }).then(setDetail).catch(()=>setDetail(null))
  }, [picked, years])

  if (!g) return null
  const metricDef = METRICS.find(m => m.k === metric)
  const provinces = data?.provinces || []
  const shown = selected.length ? provinces.filter(p => selected.includes(p.province_code)) : provinces
  const togglePick = (code) => setSelected(s => s.includes(code) ? s.filter(x=>x!==code) : [...s, code])
  const cov = data?.coverage
  const kpi = data?.kpi

  const rankRows = [...(selected.length?shown:provinces)]
    .filter(p => level==='province')
    .sort((a,b) => (Math.abs(b[metric]||0))-(Math.abs(a[metric]||0))).slice(0,15)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <h1 style={{ fontSize:20, fontWeight:700 }}>Territory</h1>
        <span style={{ fontSize:12, color:'#888' }}>Di mana bisnis tumbuh, jenuh, dan di mana pasar sudah terdaftar tapi belum diaktifkan.</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <select value={metric} onChange={e=>setMetric(e.target.value)} style={selStyle}>
            {METRICS.map(m => <option key={m.k} value={m.k}>{m.label}</option>)}
          </select>
          <div style={{ display:'flex', border:'1px solid #e8e8e8', borderRadius:8, overflow:'hidden' }}>
            {['province','region'].map(lv => (
              <button key={lv} onClick={()=>setLevel(lv)} style={{
                padding:'6px 12px', fontSize:12, border:'none', cursor:'pointer',
                background: level===lv?RED:'#fff', color: level===lv?'#fff':'#666' }}>
                {lv==='province'?'Provinsi':'Region Pulau'}
              </button>
            ))}
          </div>
          <label style={{ fontSize:12, color:'#666', display:'flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={showNonTrade} onChange={e=>setShowNonTrade(e.target.checked)} />
            Tampilkan Non-Trade
          </label>
        </div>
      </div>

      {/* Baris 0 — banner cakupan */}
      {loading || !cov ? <Skeleton height={40}/> : (
        <div style={{ background:'#fff5f7', border:'1px solid #fde3e9', borderRadius:10, padding:'10px 14px',
          fontSize:12.5, color:'#7a1226', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span>Peta ini mencakup <b>{cov.pct}%</b> revenue periode terpilih ({formatRupiahShort(cov.territory_rev)}).
            Sisanya <b>{(100-cov.pct).toFixed(1)}%</b> ({formatRupiahShort(cov.nontrade_rev)}) dari Toko Sendiri, Marketplace, dan Event yang tidak terikat wilayah.</span>
          <button onClick={()=>setShowNonTrade(v=>!v)} style={linkBtn}>lihat rincian</button>
        </div>
      )}
      {showNonTrade && data?.coverage_details && (
        <Card style={{ padding:14 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Rincian Non-Trade (kontribusi lifetime)</div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {data.coverage_details.map(d => (
              <div key={d.type} style={{ fontSize:12 }}>
                <div style={{ color:'#888' }}>{d.type} · {d.n} akun</div>
                <div style={{ fontWeight:700 }}>{formatRupiahShort(d.revenue)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Baris 1 — KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {loading || !kpi ? [1,2,3,4,5].map(i=><SkeletonCard key={i} style={{height:84}}/>) : [
          { t:'Provinsi aktif', v:`${kpi.prov_aktif} dari ${kpi.prov_total}`, s:'punya ≥1 transaksi' },
          { t:'Provinsi terbesar', v:kpi.terbesar?.name||'—', s:`${kpi.terbesar?.share||0}% share` },
          { t:'Growth tertinggi', v:kpi.growth_top?.name||'—', s:kpi.growth_top?`+${kpi.growth_top.pct}% YoY`:'—' },
          { t:'Aktivasi nasional', v:`${kpi.aktivasi.pct}%`, s:`${kpi.aktivasi.aktif} aktif / ${kpi.aktivasi.terdaftar} terdaftar` },
          { t:'Revenue / customer aktif', v:formatRupiahShort(kpi.rev_per_aktif), s:`median ${formatRupiahShort(kpi.rev_per_aktif_median)}` },
        ].map((c,i) => (
          <Card key={i} style={{ padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'#888' }}>{c.t}</div>
            <div style={{ fontSize:17, fontWeight:700, margin:'3px 0', lineHeight:1.15 }}>{c.v}</div>
            <div style={{ fontSize:10.5, color:'#aaa' }}>{c.s}</div>
          </Card>
        ))}
      </div>

      {/* Baris 2+3 — peta + ranking */}
      <div style={{ display:'grid', gridTemplateColumns:'1.55fr 1fr', gap:12 }}>
        <Card style={{ padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontSize:13, fontWeight:600 }}>Peta {metricDef.label}</div>
            {selected.length>0 && <button onClick={()=>setSelected([])} style={linkBtn}>Nasional › {selected.length===1?provinces.find(p=>p.province_code===selected[0])?.province_name:`${selected.length} provinsi`} ✕</button>}
          </div>
          {loading ? <Skeleton height={360}/> : geo ? (
            <Choropleth geo={geo} provinces={provinces} metric={metric} selected={selected}
              onPick={togglePick} diverging={metricDef.diverging} />
          ) : (
            <div style={{ height:360, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              color:'#888', fontSize:12.5, textAlign:'center', gap:8, background:'#fafafa', borderRadius:10 }}>
              <div style={{ fontWeight:600, color:'#555' }}>Peta belum aktif</div>
              <div style={{ maxWidth:360 }}>Taruh file GeoJSON 38 provinsi di <code>frontend/public/geojson/indonesia-provinsi-38.geojson</code>. Sementara itu, gunakan ranking di kanan — angka presisi tetap tersedia.</div>
            </div>
          )}
          <div style={{ fontSize:10.5, color:'#aaa', marginTop:6 }}>Klik provinsi untuk memfilter seluruh panel di bawah. {metricDef.diverging?'Skala merah–hijau (negatif–positif).':'Skala merah (rendah→tinggi).'} Abu-abu = belum ada customer.</div>
        </Card>

        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>Ranking provinsi — {metricDef.label}</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Top 15. Angka presisi; peta untuk pola.</div>
          {loading ? <Skeleton height={340}/> : (
            <div style={{ maxHeight:360, overflowY:'auto' }}>
              {rankRows.map(p => {
                const maxv = Math.max(...rankRows.map(x=>Math.abs(x[metric]||0)),1)
                const w = Math.abs(p[metric]||0)/maxv*100
                const sel = selected.includes(p.province_code)
                return (
                  <div key={p.province_code} onClick={()=>togglePick(p.province_code)}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', cursor:'pointer', opacity: sel||!selected.length?1:0.5 }}>
                    <div style={{ width:110, fontSize:11.5, fontWeight: sel?700:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.province_name}</div>
                    <div style={{ flex:1, background:'#f4f4f5', borderRadius:4, height:14, position:'relative' }}>
                      <div style={{ width:`${w}%`, height:'100%', background: (p[metric]<0)?RED:'#e0426a', borderRadius:4 }}/>
                    </div>
                    <div style={{ width:70, textAlign:'right', fontSize:11 }}>{metricDef.fmt(p[metric])}</div>
                    <div style={{ width:48, textAlign:'right', fontSize:10, color: (p.growth_yoy||0)>=0?'#15803d':RED }}>{p.growth_yoy==null?'—':`${p.growth_yoy>0?'+':''}${p.growth_yoy}%`}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Baris 4 — Matriks aktivasi */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600 }}>Matriks Aktivasi</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Customer terdaftar yang tidak bertransaksi tahun ini = pasar yang sudah dibayar biaya akuisisinya tapi belum menghasilkan. Ukuran bubble = revenue.</div>
        {loading ? <Skeleton height={280}/> : <ActivationScatter provinces={provinces} onPick={togglePick} selected={selected} />}
      </Card>

      {/* Baris 5 — Growth diverging */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Growth per wilayah (YoY)</div>
        {loading ? <Skeleton height={260}/> : (
          <ResponsiveContainer width="100%" height={Math.max(240, provinces.filter(p=>p.growth_yoy!=null).length*16)}>
            <BarChart layout="vertical" data={provinces.filter(p=>p.growth_yoy!=null).sort((a,b)=>b.growth_yoy-a.growth_yoy)} margin={{left:80,right:60}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis type="number" tick={{fontSize:10,fill:'#888'}} tickFormatter={v=>`${v}%`}/>
              <YAxis type="category" dataKey="province_name" tick={{fontSize:9.5,fill:'#666'}} width={78}/>
              <ReferenceLine x={0} stroke="#999"/>
              <Tooltip {...tt} formatter={(v,n,p)=>[`${v}% · ${formatRupiahShort(p.payload.revenue)}`,'Growth · Revenue']}/>
              <Bar dataKey="growth_yoy" radius={[0,3,3,0]}>
                {provinces.filter(p=>p.growth_yoy!=null).sort((a,b)=>b.growth_yoy-a.growth_yoy).map((p,i)=><Cell key={i} fill={p.growth_yoy>=0?'#15803d':RED}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Baris 6 — Kedalaman vs Sebaran */}
      <Card style={{ padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600 }}>Kedalaman vs Sebaran</div>
        <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>X = jumlah customer aktif · Y = revenue per customer · ukuran = revenue total.</div>
        {loading ? <Skeleton height={280}/> : <DepthScatter provinces={provinces} onPick={togglePick} selected={selected} />}
      </Card>

      {/* Baris 7 — coverage salesperson & penetrasi kategori */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600 }}>Coverage Salesperson per Wilayah</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>Merah pada kolom "% 1 orang" = ketergantungan tunggal &gt;70%. Leaderboard & target ada di Sales Performance.</div>
          {loading ? <Skeleton height={280}/> : <Heatmap kind="rp"
            cols={data.coverage_salesperson.salespeople} rows={shown}
            get={(p,c)=>data.coverage_salesperson.data[p.province_code]?.[c]||0}
            extra={(p)=>data.coverage_salesperson.single_dep[p.province_code]} extraLabel="% 1 orang" />}
        </Card>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600 }}>Penetrasi Kategori per Wilayah</div>
          <div style={{ fontSize:10.5, color:'#aaa', marginBottom:8 }}>% customer aktif di provinsi yang membeli kategori. Sel merah pada provinsi besar = white space geografis.</div>
          {loading ? <Skeleton height={280}/> : <Heatmap kind="pct"
            cols={data.penetration.kategori} rows={shown}
            get={(p,c)=>data.penetration.data[p.province_code]?.[c]||0} />}
        </Card>
      </div>

      {/* Baris 8 — Tabel wilayah */}
      <Card style={{ padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:13, fontWeight:600 }}>Tabel Wilayah</div>
          <button style={linkBtn} onClick={()=>csvExport(provinces, [
            {label:'Provinsi',get:r=>r.province_name},{label:'Region',get:r=>r.region_pulau},
            {label:'Terdaftar',get:r=>r.customer_terdaftar},{label:'Aktif',get:r=>r.customer_aktif},
            {label:'Tidur',get:r=>r.customer_tidur},{label:'Aktivasi%',get:r=>r.tingkat_aktivasi},
            {label:'Revenue',get:r=>r.revenue},{label:'Share%',get:r=>r.share},{label:'GrowthYoY%',get:r=>r.growth_yoy},
            {label:'Bills',get:r=>r.bills},{label:'AOV',get:r=>r.aov},{label:'Rev/cust',get:r=>r.rev_per_cust},
            {label:'Overdue%',get:r=>r.overdue_rate},{label:'TopKategori',get:r=>(r.top_kategori||[]).join(' | ')},
          ], 'territory.csv')}>Export CSV</button>
        </div>
        {loading ? <Skeleton height={300}/> : (
          <div style={{ overflowX:'auto', maxHeight:420, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
              <thead><tr style={{ position:'sticky', top:0, background:'#fff', borderBottom:'2px solid #f0f0f0' }}>
                {['Provinsi','Pulau','Terdaftar','Aktif','Tidur','Aktivasi','Revenue','Share','YoY','Bills','AOV','Rev/cust','Overdue','Top kategori'].map(h=>
                  <th key={h} style={{ padding:'6px', textAlign: ['Provinsi','Pulau','Top kategori'].includes(h)?'left':'right', color:'#888', fontSize:10.5 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {provinces.map(p => (
                  <tr key={p.province_code} onClick={()=>togglePick(p.province_code)}
                    style={{ borderBottom:'1px solid #f6f6f6', cursor:'pointer', background: selected.includes(p.province_code)?'#fff5f7':'transparent' }}>
                    <td style={{ padding:'5px 6px', fontWeight:500 }}>{p.province_name}</td>
                    <td style={{ padding:'5px 6px', color:'#888' }}>{p.region_pulau}</td>
                    <td style={tdR}>{p.customer_terdaftar}</td><td style={tdR}>{p.customer_aktif}</td>
                    <td style={{...tdR, color: p.customer_tidur>0?'#b45309':'#888'}}>{p.customer_tidur}</td>
                    <td style={tdR}>{p.tingkat_aktivasi}%</td>
                    <td style={tdR}>{formatRupiahShort(p.revenue)}</td><td style={tdR}>{p.share}%</td>
                    <td style={{...tdR, color:(p.growth_yoy||0)>=0?'#15803d':RED}}>{p.growth_yoy==null?'—':`${p.growth_yoy}%`}</td>
                    <td style={tdR}>{p.bills}</td><td style={tdR}>{formatRupiahShort(p.aov)}</td>
                    <td style={tdR}>{formatRupiahShort(p.rev_per_cust)}</td>
                    <td style={tdR}>{p.overdue_rate}%</td>
                    <td style={{ padding:'5px 6px', color:'#888', fontSize:10.5 }}>{(p.top_kategori||[]).slice(0,3).join(', ')}</td>
                  </tr>
                ))}
                {cov && (
                  <tr style={{ background:'#f4f4f5', fontStyle:'italic', color:'#666' }}>
                    <td style={{ padding:'6px' }} colSpan={6}>Non-Trade (Toko Sendiri / Marketplace / Event)</td>
                    <td style={tdR}>{formatRupiahShort(cov.nontrade_rev)}</td><td colSpan={7}/>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Baris 9 — Drill provinsi */}
      {picked && detail && (
        <Card style={{ padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:14, fontWeight:700 }}>{provinces.find(p=>p.province_code===picked)?.province_name}</div>
            <button style={linkBtn} onClick={()=>setSelected([])}>tutup</button>
          </div>
          {detail.loading ? <Skeleton height={220}/> : (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Tren revenue bulanan vs {detail.trend?.prev_year}</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={(detail.trend?.labels||[]).map((l,i)=>({label:l,ini:detail.trend.current[i],lalu:detail.trend.prev[i]}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="label" tick={{fontSize:9,fill:'#888'}}/>
                      <YAxis tick={{fontSize:9,fill:'#888'}} tickFormatter={formatRupiahShort} width={46}/>
                      <Tooltip {...tt} formatter={v=>formatRupiah(v)}/><Legend wrapperStyle={{fontSize:11}}/>
                      <Bar dataKey="lalu" name={detail.trend?.prev_year} fill="#e0e0e0"/>
                      <Line type="monotone" dataKey="ini" name={detail.trend?.year} stroke={RED} strokeWidth={2} dot={false}/>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Akuisisi customer baru per bulan</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={(detail.acquisition?.labels||[]).map((l,i)=>({label:l,baru:detail.acquisition.data[i]}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="label" tick={{fontSize:9,fill:'#888'}}/><YAxis tick={{fontSize:9,fill:'#888'}} width={28}/>
                      <Tooltip {...tt}/><Bar dataKey="baru" fill="#fc617e" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>Customer di provinsi ini ({detail.customers?.length||0})</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <label style={{ fontSize:11, color:'#666', display:'flex', gap:4, alignItems:'center' }}>
                      <input type="checkbox" checked={dormOnly} onChange={e=>setDormOnly(e.target.checked)} /> hanya yang tidur
                    </label>
                    <button style={linkBtn} onClick={()=>csvExport((detail.customers||[]).filter(c=>!dormOnly||c.tidur), [
                      {label:'Kode',get:r=>r.customer_code},{label:'Nama',get:r=>r.customer_name},{label:'Tier',get:r=>r.tier},
                      {label:'Segmen',get:r=>r.segmen_rfm},{label:'Salesperson',get:r=>r.salesperson},{label:'Status',get:r=>r.status},
                      {label:'HariSejakBeli',get:r=>r.days_since_last_order},{label:'Revenue',get:r=>r.revenue},
                    ], `customer_${picked}.csv`)}>Export CSV</button>
                  </div>
                </div>
                <div style={{ maxHeight:260, overflowY:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead><tr style={{ position:'sticky', top:0, background:'#fff', borderBottom:'2px solid #f0f0f0' }}>
                      {['Nama','Tier','Segmen','Salesperson','Terakhir beli','Status','Revenue'].map(h=>
                        <th key={h} style={{ padding:'5px', textAlign:h==='Revenue'?'right':'left', color:'#888', fontSize:10 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(detail.customers||[]).filter(c=>!dormOnly||c.tidur).slice(0,300).map(c => (
                        <tr key={c.customer_code} style={{ borderBottom:'1px solid #f6f6f6', background: c.tidur?'#fffdf5':'transparent' }}>
                          <td style={{ padding:'4px 5px' }}>{c.customer_name||c.customer_code}</td>
                          <td style={{ padding:'4px 5px', color:'#888' }}>{c.tier}</td>
                          <td style={{ padding:'4px 5px', color:'#888' }}>{c.segmen_rfm}</td>
                          <td style={{ padding:'4px 5px', color:'#888' }}>{c.salesperson}</td>
                          <td style={{ padding:'4px 5px', color:'#888' }}>{c.days_since_last_order==null?'—':`${c.days_since_last_order} hari lalu`}</td>
                          <td style={{ padding:'4px 5px' }}>{c.tidur?'😴 tidur':c.status}</td>
                          <td style={{ padding:'4px 5px', textAlign:'right' }}>{formatRupiahShort(c.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Footer — umur data master */}
      {masterAge && (
        <div style={{ fontSize:11, textAlign:'right', marginTop:2,
          color: masterAge.days>90?'#b45309':'#aaa',
          fontWeight: masterAge.days>90?600:400 }}>
          {masterAge.days>90 ? '⚠ ' : ''}Data wilayah per {masterAge.text}
          {masterAge.days>90 ? ` — sudah ${masterAge.days} hari, sebaiknya di-refresh (build_territory.py).` : ''}
        </div>
      )}
    </div>
  )
}

/* ---------- panel bantu ---------- */
function ActivationScatter({ provinces, onPick, selected }) {
  const pts = provinces.filter(p=>p.customer_terdaftar>0).map(p=>({...p, x:p.customer_terdaftar, y:p.tingkat_aktivasi, z:p.revenue}))
  const avgX = pts.reduce((s,p)=>s+p.x,0)/(pts.length||1)
  const avgY = pts.reduce((s,p)=>s+p.y,0)/(pts.length||1)
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{left:10,right:20,top:10,bottom:10}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
        <XAxis type="number" dataKey="x" name="Terdaftar" tick={{fontSize:10,fill:'#888'}} label={{value:'customer terdaftar',position:'insideBottom',offset:-4,fontSize:10,fill:'#aaa'}}/>
        <YAxis type="number" dataKey="y" name="Aktivasi%" tick={{fontSize:10,fill:'#888'}} tickFormatter={v=>`${v}%`}/>
        <ZAxis type="number" dataKey="z" range={[40,600]}/>
        <ReferenceLine x={avgX} stroke="#bbb" strokeDasharray="4 4"/>
        <ReferenceLine y={avgY} stroke="#bbb" strokeDasharray="4 4"/>
        <Tooltip {...tt} formatter={(v,n)=>n==='Aktivasi%'?`${v}%`:v} labelFormatter={()=>''}
          content={({payload})=>payload?.[0]?(()=>{const p=payload[0].payload;return(
            <div style={{background:'#1a1a1a',color:'#fff',padding:'6px 9px',borderRadius:8,fontSize:11}}>
              <b>{p.province_name}</b><br/>Terdaftar {p.x} · Aktif {p.customer_aktif}<br/>Aktivasi {p.y}% · {formatRupiahShort(p.revenue)}
            </div>)})():null}/>
        <Scatter data={pts} onClick={(e)=>e&&onPick(e.province_code)}>
          {pts.map((p,i)=><Cell key={i} fill={p.y<avgY&&p.x>avgX?RED:'#e0426a'} fillOpacity={!selected.length||selected.includes(p.province_code)?0.8:0.25} stroke={selected.includes(p.province_code)?'#1a1a1a':'none'}/>)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function DepthScatter({ provinces, onPick, selected }) {
  const pts = provinces.filter(p=>p.customer_aktif>0).map(p=>({...p, x:p.customer_aktif, y:p.rev_per_cust, z:p.revenue}))
  const avgX = pts.reduce((s,p)=>s+p.x,0)/(pts.length||1)
  const avgY = pts.reduce((s,p)=>s+p.y,0)/(pts.length||1)
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{left:20,right:20,top:10,bottom:10}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
        <XAxis type="number" dataKey="x" name="Aktif" tick={{fontSize:10,fill:'#888'}} label={{value:'customer aktif',position:'insideBottom',offset:-4,fontSize:10,fill:'#aaa'}}/>
        <YAxis type="number" dataKey="y" name="Rev/cust" tick={{fontSize:10,fill:'#888'}} tickFormatter={formatRupiahShort} width={54}/>
        <ZAxis type="number" dataKey="z" range={[40,600]}/>
        <ReferenceLine x={avgX} stroke="#bbb" strokeDasharray="4 4"/>
        <ReferenceLine y={avgY} stroke="#bbb" strokeDasharray="4 4"/>
        <Tooltip {...tt} content={({payload})=>payload?.[0]?(()=>{const p=payload[0].payload;return(
          <div style={{background:'#1a1a1a',color:'#fff',padding:'6px 9px',borderRadius:8,fontSize:11}}>
            <b>{p.province_name}</b><br/>Aktif {p.x} · {formatRupiahShort(p.rev_per_cust)}/cust<br/>Total {formatRupiahShort(p.revenue)}
          </div>)})():null}/>
        <Scatter data={pts} onClick={(e)=>e&&onPick(e.province_code)}>
          {pts.map((p,i)=><Cell key={i} fill="#e0426a" fillOpacity={!selected.length||selected.includes(p.province_code)?0.8:0.25} stroke={selected.includes(p.province_code)?'#1a1a1a':'none'}/>)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function Heatmap({ cols, rows, get, kind, extra, extraLabel }) {
  const top = rows.slice(0, 18)
  const maxByCol = {}
  cols.forEach(c => { maxByCol[c] = Math.max(1, ...top.map(r=>get(r,c))) })
  const cell = (v, c) => {
    if (kind==='pct') return `rgba(21,128,61,${0.08+Math.min(100,v)/100*0.85})`
    return `rgba(211,17,55,${0.06+Math.min(1, v/maxByCol[c])*0.8})`
  }
  if (!top.length) return <div style={{color:'#888',fontSize:12}}>Tidak ada data untuk filter ini</div>
  return (
    <div style={{ overflowX:'auto', maxHeight:300, overflowY:'auto' }}>
      <table style={{ borderCollapse:'collapse', fontSize:10 }}>
        <thead><tr>
          <th style={{ position:'sticky', left:0, background:'#fff', textAlign:'left', padding:'4px 6px', color:'#888' }}>Provinsi</th>
          {cols.map(c=><th key={c} style={{ padding:'4px 5px', color:'#888', writingMode:'vertical-rl', transform:'rotate(180deg)', maxHeight:70, fontWeight:500 }}>{c}</th>)}
          {extra && <th style={{ padding:'4px 6px', color:'#888' }}>{extraLabel}</th>}
        </tr></thead>
        <tbody>
          {top.map(r => (
            <tr key={r.province_code}>
              <td style={{ position:'sticky', left:0, background:'#fff', padding:'3px 6px', whiteSpace:'nowrap', fontWeight:500 }}>{r.province_name}</td>
              {cols.map(c => { const v=get(r,c); return <td key={c} title={`${c}: ${kind==='pct'?v+'%':formatRupiahShort(v)}`} style={{ padding:'3px 5px', textAlign:'center', background:cell(v,c), color: v>(kind==='pct'?55:maxByCol[c]*0.6)?'#fff':'#333' }}>{v?(kind==='pct'?v:Math.round(v/1e6)):''}</td> })}
              {extra && (()=>{const d=extra(r);return <td style={{ padding:'3px 6px', textAlign:'right', fontWeight:700, color: d>70?RED:'#666' }}>{d}%</td>})()}
            </tr>
          ))}
        </tbody>
      </table>
      {kind!=='pct' && <div style={{ fontSize:9.5, color:'#aaa', marginTop:4 }}>angka sel dalam juta Rupiah</div>}
    </div>
  )
}

const selStyle = { padding:'6px 10px', fontSize:12, border:'1px solid #e8e8e8', borderRadius:8, background:'#fff', color:'#333' }
const linkBtn = { background:'none', border:'none', color:RED, fontSize:11.5, cursor:'pointer', fontWeight:600, padding:0 }
const tdR = { padding:'5px 6px', textAlign:'right' }
