import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import { getPosAchievement } from '../utils/api'
import { formatRupiah, formatRupiahShort } from '../utils/format'

const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const pctColor = (p) => (p == null ? '#999' : p >= 100 ? '#15803d' : p >= 80 ? '#d08700' : '#d31137')

export default function PosAchievementPage() {
  const [year, setYear] = useState(2026)
  const [data, setData] = useState(null)
  const [mode, setMode] = useState('pos')   // pos | orang
  const [sel, setSel] = useState(null)       // kode_c terpilih utk chart
  const [err, setErr] = useState('')

  useEffect(() => { setData(null); setErr(''); setSel(null)
    getPosAchievement({ year }).then(setData).catch(() => setErr('Gagal memuat. Pastikan backend ter-update & mapping terisi.')) }, [year])

  const th = { padding: '7px 9px', background: '#f4f4f5', fontSize: 11.5, textAlign: 'left', color: '#555', position: 'sticky', top: 0 }
  const td = { padding: '6px 9px', borderBottom: '1px solid #f0f0f0', fontSize: 12.5 }

  const selPos = data?.pos?.find(p => p.kode_c === sel)
  const chartData = selPos ? selPos.months.map(m => ({ name: MN[m.bulan], Revenue: m.revenue, Target: m.target, holder: m.holder, bulan: m.bulan })) : []

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Pencapaian per Pos (Kode C) & per Orang</h1>
          <p style={{ color: '#666', fontSize: 13, maxWidth: 820, margin: '2px 0 0' }}>
            Target menempel ke <b>pos (Kode C)</b>. Pencapaian pos berjalan terus walau salesperson-nya berganti;
            tiap orang juga punya angkanya sendiri selama memegang. Penanda di grafik = bulan terjadi pergantian.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6 }}>
            {[2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <div style={{ display: 'flex', border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
            {[['pos', 'Per Pos'], ['orang', 'Per Orang']].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: '6px 16px', fontSize: 12.5, border: 'none', cursor: 'pointer', fontWeight: 600, background: mode === m ? '#d31137' : '#fff', color: mode === m ? '#fff' : '#666' }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {err && <div style={{ color: '#d31137', marginTop: 16 }}>{err}</div>}
      {!data && !err && <div style={{ color: '#888', marginTop: 16 }}>Memuat…</div>}

      {data && mode === 'pos' && (
        <div style={{ marginTop: 16 }}>
          {/* chart pos terpilih */}
          {selPos && (
            <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700 }}>{selPos.kode_c} · {selPos.salesperson_now || '—'}
                  <span style={{ fontWeight: 400, color: '#888', fontSize: 12 }}> — revenue {formatRupiahShort(selPos.total_revenue)} / target {formatRupiahShort(selPos.total_target)} = </span>
                  <span style={{ color: pctColor(selPos.pct), fontWeight: 700 }}>{selPos.pct != null ? `${selPos.pct}%` : '—'}</span>
                </div>
                <button onClick={() => setSel(null)} style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer' }}>tutup ✕</button>
              </div>
              {selPos.changes.length > 0 && <div style={{ fontSize: 11.5, color: '#b45309', margin: '4px 0' }}>
                Pergantian: {selPos.changes.map(c => `${MN[c.bulan]}: ${c.dari}→${c.ke}`).join(' · ')}
              </div>}
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#aaa' }} tickFormatter={v => formatRupiahShort(v)} width={54} />
                  <Tooltip formatter={(v) => formatRupiah(v)} labelStyle={{ fontWeight: 600 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Revenue" fill="#d31137" radius={[3, 3, 0, 0]} maxBarSize={34} />
                  <Line dataKey="Target" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                  {selPos.changes.map(c => (
                    <ReferenceLine key={c.bulan} x={MN[c.bulan]} stroke="#b45309" strokeDasharray="4 3"
                      label={{ value: `↹ ${c.ke}`, position: 'top', fontSize: 10, fill: '#b45309' }} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ maxHeight: 520, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Kode C', 'Pemegang sekarang', 'Revenue', 'Target', 'Pencapaian', 'Ganti?'].map((h, i) =>
                  <th key={h} style={{ ...th, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.pos.map(p => (
                    <tr key={p.kode_c} onClick={() => setSel(p.kode_c)}
                      style={{ cursor: 'pointer', background: sel === p.kode_c ? '#fdf2f4' : 'transparent' }}>
                      <td style={{ ...td, fontWeight: 600, color: '#d31137' }}>{p.kode_c}</td>
                      <td style={td}>{p.salesperson_now || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{formatRupiahShort(p.total_revenue)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#888' }}>{p.total_target ? formatRupiahShort(p.total_target) : '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: pctColor(p.pct) }}>{p.pct != null ? `${p.pct}%` : '—'}</td>
                      <td style={td}>{p.changes.length ? <span style={{ fontSize: 11, color: '#b45309' }}>● {p.changes.length}×</span> : ''}</td>
                    </tr>
                  ))}
                  {!data.pos.length && <tr><td style={td} colSpan={6}>Belum ada data. Isi mapping Kode C → Salesperson & target dulu.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 6 }}>Klik baris untuk lihat grafik bulanan + penanda pergantian.</div>
        </div>
      )}

      {data && mode === 'orang' && (
        <div style={{ marginTop: 16, border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Salesperson', 'Revenue (saat memegang)', 'Target (porsi)', 'Pencapaian', 'Pos dipegang'].map((h, i) =>
              <th key={h} style={{ ...th, textAlign: i >= 1 && i <= 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {data.persons.map(p => (
                <tr key={p.slp_name}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.slp_name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{formatRupiahShort(p.revenue)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#888' }}>{p.target ? formatRupiahShort(p.target) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: pctColor(p.pct) }}>{p.pct != null ? `${p.pct}%` : '—'}</td>
                  <td style={{ ...td, fontSize: 11.5, color: '#666' }}>{p.pos.join(', ')}</td>
                </tr>
              ))}
              {!data.persons.length && <tr><td style={td} colSpan={5}>Belum ada data.</td></tr>}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: '#999', padding: '6px 9px' }}>
            Angka per orang = revenue selama dia memegang pos; target = porsi target pos pada bulan-bulan itu.
          </div>
        </div>
      )}
    </div>
  )
}
