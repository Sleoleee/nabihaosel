import { useState, useEffect, useMemo } from 'react'
import Card from '../components/Card'
import Skeleton from '../components/Skeleton'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import { getSettingsYears, getTargets, saveTargets } from '../utils/api'

const RED = '#d31137'

export default function SettingsTargetsPage() {
  const [years, setYears] = useState([])
  const [year, setYear] = useState(null)
  const [people, setPeople] = useState([])
  const [tgt, setTgt] = useState({})        // slp_name -> number
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')
  const [onlyTarget, setOnlyTarget] = useState(true)
  const [copyYear, setCopyYear] = useState('')

  useEffect(() => { getSettingsYears().then(d => {
    setYears(d.years||[]); setYear((d.years||[]).slice(-1)[0] || null)
  }).catch(()=>{}) }, [])

  const load = (y) => {
    if (!y) return
    setLoading(true); setSaved(false)
    getTargets(y).then(d => {
      setPeople(d.salespeople||[])
      setTgt(Object.fromEntries((d.salespeople||[]).map(p => [p.slp_name, p.target||0])))
    }).catch(()=>{}).finally(()=>setLoading(false))
  }
  useEffect(() => { load(year) }, [year])

  const setVal = (slp, v) => { setTgt(t => ({ ...t, [slp]: v })); setSaved(false) }

  const copyFrom = () => {
    if (!copyYear) return
    getTargets(copyYear).then(d => {
      const map = Object.fromEntries((d.salespeople||[]).map(p => [p.slp_name, p.target||0]))
      setTgt(t => { const n = { ...t }; Object.keys(n).forEach(k => { if (map[k]!=null) n[k] = map[k] }); return n })
      setSaved(false)
    }).catch(()=>{})
  }

  const save = () => {
    setSaving(true)
    const clean = Object.fromEntries(Object.entries(tgt).map(([k,v]) => [k, Number(v)||0]))
    saveTargets({ year, targets: clean }).then(() => setSaved(true))
      .catch(()=>{}).finally(()=>setSaving(false))
  }

  const rows = useMemo(() => people
    .filter(p => (p.display||p.slp_name||'').toLowerCase().includes(search.toLowerCase()))
    .filter(p => !onlyTarget || (Number(tgt[p.slp_name])||0) > 0)
  , [people, search, onlyTarget, tgt])

  const totalTarget = useMemo(() => people.reduce((s,p)=>s+(Number(tgt[p.slp_name])||0),0), [people, tgt])
  const totalRev = useMemo(() => people.reduce((s,p)=>s+(p.revenue||0),0), [people])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <h1 style={{ fontSize:20, fontWeight:700 }}>Setting · Target Penjualan</h1>
        <span style={{ fontSize:12, color:'#888' }}>Atur target tiap salesperson untuk tahun terpilih. Langsung dipakai di Sales Performance & Overview.</span>
      </div>

      <Card style={{ padding:14, display:'flex', gap:14, alignItems:'center', flexWrap:'wrap' }}>
        <label style={{ fontSize:12.5, fontWeight:600 }}>Tahun</label>
        <select value={year||''} onChange={e=>setYear(Number(e.target.value))} style={sel}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ width:1, height:22, background:'#eee' }}/>
        <span style={{ fontSize:12, color:'#888' }}>Salin target dari tahun</span>
        <select value={copyYear} onChange={e=>setCopyYear(e.target.value)} style={sel}>
          <option value="">—</option>
          {years.filter(y=>y!==year).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={copyFrom} disabled={!copyYear} style={btnGhost}>Salin</button>
        <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center' }}>
          {saved && <span style={{ color:'#15803d', fontSize:12.5, fontWeight:600 }}>✓ Tersimpan</span>}
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving?'Menyimpan…':'Simpan'}</button>
        </div>
      </Card>

      <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
        <Kpi label="Total target" value={formatRupiahShort(totalTarget)} />
        <Kpi label="Total revenue (thn ini)" value={formatRupiahShort(totalRev)} />
        <Kpi label="Pencapaian" value={totalTarget?`${(totalRev/totalTarget*100).toFixed(1)}%`:'—'} />
      </div>

      <Card style={{ padding:16 }}>
        <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari salesperson…" style={{ ...sel, width:260 }}/>
          <label style={{ fontSize:12, color:'#666', display:'flex', gap:6, alignItems:'center' }}>
            <input type="checkbox" checked={onlyTarget} onChange={e=>setOnlyTarget(e.target.checked)} /> hanya yang punya target
          </label>
        </div>
        {loading ? <Skeleton height={360}/> : (
          <div style={{ maxHeight:520, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead><tr style={{ position:'sticky', top:0, background:'#fff', borderBottom:'2px solid #f0f0f0' }}>
                {['Salesperson','Grup','Revenue','Target','Capai'].map(h=>
                  <th key={h} style={{ padding:'7px', textAlign:['Salesperson','Grup'].includes(h)?'left':'right', color:'#888', fontSize:11 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(p => {
                  const t = Number(tgt[p.slp_name])||0
                  const pct = t ? (p.revenue/t*100) : null
                  return (
                    <tr key={p.slp_name} style={{ borderBottom:'1px solid #f6f6f6' }}>
                      <td style={{ padding:'6px 7px' }}>
                        <div style={{ fontWeight:500 }}>{p.display||p.slp_name}</div>
                        {p.display!==p.slp_name && <div style={{ fontSize:10, color:'#aaa' }}>{p.slp_name}</div>}
                      </td>
                      <td style={{ padding:'6px 7px', color:'#888' }}>{p.grup}</td>
                      <td style={{ padding:'6px 7px', textAlign:'right', color:'#666' }}>{formatRupiahShort(p.revenue)}</td>
                      <td style={{ padding:'6px 7px', textAlign:'right' }}>
                        <input type="number" value={tgt[p.slp_name]??0} onChange={e=>setVal(p.slp_name, e.target.value)}
                          style={{ width:150, textAlign:'right', padding:'5px 8px', border:'1px solid #e8e8e8', borderRadius:7, fontSize:12.5 }}/>
                        <div style={{ fontSize:9.5, color:'#bbb' }}>{t?formatRupiah(t):'—'}</div>
                      </td>
                      <td style={{ padding:'6px 7px', textAlign:'right', fontWeight:600,
                        color: pct==null?'#bbb':pct>=100?'#15803d':pct>=80?'#f59e0b':RED }}>
                        {pct==null?'—':`${pct.toFixed(0)}%`}
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && <tr><td colSpan={5} style={{ padding:16, color:'#888' }}>Tidak ada baris. Matikan filter "hanya yang punya target" untuk melihat semua.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <Card style={{ padding:'12px 16px', minWidth:150 }}>
      <div style={{ fontSize:11, color:'#888' }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:700, marginTop:2 }}>{value}</div>
    </Card>
  )
}

const sel = { padding:'6px 10px', fontSize:12.5, border:'1px solid #e8e8e8', borderRadius:8, background:'#fff', color:'#333' }
const btnPrimary = { padding:'7px 18px', fontSize:13, fontWeight:600, border:'none', borderRadius:8, background:RED, color:'#fff', cursor:'pointer' }
const btnGhost = { padding:'6px 12px', fontSize:12.5, border:'1px solid #e8e8e8', borderRadius:8, background:'#fff', color:'#333', cursor:'pointer' }
