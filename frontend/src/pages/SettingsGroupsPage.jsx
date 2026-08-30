import { useState, useEffect, useMemo } from 'react'
import Card from '../components/Card'
import Skeleton from '../components/Skeleton'
import { formatRupiahShort } from '../utils/format'
import { getSettingsYears, getGroups, saveGroups } from '../utils/api'

const RED = '#d31137'
const LAINNYA = 'Lainnya'

export default function SettingsGroupsPage() {
  const [years, setYears] = useState([])
  const [year, setYear] = useState(null)
  const [people, setPeople] = useState([])       // [{slp_name,display,grup,revenue}]
  const [groups, setGroups] = useState([])        // nama grup
  const [assign, setAssign] = useState({})        // slp_name -> grup (state lokal)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [copyYear, setCopyYear] = useState('')

  useEffect(() => { getSettingsYears().then(d => {
    setYears(d.years||[]); setYear((d.years||[]).slice(-1)[0] || null)
  }).catch(()=>{}) }, [])

  const load = (y) => {
    if (!y) return
    setLoading(true); setSaved(false)
    getGroups(y).then(d => {
      setPeople(d.salespeople||[])
      const g = d.groups||[]
      if (!g.includes(LAINNYA)) g.push(LAINNYA)
      setGroups(g)
      setAssign(Object.fromEntries((d.salespeople||[]).map(p => [p.slp_name, p.grup])))
    }).catch(()=>{}).finally(()=>setLoading(false))
  }
  useEffect(() => { load(year) }, [year])

  const setGrup = (slp, grup) => { setAssign(a => ({ ...a, [slp]: grup })); setSaved(false) }

  const addGroup = () => {
    const n = newGroup.trim()
    if (n && !groups.includes(n)) setGroups(g => [...g.filter(x=>x!==LAINNYA), n, LAINNYA])
    setNewGroup('')
  }

  const copyFrom = () => {
    if (!copyYear) return
    getGroups(copyYear).then(d => {
      const map = Object.fromEntries((d.salespeople||[]).map(p => [p.slp_name, p.grup]))
      setAssign(a => { const n = { ...a }; Object.keys(n).forEach(k => { if (map[k]) n[k] = map[k] }); return n })
      const g = new Set([...groups, ...(d.groups||[])]); g.add(LAINNYA)
      setGroups([...g].sort((a,b)=>(a===LAINNYA)-(b===LAINNYA)))
      setSaved(false)
    }).catch(()=>{})
  }

  const save = () => {
    setSaving(true)
    saveGroups({ year, assignments: assign }).then(() => { setSaved(true) })
      .catch(()=>{}).finally(()=>setSaving(false))
  }

  const filtered = useMemo(() => people.filter(p =>
    (p.display||p.slp_name||'').toLowerCase().includes(search.toLowerCase())
  ), [people, search])

  const counts = useMemo(() => {
    const c = {}
    people.forEach(p => { const g = assign[p.slp_name] || LAINNYA; c[g] = (c[g]||0)+1 })
    return c
  }, [people, assign])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <h1 style={{ fontSize:20, fontWeight:700 }}>Setting · Grup Salesperson</h1>
        <span style={{ fontSize:12, color:'#888' }}>Atur setiap salesperson masuk grup mana untuk tahun terpilih. Perubahan langsung dipakai dashboard (tanpa build ulang).</span>
      </div>

      <Card style={{ padding:14, display:'flex', gap:14, alignItems:'center', flexWrap:'wrap' }}>
        <label style={{ fontSize:12.5, fontWeight:600 }}>Tahun</label>
        <select value={year||''} onChange={e=>setYear(Number(e.target.value))} style={sel}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ width:1, height:22, background:'#eee' }}/>
        <span style={{ fontSize:12, color:'#888' }}>Salin grup dari tahun</span>
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

      {/* ringkasan jumlah per grup */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {groups.map(g => (
          <span key={g} style={{ fontSize:11.5, padding:'4px 10px', borderRadius:20,
            background: g===LAINNYA?'#f4f4f5':'#fde3e9', color: g===LAINNYA?'#666':RED, fontWeight:600 }}>
            {g}: {counts[g]||0}
          </span>
        ))}
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input value={newGroup} onChange={e=>setNewGroup(e.target.value)} placeholder="+ grup baru"
            onKeyDown={e=>e.key==='Enter'&&addGroup()} style={{ ...sel, width:120 }}/>
          <button onClick={addGroup} style={btnGhost}>Tambah</button>
        </div>
      </div>

      <Card style={{ padding:16 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari salesperson…"
          style={{ ...sel, width:260, marginBottom:10 }}/>
        {loading ? <Skeleton height={360}/> : (
          <div style={{ maxHeight:520, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead><tr style={{ position:'sticky', top:0, background:'#fff', borderBottom:'2px solid #f0f0f0' }}>
                {['Salesperson','Revenue (thn ini)','Grup'].map(h=>
                  <th key={h} style={{ padding:'7px', textAlign:h==='Grup'?'left':(h==='Salesperson'?'left':'right'), color:'#888', fontSize:11 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.slp_name} style={{ borderBottom:'1px solid #f6f6f6' }}>
                    <td style={{ padding:'6px 7px' }}>
                      <div style={{ fontWeight:500 }}>{p.display||p.slp_name}</div>
                      {p.display!==p.slp_name && <div style={{ fontSize:10, color:'#aaa' }}>{p.slp_name}</div>}
                    </td>
                    <td style={{ padding:'6px 7px', textAlign:'right', color:'#666' }}>{formatRupiahShort(p.revenue)}</td>
                    <td style={{ padding:'6px 7px' }}>
                      <select value={assign[p.slp_name]||LAINNYA} onChange={e=>setGrup(p.slp_name, e.target.value)}
                        style={{ ...sel, minWidth:170,
                          borderColor: (assign[p.slp_name]||LAINNYA)===LAINNYA?'#e8e8e8':RED,
                          color: (assign[p.slp_name]||LAINNYA)===LAINNYA?'#666':RED, fontWeight:600 }}>
                        {groups.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={3} style={{ padding:16, color:'#888' }}>Tidak ada salesperson untuk pencarian ini.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const sel = { padding:'6px 10px', fontSize:12.5, border:'1px solid #e8e8e8', borderRadius:8, background:'#fff', color:'#333' }
const btnPrimary = { padding:'7px 18px', fontSize:13, fontWeight:600, border:'none', borderRadius:8, background:RED, color:'#fff', cursor:'pointer' }
const btnGhost = { padding:'6px 12px', fontSize:12.5, border:'1px solid #e8e8e8', borderRadius:8, background:'#fff', color:'#333', cursor:'pointer' }
