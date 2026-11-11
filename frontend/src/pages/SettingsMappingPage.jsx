import { useState, useEffect, useCallback, useMemo } from 'react'
import { DataEditor, GridCellKind } from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'
import {
  getMapCustomerC, saveMapCustomerC, getCSalesperson, saveCSalesperson,
  deleteCSalesperson, getCCodes, getSpMaster, getMappingHealth,
} from '../utils/api'
import { formatRupiahShort } from '../utils/format'

const today = () => new Date().toISOString().slice(0, 10)

export default function SettingsMappingPage() {
  const [tab, setTab] = useState('cust')
  return (
    <div style={{ padding: 24, maxWidth: 1180 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Salesperson yang Memegang Customer</h1>
      <p style={{ color: '#666', fontSize: 13, maxWidth: 820 }}>
        Di sini kamu mengatur <b>siapa salesperson yang memegang tiap customer</b>, lewat Kode C.
        Setiap customer punya Kode C, dan tiap Kode C dipegang seorang salesperson. Kalau salesperson-nya
        berganti, kamu catat tanggal pergantiannya supaya penjualan lama tetap dihitung ke orang yang benar.
      </p>
      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        {[['cust', '1. Customer → Kode C'], ['csp', '2. Kode C → Salesperson'], ['health', '3. Cek Kelengkapan']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              border: tab === k ? '0' : '1px solid #ccc', background: tab === k ? '#C00000' : '#fff', color: tab === k ? '#fff' : '#333' }}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'cust' && <CustomerCGrid />}
      {tab === 'csp' && <CSalespersonEditor />}
      {tab === 'health' && <HealthPanel goTab={setTab} />}
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
  const [edits, setEdits] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    setMsg('')
    getMapCustomerC({ search: search || undefined, only_unmapped: onlyUnmapped, page, limit })
      .then(r => { setRows(r.data || []); setTotal(r.total || 0) })
  }, [search, onlyUnmapped, page, limit])
  useEffect(() => { load() }, [load])

  const columns = useMemo(() => ([
    { title: 'Kode Customer', width: 140 },
    { title: 'Nama', width: 230 },
    { title: 'Revenue', width: 110 },
    { title: 'Nama sales di nota', width: 180 },
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
    if (col !== 4) return
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
      <div style={{ fontSize: 12.5, color: '#555', marginBottom: 10, background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
        Daftar semua customer dari data penjualan. Isi kolom <b>Kode C</b> untuk menentukan customer itu masuk kelompok mana.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <input placeholder="cari nama / kode…" value={search}
          onChange={e => { setPage(1); setSearch(e.target.value) }} style={{ ...inp, width: 220 }} />
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyUnmapped} onChange={e => { setPage(1); setOnlyUnmapped(e.target.checked) }} />
          tampilkan yang belum ada Kode C saja
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
        Edit kolom <b>Kode C</b> langsung — bisa copy-paste dari keyboard, tarik ke bawah, dan pilih banyak baris sekaligus.
        Baris oranye = ada perubahan yang belum disimpan.
      </div>
      <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
        <DataEditor
          columns={columns} rows={rows.length}
          getCellContent={getCellContent} onCellEdited={onCellEdited}
          getCellsForSelection={true} onPaste={true} fillHandle={true}
          rowMarkers="number" smoothScrollX smoothScrollY width="100%" height={520}
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
        ⚠ {nEdit} perubahan belum disimpan — simpan dulu sebelum pindah.
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
    if (!form.kode_c || !form.slp_name) { setMsg('Pilih Kode C & salesperson dulu.'); return }
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
    <div>
      <div style={{ fontSize: 12.5, color: '#555', marginBottom: 12, background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
        Tentukan <b>salesperson yang memegang tiap Kode C</b>. Kalau terjadi pergantian (misal C2 dulu Budi, sekarang Ani),
        tambahkan baris baru dengan <b>tanggal mulai</b>-nya — penjualan sebelum tanggal itu tetap dihitung ke orang lama.
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 520px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Daftar pemegang Kode C</div>
          <div style={{ maxHeight: 460, overflow: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={th}>Kode C</th><th style={th}>Salesperson</th><th style={th}>Mulai</th><th style={th}>Sampai</th><th style={th}></th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.kode_c}</td>
                    <td style={td}>{r.slp_name}</td>
                    <td style={td}>{r.valid_from}</td>
                    <td style={{ ...td, color: r.valid_to ? '#333' : '#15803d' }}>{r.valid_to || 'sekarang'}</td>
                    <td style={td}><button onClick={() => del(r)} style={{ border: 'none', background: 'none', color: '#d31137', cursor: 'pointer' }}>hapus</button></td>
                  </tr>
                ))}
                {!rows.length && <tr><td style={td} colSpan={5}>Belum ada yang diisi. Tambahkan di sebelah kanan →</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ flex: '0 0 320px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Tambah / ganti pemegang</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select value={form.kode_c} onChange={e => setForm({ ...form, kode_c: e.target.value })} style={inp}>
              <option value="">— pilih Kode C —</option>
              {codes.map(c => <option key={c.kode_c} value={c.kode_c}>{c.kode_c} ({c.n_customer} customer){c.ada_salesperson ? '' : ' • belum diisi'}</option>)}
            </select>
            <select value={form.slp_name} onChange={e => setForm({ ...form, slp_name: e.target.value })} style={inp}>
              <option value="">— pilih salesperson —</option>
              {sps.map(s => <option key={s.slp_name} value={s.slp_name}>{s.slp_name}</option>)}
            </select>
            <label style={{ fontSize: 13 }}>Mulai berlaku:
              <input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} style={{ ...inp, marginLeft: 6 }} />
            </label>
            <button onClick={add} style={{ padding: '8px 16px', background: '#C00000', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Simpan</button>
            {msg && <span style={{ fontSize: 12.5, color: '#2d7d2d' }}>{msg}</span>}
          </div>
          {noSlp.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: '#b45309', marginBottom: 4 }}>⚠ {noSlp.length} Kode C belum ada salesperson-nya:</div>
              <div style={{ color: '#666' }}>{noSlp.slice(0, 20).map(c => `${c.kode_c}(${c.n_customer})`).join(', ')}{noSlp.length > 20 ? ' …' : ''}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ----------------------------- Cek Kelengkapan (dulu "Kesehatan Data") -----------------------------
function HealthPanel({ goTab }) {
  const [h, setH] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { getMappingHealth().then(setH).catch(() => setErr('Gagal memuat. Pastikan backend sudah ter-update.')) }, [])

  if (err) return <div style={{ color: '#d31137' }}>{err}</div>
  if (!h) return <div style={{ color: '#888' }}>Memuat…</div>

  const r = h.ringkas
  const belumPct = r.tanpa_pemegang.pct
  const siap = belumPct < 2 && (h.kode_c_tanpa_sp?.length || 0) === 0
  const card = { border: '1px solid #e5e5e5', borderRadius: 10, padding: 16, flex: '1 1 220px' }
  const th = { padding: '6px 8px', background: '#f4f4f5', fontSize: 12, textAlign: 'left' }
  const td = { padding: '5px 8px', borderBottom: '1px solid #eee', fontSize: 12 }
  const btn = { fontSize: 12, fontWeight: 600, color: '#fff', background: '#C00000', padding: '6px 12px', borderRadius: 6, border: 0, cursor: 'pointer' }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#555', marginBottom: 12, background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
        Halaman ini mengecek: <b>adakah customer atau Kode C yang belum ada salesperson-nya?</b> Lengkapi yang masih kosong
        supaya semua penjualan bisa dihitung ke salesperson yang benar.
      </div>

      <div style={{ margin: '0 0 18px', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        background: siap ? '#eefbf3' : '#fff7ed', color: siap ? '#047857' : '#b45309',
        border: `1px solid ${siap ? '#a7f3d0' : '#fed7aa'}` }}>
        {siap
          ? '✓ Sudah lengkap — hampir semua penjualan sudah punya salesperson.'
          : `⚠ Belum lengkap: ${belumPct}% penjualan belum ada salesperson-nya${h.kode_c_tanpa_sp?.length ? `, dan ${h.kode_c_tanpa_sp.length} Kode C belum diisi` : ''}.`}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ ...card, background: '#f0fdf4' }}>
          <div style={{ fontSize: 12, color: '#047857' }}>Sudah ada salesperson-nya</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{r.teratribusi.pct}%</div>
          <div style={{ fontSize: 12, color: '#666' }}>{r.teratribusi.n} customer · {formatRupiahShort(r.teratribusi.revenue)}</div>
        </div>
        <div style={{ ...card, background: '#fff7ed' }}>
          <div style={{ fontSize: 12, color: '#b45309' }}>Belum ada salesperson-nya</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{r.tanpa_pemegang.pct}%</div>
          <div style={{ fontSize: 12, color: '#666' }}>{r.tanpa_pemegang.n} customer · {formatRupiahShort(r.tanpa_pemegang.revenue)}</div>
        </div>
        <div style={{ ...card, background: '#f8fafc' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Non-sales (wajar, tak perlu)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{r.non_sales_wajar.pct}%</div>
          <div style={{ fontSize: 12, color: '#666' }}>{r.non_sales_wajar.n} customer · Non Trade / BLANKS</div>
        </div>
      </div>

      <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 14, marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Customer yang belum punya Kode C <span style={{ color: h.customer_tanpa_c.n ? '#b45309' : '#15803d' }}>({h.customer_tanpa_c.n})</span></div>
          <div style={{ fontSize: 12, color: '#888' }}>Muncul di penjualan tapi belum masuk kelompok mana pun. <b style={{ color: '#b45309' }}>· {h.customer_tanpa_c.pct}% penjualan</b></div>
        </div>
        {h.customer_tanpa_c.n > 0 && <button style={btn} onClick={() => goTab('cust')}>Isi di tab Customer → Kode C →</button>}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Kode C yang belum ada salesperson-nya <span style={{ color: h.kode_c_tanpa_sp.length ? '#b45309' : '#15803d' }}>({h.kode_c_tanpa_sp.length})</span></div>
            <div style={{ fontSize: 12, color: '#888' }}>Kelompok customer yang belum ditentukan siapa salesperson pemegangnya. Isi yang paling atas dulu (penjualan terbesar).</div>
          </div>
          {h.kode_c_tanpa_sp.length > 0 && <button style={btn} onClick={() => goTab('csp')}>Isi di tab Kode C → Salesperson →</button>}
        </div>
        {h.kode_c_tanpa_sp.length > 0 && (
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
            <thead><tr><th style={th}>Kode C</th><th style={th}>Jumlah customer</th><th style={th}>Penjualan</th></tr></thead>
            <tbody>{h.kode_c_tanpa_sp.map(c => (
              <tr key={c.kode_c}><td style={{ ...td, fontWeight: 600 }}>{c.kode_c}</td><td style={td}>{c.n_customer}</td><td style={td}>{formatRupiahShort(c.revenue)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 20 }}>
        <div style={{ flex: '1 1 360px' }}>
          <div style={{ fontWeight: 700 }}>Nama sales baru di nota <span style={{ color: '#888' }}>({h.slp_name_baru.length})</span></div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Nama yang muncul di data penjualan tapi belum terdaftar di daftar salesperson resmi. Sekadar pengingat.</div>
          <div style={{ fontSize: 12, color: '#555' }}>{h.slp_name_baru.length ? h.slp_name_baru.slice(0, 15).map(s => s.slp_name).join(', ') : '— tidak ada —'}</div>
        </div>
        <div style={{ flex: '1 1 360px' }}>
          <div style={{ fontWeight: 700 }}>Nama di mapping yang tak cocok daftar resmi <span style={{ color: '#d31137' }}>({h.mapping_sp_tak_dikenal.length})</span></div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Ejaan nama yang kamu isi tidak sama dengan daftar salesperson resmi — samakan supaya target & lama-kerjanya tersambung.</div>
          <div style={{ fontSize: 12, color: '#555' }}>{h.mapping_sp_tak_dikenal.length ? h.mapping_sp_tak_dikenal.join(', ') : '— tidak ada —'}</div>
        </div>
      </div>
    </div>
  )
}
