import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getMappingHealth } from '../utils/api'
import { formatRupiahShort } from '../utils/format'

export default function KesehatanDataPage() {
  const [h, setH] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { getMappingHealth().then(setH).catch(() => setErr('Gagal memuat. Pastikan backend ter-deploy.')) }, [])

  if (err) return <div style={{ padding: 24, color: '#d31137' }}>{err}</div>
  if (!h) return <div style={{ padding: 24, color: '#888' }}>Memuat…</div>

  const r = h.ringkas
  const unheldPct = r.tanpa_pemegang.pct
  const gateOk = unheldPct < 2 && (h.kode_c_tanpa_sp?.length || 0) === 0
  const card = { border: '1px solid #e5e5e5', borderRadius: 10, padding: 16, flex: '1 1 220px' }
  const th = { padding: '6px 8px', background: '#f4f4f5', fontSize: 12, textAlign: 'left' }
  const td = { padding: '5px 8px', borderBottom: '1px solid #eee', fontSize: 12 }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Kesehatan Data — Atribusi Salesperson</h1>
      <p style={{ color: '#666', fontSize: 13, maxWidth: 780 }}>
        Transaksi = anchor. Halaman ini memindai apa yang ada di transaksi tapi belum punya pasangan di mapping.
        Isi gap-nya sebelum atribusi dipindah ke basis Kode C (Fase 3).
      </p>

      {/* Gate */}
      <div style={{ margin: '12px 0 18px', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        background: gateOk ? '#eefbf3' : '#fff7ed', color: gateOk ? '#047857' : '#b45309',
        border: `1px solid ${gateOk ? '#a7f3d0' : '#fed7aa'}` }}>
        {gateOk
          ? '✓ Siap flip: revenue "Tanpa pemegang" < 2% dan semua Kode C punya salesperson.'
          : `⚠ Belum siap flip: "Tanpa pemegang" ${unheldPct}% (target < 2%)${h.kode_c_tanpa_sp?.length ? `, ${h.kode_c_tanpa_sp.length} Kode C belum ada salesperson` : ''}.`}
      </div>

      {/* Ringkas */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ ...card, background: '#f0fdf4' }}>
          <div style={{ fontSize: 12, color: '#047857' }}>Teratribusi</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{r.teratribusi.pct}%</div>
          <div style={{ fontSize: 12, color: '#666' }}>{r.teratribusi.n} customer · {formatRupiahShort(r.teratribusi.revenue)}</div>
        </div>
        <div style={{ ...card, background: '#fff7ed' }}>
          <div style={{ fontSize: 12, color: '#b45309' }}>Tanpa pemegang (perlu diisi)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{r.tanpa_pemegang.pct}%</div>
          <div style={{ fontSize: 12, color: '#666' }}>{r.tanpa_pemegang.n} customer · {formatRupiahShort(r.tanpa_pemegang.revenue)}</div>
        </div>
        <div style={{ ...card, background: '#f8fafc' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Non-sales (wajar)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{r.non_sales_wajar.pct}%</div>
          <div style={{ fontSize: 12, color: '#666' }}>{r.non_sales_wajar.n} customer · Non Trade / BLANKS</div>
        </div>
      </div>

      {/* Customer tanpa C */}
      <Section title="Customer tanpa Kode C"
        desc="Ada di transaksi tapi belum punya Kode C (master belum di-update)."
        count={h.customer_tanpa_c.n} impact={`${h.customer_tanpa_c.pct}% revenue`}
        action={<Link to="/settings/mapping" style={linkBtn}>Isi di grid Customer→Kode C →</Link>} />

      {/* Kode C tanpa salesperson */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Kode C tanpa salesperson <span style={{ color: '#b45309' }}>({h.kode_c_tanpa_sp.length})</span></div>
            <div style={{ fontSize: 12, color: '#888' }}>Kode C (slot sales) yang belum ditetapkan salesperson-nya.</div>
          </div>
          <Link to="/settings/mapping" style={linkBtn}>Isi di Kode C→Salesperson →</Link>
        </div>
        {h.kode_c_tanpa_sp.length > 0 && (
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
            <thead><tr><th style={th}>Kode C</th><th style={th}>Jumlah customer</th><th style={th}>Revenue</th></tr></thead>
            <tbody>{h.kode_c_tanpa_sp.map(c => (
              <tr key={c.kode_c}><td style={{ ...td, fontWeight: 600 }}>{c.kode_c}</td><td style={td}>{c.n_customer}</td><td style={td}>{formatRupiahShort(c.revenue)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {/* SlpName baru & mapping tak dikenal */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 20 }}>
        <div style={{ flex: '1 1 360px' }}>
          <div style={{ fontWeight: 700 }}>SlpName baru (belum di sp_master) <span style={{ color: '#888' }}>({h.slp_name_baru.length})</span></div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Nama di transaksi yang belum terdaftar — cross-check saja.</div>
          <div style={{ fontSize: 12, color: '#555' }}>
            {h.slp_name_baru.length ? h.slp_name_baru.slice(0, 15).map(s => s.slp_name).join(', ') : '— tidak ada —'}
          </div>
        </div>
        <div style={{ flex: '1 1 360px' }}>
          <div style={{ fontWeight: 700 }}>Salesperson di mapping ≠ sp_master <span style={{ color: '#d31137' }}>({h.mapping_sp_tak_dikenal.length})</span></div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Nama ini putus ke target/tenure — samakan ejaannya dgn sp_master.</div>
          <div style={{ fontSize: 12, color: '#555' }}>
            {h.mapping_sp_tak_dikenal.length ? h.mapping_sp_tak_dikenal.join(', ') : '— tidak ada —'}
          </div>
        </div>
      </div>
    </div>
  )
}

const linkBtn = { fontSize: 12, fontWeight: 600, color: '#fff', background: '#C00000', padding: '6px 12px', borderRadius: 6, textDecoration: 'none' }

function Section({ title, desc, count, impact, action }) {
  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 14, marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700 }}>{title} <span style={{ color: count ? '#b45309' : '#15803d' }}>({count})</span></div>
        <div style={{ fontSize: 12, color: '#888' }}>{desc} {impact && <b style={{ color: '#b45309' }}>· {impact}</b>}</div>
      </div>
      {count > 0 && action}
    </div>
  )
}
