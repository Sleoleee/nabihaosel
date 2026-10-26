import { useState } from 'react'
import { exportReport } from '../utils/api'

const CHANNELS = ['E-Commerce', 'SUKSES JAYA', 'NAMI', 'BLOOMIE', 'K25', 'OTHER CHANNEL']

const REPORTS = [
  { id: 'salesperson', judul: 'Salesperson Performance', ikon: '🏆',
    desc: 'Ringkasan per salesperson (Revenue, Target, % Achieve, Gap, Bills, AOV) + detail SP × Customer × Bulan.', aktif: true },
  { id: 'customer', judul: 'Customer Performance', ikon: '👥',
    desc: 'Ringkasan per customer (status, tier, grup induk) + detail Customer × Kategori × Bulan.', aktif: true },
  { id: 'product', judul: 'Product Performance', ikon: '🛍️',
    desc: 'Ringkasan per kategori (growth, penetrasi) + detail SKU × Bulan + peluang cross-sell.', aktif: false },
  { id: 'kpi', judul: 'KPI Manager', ikon: '📑',
    desc: 'Template KPI dengan kolom Realisasi terisi otomatis dari data penjualan.', aktif: false },
]

// kuartal/bulan helper
function ym(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function ReportCenterPage() {
  const now = new Date(2026, 8, 1) // default fokus data (Sep 2026); pengguna bisa ubah
  const [dari, setDari] = useState('2026-01')
  const [sampai, setSampai] = useState(ym(now))
  const [channels, setChannels] = useState([])
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')

  const quick = (jenis) => {
    const d = new Date(2026, 8, 1)
    if (jenis === 'bulan') { setDari(ym(d)); setSampai(ym(d)) }
    if (jenis === '3bulan') { const s = new Date(2026, 6, 1); setDari(ym(s)); setSampai(ym(d)) }
    if (jenis === 'ytd') { setDari(`${d.getFullYear()}-01`); setSampai(ym(d)) }
    if (jenis === 'lalu') { setDari('2025-01'); setSampai('2025-12') }
  }

  const toggleCh = (c) =>
    setChannels(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  const download = async (rpt) => {
    if (!rpt.aktif) return
    setErr(''); setBusy(rpt.id)
    try {
      const params = { dari, sampai }
      if (channels.length) params.channel = channels.join(',')
      const res = await exportReport(rpt.id, params)
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      const m = (res.headers['content-disposition'] || '').match(/filename="(.+)"/)
      a.href = url; a.download = m ? m[1] : `${rpt.id}.xlsx`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e?.response?.status === 413
        ? 'File terlalu besar — persempit periode atau channel.'
        : 'Gagal membuat report. Coba lagi atau persempit filter.')
    } finally { setBusy(null) }
  }

  const card = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 18 }
  const btn = { padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 12 }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Report Center</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        Pilih periode & filter, lalu unduh report Excel. Semua angka dari dashboard yang sama —
        tinggal buka dan pilih-pilih via AutoFilter di tiap kolom.
      </p>

      {/* panel filter */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12 }}>Dari<br />
            <input type="month" value={dari} min="2025-01" max="2026-12"
              onChange={e => setDari(e.target.value)} style={{ padding: 6 }} /></label>
          <label style={{ fontSize: 12 }}>Sampai<br />
            <input type="month" value={sampai} min="2025-01" max="2026-12"
              onChange={e => setSampai(e.target.value)} style={{ padding: 6 }} /></label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btn} onClick={() => quick('bulan')}>Bulan Ini</button>
            <button style={btn} onClick={() => quick('3bulan')}>3 Bulan Terakhir</button>
            <button style={btn} onClick={() => quick('ytd')}>Year-to-Date</button>
            <button style={btn} onClick={() => quick('lalu')}>Tahun Lalu</button>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Channel (kosong = semua):</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CHANNELS.map(c => (
              <button key={c} onClick={() => toggleCh(c)}
                style={{ ...btn, background: channels.includes(c) ? '#C00000' : '#fff',
                         color: channels.includes(c) ? '#fff' : '#333' }}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {err && <div style={{ color: '#C00000', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {/* kartu report */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
        {REPORTS.map(r => (
          <div key={r.id} style={{ ...card, opacity: r.aktif ? 1 : 0.6 }}>
            <div style={{ fontSize: 26 }}>{r.ikon}</div>
            <div style={{ fontWeight: 700, fontSize: 15, margin: '6px 0' }}>{r.judul}</div>
            <div style={{ fontSize: 12, color: '#666', minHeight: 48 }}>{r.desc}</div>
            <button onClick={() => download(r)} disabled={!r.aktif || busy === r.id}
              style={{ ...btn, marginTop: 10, width: '100%', padding: '9px 0', fontWeight: 600,
                       background: r.aktif ? '#C00000' : '#eee', color: r.aktif ? '#fff' : '#999',
                       cursor: r.aktif ? 'pointer' : 'not-allowed' }}>
              {busy === r.id ? 'Membuat…' : (r.aktif ? '⬇ Download Excel' : 'Segera')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
