import { useState, useEffect, useMemo } from 'react'
import Card from '../components/Card'
import Skeleton from '../components/Skeleton'
import { formatRupiah, formatRupiahShort } from '../utils/format'
import { getSettingsYears, getRegistry, saveRegistry } from '../utils/api'

const RED = '#d31137'
const TANPA = 'Tanpa SPV'

export default function SettingsSalesPage() {
  const [years, setYears] = useState([])
  const [year, setYear] = useState(null)
  const [people, setPeople] = useState([])
  const [channels, setChannels] = useState([])
  const [spvs, setSpvs] = useState([])
  const [rowMap, setRowMap] = useState({})   // slp_name -> {channel,spv,target,aktif}
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')
  const [chFilter, setChFilter] = useState('all')
  const [onlyActive, setOnlyActive] = useState(false)
  const [edit, setEdit] = useState(null)       // popup state: {slp_name,...}
  const [copyYear, setCopyYear] = useState('')
  const [newName, setNewName] = useState('')

  useEffect(() => { getSettingsYears().then(d => {
    setYears(d.years||[]); setYear((d.years||[]).slice(-1)[0] || null)
  }).catch(()=>{}) }, [])

  const load = (y) => {
    if (!y) return
    setLoading(true); setSaved(false)
    getRegistry(y).then(d => {
      setPeople(d.salespeople||[]); setChannels(d.channels||[]); setSpvs(d.spvs||[])
      setRowMap(Object.fromEntries((d.salespeople||[]).map(p => [p.slp_name,
        { channel:p.channel||'', spv:p.spv||TANPA, target:p.target||0, aktif:p.aktif!==false }])))
    }).catch(()=>{}).finally(()=>setLoading(false))
  }
  useEffect(() => { load(year) }, [year])

  const upd = (slp, patch) => { setRowMap(m => ({ ...m, [slp]: { ...m[slp], ...patch } })); setSaved(false) }

  const copyFrom = () => {
    if (!copyYear) return
    getRegistry(copyYear).then(d => {
      const src = Object.fromEntries((d.salespeople||[]).map(p => [p.slp_name, p]))
      setRowMap(m => { const n = { ...m }
        Object.keys(n).forEach(k => { if (src[k]) n[k] = { channel:src[k].channel||'', spv:src[k].spv||TANPA, target:src[k].target||0, aktif:src[k].aktif!==false } })
        return n })
      setSaved(false)
    }).catch(()=>{})
  }

  const addPerson = () => {
    const nm = newName.trim()
    if (!nm || rowMap[nm]) { setNewName(''); return }
    setPeople(p => [{ slp_name:nm, display:nm, revenue:0, in_data:false }, ...p])
    setRowMap(m => ({ ...m, [nm]: { channel:'', spv:TANPA, target:0, aktif:true } }))
    setNewName('')
  }

  const save = () => {
    setSaving(true)
    const rows = Object.entries(rowMap).map(([slp_name, v]) => ({ slp_name, ...v }))
    saveRegistry({ year, rows }).then(() => setSaved(true)).catch(()=>{}).finally(()=>setSaving(false))
  }

  const filtered = useMemo(() => people.filter(p => {
    const r = rowMap[p.slp_name] || {}
    if (search && !(p.display||p.slp_name||'').toLowerCase().includes(search.toLowerCase())) return false
    if (chFilter!=='all' && (r.channel||'')!==chFilter) return false
    if (onlyActive && !r.aktif) return false
    return true
  }), [people, rowMap, search, chFilter, onlyActive])

  const stats = useMemo(() => {
    const byCh = {}; let tgt = 0
    Object.values(rowMap).forEach(r => { if (r.aktif){ byCh[r.channel||'—']=(byCh[r.channel||'—']||0)+1; tgt+=Number(r.target)||0 } })
    return { byCh, tgt }
  }, [rowMap])

  const spvOptions = [...new Set([TANPA, ...spvs, ...Object.values(rowMap).map(r=>r.spv).filter(s=>s&&s!==TANPA)])]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <h1 style={{ fontSize:20, fontWeight:700 }}>Pengaturan Salesperson</h1>
        <span style={{ fontSize:12, color:'#888' }}>Channel, SPV, target & status aktif per tahun. Perubahan langsung dipakai dashboard (tanpa rebuild).</span>
      </div>

      <Card style={{ padding:14, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <label style={{ fontSize:12.5, fontWeight:600 }}>Tahun</label>
        <select value={year||''} onChange={e=>setYear(Number(e.target.value))} style={sel}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ width:1, height:22, background:'#eee' }}/>
        <span style={{ fontSize:12, color:'#888' }}>Salin dari</span>
        <select value={copyYear} onChange={e=>setCopyYear(e.target.value)} style={sel}>
          <option value="">—</option>{years.filter(y=>y!==year).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={copyFrom} disabled={!copyYear} style={btnGhost}>Salin</button>
        <div style={{ width:1, height:22, background:'#eee' }}/>
        <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="+ tambah salesperson"
          onKeyDown={e=>e.key==='Enter'&&addPerson()} style={{ ...sel, width:170 }}/>
        <button onClick={addPerson} style={btnGhost}>Tambah</button>
        <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center' }}>
          {saved && <span style={{ color:'#15803d', fontSize:12.5, fontWeight:600 }}>✓ Tersimpan</span>}
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving?'Menyimpan…':'Simpan'}</button>
        </div>
      </Card>

      <div style={{ display:'flex', gap:14, flexWrap:'wrap', fontSize:12 }}>
        {Object.entries(stats.byCh).sort((a,b)=>b[1]-a[1]).map(([c,n])=>(
          <span key={c} style={{ padding:'4px 10px', borderRadius:20, background:'#fde3e9', color:RED, fontWeight:600 }}>{c}: {n} aktif</span>
        ))}
        <span style={{ padding:'4px 10px', borderRadius:20, background:'#f4f4f5', color:'#555', fontWeight:600 }}>Total target: {formatRupiahShort(stats.tgt)}</span>
      </div>

      <Card style={{ padding:16 }}>
        <div style={{ display:'flex', gap:10, marginBottom:10, flexWrap:'wrap' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari…" style={{ ...sel, width:200 }}/>
          <select value={chFilter} onChange={e=>setChFilter(e.target.value)} style={sel}>
            <option value="all">Semua channel</option>{channels.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ fontSize:12, color:'#666', display:'flex', gap:6, alignItems:'center' }}>
            <input type="checkbox" checked={onlyActive} onChange={e=>setOnlyActive(e.target.checked)} /> hanya aktif
          </label>
          <span style={{ marginLeft:'auto', fontSize:11, color:'#aaa' }}>{filtered.length} orang</span>
        </div>
        {loading ? <Skeleton height={400}/> : (
          <div style={{ maxHeight:560, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead><tr style={{ position:'sticky', top:0, background:'#fff', borderBottom:'2px solid #f0f0f0' }}>
                {['Salesperson','Channel','SPV','Target','Revenue','Aktif',''].map((h,i)=>
                  <th key={h} style={{ padding:'7px', textAlign:['Target','Revenue'].includes(h)?'right':'left', color:'#888', fontSize:11 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(p => { const r = rowMap[p.slp_name]||{}; return (
                  <tr key={p.slp_name} style={{ borderBottom:'1px solid #f6f6f6', opacity: r.aktif?1:0.5 }}>
                    <td style={{ padding:'6px 7px' }}>
                      <div style={{ fontWeight:500 }}>{p.display||p.slp_name}{!p.in_data && <span style={{ marginLeft:6, fontSize:9, color:'#aaa' }}>(baru)</span>}</div>
                      {p.display!==p.slp_name && <div style={{ fontSize:10, color:'#aaa' }}>{p.slp_name}</div>}
                    </td>
                    <td style={{ padding:'6px 7px' }}>{r.channel||<span style={{color:'#ccc'}}>—</span>}</td>
                    <td style={{ padding:'6px 7px', color: r.spv&&r.spv!==TANPA?RED:'#999', fontWeight: r.spv&&r.spv!==TANPA?600:400 }}>{r.spv||TANPA}</td>
                    <td style={{ padding:'6px 7px', textAlign:'right' }}>{r.target?formatRupiahShort(r.target):'—'}</td>
                    <td style={{ padding:'6px 7px', textAlign:'right', color:'#888' }}>{formatRupiahShort(p.revenue)}</td>
                    <td style={{ padding:'6px 7px' }}>{r.aktif?'✓':'—'}</td>
                    <td style={{ padding:'6px 7px', textAlign:'right' }}>
                      <button onClick={()=>setEdit({ slp_name:p.slp_name, display:p.display, ...r })} style={btnGhost}>Edit</button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {edit && (
        <div onClick={()=>setEdit(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, padding:22, width:360, maxWidth:'90vw', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:2 }}>{edit.display||edit.slp_name}</div>
            <div style={{ fontSize:11, color:'#999', marginBottom:16 }}>Formasi tahun {year}</div>
            <Field label="Channel">
              <select value={edit.channel||''} onChange={e=>setEdit({...edit, channel:e.target.value})} style={{ ...sel, width:'100%' }}>
                <option value="">— belum ditentukan —</option>{channels.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="SPV">
              <select value={edit.spv||TANPA} onChange={e=>setEdit({...edit, spv:e.target.value})} style={{ ...sel, width:'100%' }}>
                {spvOptions.map(s=><option key={s} value={s}>{s}</option>)}
                <option value="__new__">+ SPV baru…</option>
              </select>
              {edit.spv==='__new__' && <input autoFocus placeholder="Nama SPV baru" onBlur={e=>setEdit({...edit, spv:e.target.value||TANPA})}
                onKeyDown={e=>e.key==='Enter'&&setEdit({...edit, spv:e.target.value||TANPA})} style={{ ...sel, width:'100%', marginTop:6 }}/>}
            </Field>
            <Field label="Target (Rp)">
              <input type="number" value={edit.target??0} onChange={e=>setEdit({...edit, target:e.target.value})} style={{ ...sel, width:'100%' }}/>
              <div style={{ fontSize:10, color:'#bbb', marginTop:2 }}>{edit.target?formatRupiah(Number(edit.target)):'—'}</div>
            </Field>
            <Field label="Status">
              <label style={{ fontSize:13, display:'flex', gap:8, alignItems:'center' }}>
                <input type="checkbox" checked={edit.aktif!==false} onChange={e=>setEdit({...edit, aktif:e.target.checked})} /> Aktif tahun ini
              </label>
            </Field>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:18 }}>
              <button onClick={()=>setEdit(null)} style={btnGhost}>Batal</button>
              <button onClick={()=>{ upd(edit.slp_name, { channel:edit.channel, spv:(edit.spv==='__new__'?TANPA:edit.spv), target:Number(edit.target)||0, aktif:edit.aktif!==false }); setEdit(null) }} style={btnPrimary}>Terapkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return <div style={{ marginBottom:12 }}><div style={{ fontSize:11, color:'#888', marginBottom:4, fontWeight:600 }}>{label}</div>{children}</div>
}

const sel = { padding:'6px 10px', fontSize:12.5, border:'1px solid #e8e8e8', borderRadius:8, background:'#fff', color:'#333' }
const btnPrimary = { padding:'7px 18px', fontSize:13, fontWeight:600, border:'none', borderRadius:8, background:RED, color:'#fff', cursor:'pointer' }
const btnGhost = { padding:'6px 12px', fontSize:12, border:'1px solid #e8e8e8', borderRadius:8, background:'#fff', color:'#333', cursor:'pointer' }
