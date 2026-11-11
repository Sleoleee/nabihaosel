import { useState, useEffect, useCallback, useMemo } from 'react'
import { DataEditor, GridCellKind } from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'
import {
  getMapCustomerC, saveMapCustomerC, getCSalesperson, saveCSalesperson,
  deleteCSalesperson, getCCodes, getSpMaster,
} from '../utils/api'
import { formatRupiahShort } from '../utils/format'

const today = () => new Date().toISOString().slice(0, 10)

export default function SettingsMappingPage() {
  const [tab, setTab] = useState('cust')
  return (
    <div style={{ padding: 24, maxWidth: 1180 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Mapping Salesperson (Kode C)</h1>
      <p style={{ color: '#666', fontSize: 13, maxWidth: 760 }}>
        Sumber kebenaran atribusi salesperson. Transaksi = anchor; mapping ini mengikutinya.
        Perubahan dicatat dengan tanggal berlaku (effective-dated) agar histori tetap akurat.
      </p>
      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        {[['cust', 'Customer → Kode C'], ['csp', 'Kode C → Salesperson']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              border: tab === k ? '0' : '1px solid #ccc', background: tab === k ? '#C00000' : '#fff', color: tab === k ? '#fff' : '#333' }}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'cust' ? <CustomerCGrid /> : <CSalespersonEditor />}
    </div>
  )
}

// ----------------------------- Customer -> Kode C (grid ala-Excel) -----------------------------
function CustomerCGrid() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(100)
  const [search, setSearch] = useState('')
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)
  const [validFrom, setValidFrom] = useState(today())
  const [edits, setEdits] = useState({})   // customer_code -> kode_c baru
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    setMsg('')
    getMapCustomerC({ search: search || undefined, only_unmapped: onlyUnmapped, page, limit })
      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })
  }, [search, onlyUnmapped, page, limit])
  useEffect(() => { load() }, [load])

  const columns = useMemo(() => ([
    { title: 'Customer Code', width: 140 },
    { title: 'Nama', width: 230 },
    { title: 'Revenue', width: 110 },
    { title: 'SlpName (transaksi)', width: 180 },
    { title: 'Kode C', width: 120 },
  ]), [])

  const kodeOf = (r) => (r.customer_code in edits ? edits[r.customer_code] : (r.kode_c || ''))

  const getCellContent = useCallback(([col, row]) => {
    const r = rows[row]
    if (!r) return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false }
    if (col === 0) return { kind: GridCellKind.Text, data: r.customer_code, displayData: r.customer_code, allowOverlay: false }
    if (col === 1) return { kind: GridCellKind.Text, data: r.customer_name || '', displayData: r.customer_name || '', allowOverlay: false }
    if (col === 2) { const v = formatRupiahShort(r.total_revenue || 0); return { kind: GridCellKind.Text, data: v, displayData: v, allowOverlay: false } }
    if (col === 3) return { kind: GridCellKind.Text, data: r.slp_name_transaksi || '', displayData: r.slp_name_transaksi || '', allowOverlay: false }
    const kc = kodeOf(r)
    return { kind: GridCellKind.Text, data: kc, displayData: kc, allowOverlay: true,
      themeOverride: (r.customer_code in edits) ? { bgCell: '#fff7ed' } : undefined }
  }, [rows, edits])

  const onCellEdited = useCallback(([col, row], newVal) => {
    if (col !== 4) return                      // hanya kolom Kode C editable
    const r = rows[row]; if (!r) return
    const v = String(newVal.data ?? '').trim()
    setEdits(prev => ({ ...prev, [r.customer_code]: v }))
  }, [rows])

  const save = async () => {
    const changes = Object.entries(edits).map(([customer_code, kode_c]) => ({ customer_code, kode_c, valid_from: validFrom }))
    if (!changes.length) { setMsg('Tidak ada perubahan.'); return }
    setBusy(true); setMsg('')
    try {
      const res = await saveMapCustomerC({ changes, default_valid_from: validFrom })
      setMsg(`Tersimpan ${res.written} perubahan (berlaku sejak ${validFrom}).`)
      setEdits({}); load()
    } catch { setMsg('Gagal menyimpan.') } finally { setBusy(false) }
  }

  const nEdit = Object.keys(edits).length
  const inp = { padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <input placeholder="cari nama / kode…" value={search}
          onChange={e => { setPage(1); setSearch(e.target.value) }} style={{ ...inp, width: 220 }} />
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyUnmapped} onChange={e => { setPage(1); setOnlyUnmapped(e.target.checked) }} />
          hanya belum ada Kode C
        </label>
        <label style={{ fontSize: 13 }}>Berlaku sejak:
          <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} style={{ ...inp, marginLeft: 6 }} />
        </label>
        <button onClick={save} disabled={busy || !nEdit}
          style={{ padding: '7px 16px', background: nEdit ? '#C00000' : '#bbb', color: '#fff', border: 0, borderRadius: 6, cursor: nEdit ? 'pointer' : 'default', fontWeight: 600 }}>
          {busy ? 'Menyimpan…' : `Simpan ${nEdit || ''} perubahan`}
        </button>
        {msg && <span style={{ fontSize: 13, color: '#2d7d2d' }}>{msg}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: '#888', marginBottom: 6 }}>
        Edit kolom <b>Kode C</b> langsung. Bisa copy-paste dari keyboard, drag-fill, dan pilih banyak baris.
        Baris oranye = ada perubahan belum disimpan. (Non Trade / BLANKS tidak dihitung pencapaian salesperson.)
      </div>
      <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
        <DataEditor
          columns={columns}
          rows={rows.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          getCellsForSelection={true}
          onPaste={true}
          fillHandle={true}
          rowMarkers="number"
          smoothScrollX smoothScrollY
          width="100%"
          height={520}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{total} customer{onlyUnmapped ? ' (belum ada Kode C)' : ''}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={inp}>← Prev</button>
          <span style={{ fontSize: 12, color: '#888' }}>Hal {page} / {Math.max(1, Math.ceil(total / limit))}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= total} style={inp}>Next →</button>
        </div>
      </div>
      {nEdit > 0 && <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>
        ⚠ {nEdit} perubahan belum disimpan. Pindah halaman tidak menghapusnya, tapi simpan dulu sebelum menutup.
      </div>}
    </div>
  )
}

// ----------------------------- Kode C -> Salesperson -----------------------------
function CSalespersonEditor() {
  const [rows, setRows] = useState([])
  const [codes, setCodes] = useState([])
  const [sps, setSps] = useState([])
  const [form, setForm] = useState({ kode_c: '', slp_name: '', valid_from: today() })
  const [msg, setMsg] = useState('')

  const load = () => {
    getCSalesperson().then(setRows)
    getCCodes().then(setCodes)
    getSpMaster(2026).then(m => setSps(m.salespeople || [])).catch(() => setSps([]))
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!form.kode_c || !form.slp_name) { setMsg('Pilih Kode C & salesperson.'); return }
    await saveCSalesperson(form)
    setMsg(`Tersimpan: ${form.kode_c} → ${form.slp_name} (sejak ${form.valid_from}).`)
    setForm({ ...form, slp_name: '' }); load()
  }
  const del = async (r) => { await deleteCSalesperson(r.kode_c, r.valid_from); load() }

  const th = { padding: '6px 8px', background: '#f4f4f5', fontSize: 12, textAlign: 'left' }
  const td = { padding: '5px 8px', borderBottom: '1px solid #eee', fontSize: 12 }
  const inp = { padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }
  const noSlp = codes.filter(c => !c.ada_salesperson)

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 520px' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Riwayat penugasan</div>
        <div style={{ maxHeight: 460, overflow: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Kode C</th><th style={th}>Salesperson</th><th style={th}>Berlaku sejak</th><th style={th}>s/d</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.kode_c}</td>
                  <td style={td}>{r.slp_name}</td>
                  <td style={td}>{r.valid_from}</td>
                  <td style={{ ...td, color: r.valid_to ? '#333' : '#15803d' }}>{r.valid_to || 'kini'}</td>
                  <td style={td}><button onClick={() => del(r)} style={{ border: 'none', background: 'none', color: '#d31137', cursor: 'pointer' }}>hapus</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td style={td} colSpan={5}>Belum ada penugasan. Tambah di kanan →</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ flex: '0 0 320px' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Tambah / ganti penugasan</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select value={form.kode_c} onChange={e => setForm({ ...form, kode_c: e.target.value })} style={inp}>
            <option value="">— pilih Kode C —</option>
            {codes.map(c => <option key={c.kode_c} value={c.kode_c}>{c.kode_c} ({c.n_customer} cust){c.ada_salesperson ? '' : ' • belum ada SP'}</option>)}
          </select>
          <select value={form.slp_name} onChange={e => setForm({ ...form, slp_name: e.target.value })} style={inp}>
            <option value="">— pilih salesperson —</option>
            {sps.map(s => <option key={s.slp_name} value={s.slp_name}>{s.slp_name}</option>)}
          </select>
          <label style={{ fontSize: 13 }}>Berlaku sejak:
            <input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} style={{ ...inp, marginLeft: 6 }} />
          </label>
          <button onClick={add} style={{ padding: '8px 16px', background: '#C00000', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Simpan penugasan</button>
          {msg && <span style={{ fontSize: 12.5, color: '#2d7d2d' }}>{msg}</span>}
        </div>
        {noSlp.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: '#b45309', marginBottom: 4 }}>⚠ {noSlp.length} Kode C belum ada salesperson:</div>
            <div style={{ color: '#666' }}>{noSlp.slice(0, 20).map(c => `${c.kode_c}(${c.n_customer})`).join(', ')}{noSlp.length > 20 ? ' …' : ''}</div>
          </div>
        )}
      </div>
    </div>
  )
}
