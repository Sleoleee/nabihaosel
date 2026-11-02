import { useState, useEffect } from 'react'
import { getSpMaster, getSpTargets, saveSpTargets, spScan } from '../utils/api'

const MONTHS = [[8, 'Agu'], [9, 'Sep'], [10, 'Okt'], [11, 'Nov'], [12, 'Des']]
const fmt = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('id-ID'))

export default function SettingsSPTargetPage() {
  const [tahun, setTahun] = useState(2026)
  const [sp, setSp] = useState([])
  const [branches, setBranches] = useState([])
  const [grid, setGrid] = useState({})   // key "slp||branch" -> {bulan: target}
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  // scan
  const [scanName, setScanName] = useState('')
  const [scanRes, setScanRes] = useState(null)

  const load = async () => {
    setMsg('')
    const [m, t] = await Promise.all([getSpMaster(tahun), getSpTargets(tahun)])
    setSp(m.salespeople || []); setBranches(m.branches || [])
    const g = {}
    for (const r of (t.targets || [])) {
      const k = `${r.slp_name}||${r.branch}`
      ;(g[k] = g[k] || {})[r.bulan] = r.target
    }
    // pastikan tiap SP lapangan aktif punya minimal baris branch_utama-nya
    for (const s of (m.salespeople || [])) {
      if (s.tipe === 'SP lapangan' && s.aktif_q4 && s.branch_utama) {
        const k = `${s.slp_name}||${s.branch_utama}`
        if (!g[k]) g[k] = {}
      }
    }
    setGrid(g)
  }
  useEffect(() => { load() }, [tahun])

  const setCell = (k, bulan, val) => {
    const num = val.replace(/[^\d]/g, '')
    setGrid(prev => ({ ...prev, [k]: { ...prev[k], [bulan]: num === '' ? '' : Number(num) } }))
  }
  const addBranch = (slp, branch) => {
    if (!branch) return
    const k = `${slp}||${branch}`
    setGrid(prev => prev[k] ? prev : { ...prev, [k]: {} })
  }

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      const rows = []
      for (const [k, months] of Object.entries(grid)) {
        const [slp, branch] = k.split('||')
        for (const [b, mo] of MONTHS) {
          rows.push({ slp_name: slp, branch, tahun, bulan: b, target: Number(months[b] || 0) })
        }
      }
      const res = await saveSpTargets(rows)
      setMsg(`Tersimpan ${res.saved} baris target.`)
    } catch (e) { setMsg('Gagal menyimpan. Coba lagi.') } finally { setBusy(false) }
  }

  const doScan = async () => {
    if (!scanName.trim()) return
    setScanRes(await spScan(scanName.trim()))
  }

  // kelompokkan grid per SP (hanya SP lapangan untuk editor target)
  const spByName = Object.fromEntries(sp.map(s => [s.slp_name, s]))
  const activeSP = sp.filter(s => s.tipe === 'SP lapangan' && s.aktif_q4)
  const rowsForSP = (slp) => Object.keys(grid).filter(k => k.startsWith(slp + '||'))

  const inp = { width: 92, padding: '4px 6px', textAlign: 'right', border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }
  const th = { padding: '6px 8px', background: '#f4f4f5', fontSize: 12, textAlign: 'left', position: 'sticky', top: 0 }
  const td = { padding: '4px 8px', borderBottom: '1px solid #eee', fontSize: 12 }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Target SP per Branch</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        Edit target bulanan tiap salesperson per branch (opsi 2b). Satu SP bisa punya target di beberapa branch.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '12px 0' }}>
        <label style={{ fontSize: 13 }}>Tahun:
          <select value={tahun} onChange={e => setTahun(Number(e.target.value))} style={{ marginLeft: 6, padding: 4 }}>
            {[2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </label>
        <button onClick={save} disabled={busy}
          style={{ padding: '7px 16px', background: '#C00000', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
          {busy ? 'Menyimpan…' : 'Simpan semua'}
        </button>
        {msg && <span style={{ fontSize: 13, color: '#2d7d2d' }}>{msg}</span>}
      </div>

      <div style={{ maxHeight: 520, overflow: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={th}>Salesperson</th><th style={th}>Kode</th><th style={th}>Tim</th><th style={th}>Branch</th>
              {MONTHS.map(([, n]) => <th key={n} style={{ ...th, textAlign: 'right' }}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {activeSP.map(s => {
              const keys = rowsForSP(s.slp_name)
              return keys.map((k, i) => {
                const branch = k.split('||')[1]
                return (
                  <tr key={k}>
                    <td style={td}>{i === 0 ? `${s.slp_name}` : ''}</td>
                    <td style={td}>{i === 0 ? (s.kode_sp || '') : ''}</td>
                    <td style={td}>{i === 0 ? (s.tim || '') : ''}</td>
                    <td style={td}>{branch}</td>
                    {MONTHS.map(([b]) => (
                      <td style={td} key={b}>
                        <input style={inp} value={fmt(grid[k]?.[b])} onChange={e => setCell(k, b, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                )
              }).concat(
                <tr key={s.slp_name + '-add'}>
                  <td style={td} colSpan={4}>
                    <select defaultValue="" onChange={e => { addBranch(s.slp_name, e.target.value); e.target.value = '' }}
                      style={{ fontSize: 11, padding: 3 }}>
                      <option value="">+ tambah branch…</option>
                      {branches.map(br => <option key={br} value={br}>{br}</option>)}
                    </select>
                  </td>
                  <td style={td} colSpan={5}></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Panel Scan */}
      <div style={{ marginTop: 28, padding: 16, border: '1px solid #e5e5e5', borderRadius: 8, maxWidth: 640 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>🔎 Scan kecocokan nama</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          Ketik nama (mis. panggilan/typo) → lihat kandidat di sp_master. <b>Saran saja</b>, bukan auto-match.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={scanName} onChange={e => setScanName(e.target.value)} placeholder="nama…"
            style={{ flex: 1, padding: 6, border: '1px solid #ccc', borderRadius: 6 }} />
          <button onClick={doScan} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>Scan</button>
        </div>
        {scanRes && (
          <table style={{ marginTop: 10, width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Kandidat</th><th style={th}>Tipe</th><th style={th}>Kode</th><th style={th}>Branch</th><th style={{ ...th, textAlign: 'right' }}>Skor</th></tr></thead>
            <tbody>
              {scanRes.kandidat.map((c, i) => (
                <tr key={i}>
                  <td style={td}>{c.slp_name}</td><td style={td}>{c.tipe}</td><td style={td}>{c.kode_sp || ''}</td>
                  <td style={td}>{c.branch_utama || ''}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: c.skor >= 90 ? 700 : 400 }}>{c.skor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
