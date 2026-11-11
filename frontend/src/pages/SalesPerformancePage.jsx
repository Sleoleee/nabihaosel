import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import { getPosAchievement } from '../utils/api'
import { formatRupiah, formatRupiahShort } from '../utils/format'

const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const ac = (p) => (p == null ? '#999' : p >= 100 ? '#15803d' : p >= 80 ? '#d08700' : '#d31137')

function csv(rows, name) {
  if (!rows?.length) return
  const cols = Object.keys(rows[0]); const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const c = [cols.join(','), ...rows.map(r => cols.map(k => esc(r[k])).join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + c], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}

export default function SalesPerformancePage() {
  const [year, setYear] = useState(2026)
  const [data, setData] = useState(null)
  const [mode, setMode] = useState('spv')   // spv | orang | pos
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { setData(null); setErr(''); setSel(null)
    getPosAchievement({ year }).then(setData).catch(() => setErr('Gagal memuat. Pastikan backend ter-update & mapping terisi.')) }, [year])

  const th = { padding: '8px 10px', background: '#f4f4f5', fontSize: 11.5, textAlign: 'left', color: '#555', position: 'sticky', top: 0 }
  const td = { padding: '7px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }
  const selPos = data?.pos?.find(p => p.kode_c === sel)
  const chartData = selPos ? selPos.months.map(m => ({ name: MN[m.bulan], Revenue: m.revenue, Target: m.target })) : []

  const Pct = ({ p }) => <span style={{ fontWeight: 700, color: ac(p) }}>{p != null ? `${p}%` : '—'}</span>

  return (
    <div style={{ padding: 24, maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Sales Performance</h1>
          <p style={{ color: '#666', fontSize: 13, maxWidth: 820, margin: '2px 0 0' }}>
            Berbasis <b>mapping Kode C</b>: target menempel ke pos, pencapaian jalan terus walau pemegang ganti.
            Yang belum dipetakan (2025, non-K25) tampil sebagai belum ada pemegang.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6 }}>
            {[2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <div style={{ display: 'flex', border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
            {[['spv', 'Per SPV'], ['orang', 'Per Salesperson'], ['pos', 'Per Pos']].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: '6px 16px', fontSize: 12.5, border: 'none', cursor: 'pointer', fontWeight: 600, background: mode === m ? '#d31137' : '#fff', color: mode === m ? '#fff' : '#666' }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {err && <div style={{ color: '#d31137', marginTop: 16 }}>{err}</div>}
      {!data && !err && <div style={{ color: '#888', marginTop: 16 }}>Memuat…</div>}

      {data && (
        <div style={{ marginTop: 16 }}>
          {mode === 'spv' && (
            <Table cols={['SPV', 'Revenue', 'Target', 'Pencapaian', 'Pos']} right={[1, 2, 3]}
              rows={data.spvs} dl={() => csv(data.spvs.map(s => ({ spv: s.spv, revenue: s.revenue, target: s.target, pct: s.pct, pos: s.pos.join(' ') })), `spv_${year}.csv`)}
              render={(s) => (<>
                <td style={td}><b>{s.spv}</b></td>
                <td style={{ ...td, textAlign: 'right' }}>{formatRupiahShort(s.revenue)}</td>
                <td style={{ ...td, textAlign: 'right', color: '#888' }}>{s.target ? formatRupiahShort(s.target) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}><Pct p={s.pct} /></td>
                <td style={{ ...td, fontSize: 11.5, color: '#666' }}>{s.pos.join(', ')}</td>
              </>)} th={th} td={td} />
          )}

          {mode === 'orang' && (
            <Table cols={['Salesperson', 'Revenue', 'Target (porsi)', 'Pencapaian', 'Pos dipegang']} right={[1, 2, 3]}
              rows={data.persons} dl={() => csv(data.persons.map(s => ({ salesperson: s.slp_name, revenue: s.revenue, target: s.target, pct: s.pct, pos: s.pos.join(' ') })), `salesperson_${year}.csv`)}
              render={(s) => (<>
                <td style={td}><b>{s.slp_name}</b></td>
                <td style={{ ...td, textAlign: 'right' }}>{formatRupiahShort(s.revenue)}</td>
                <td style={{ ...td, textAlign: 'right', color: '#888' }}>{s.target ? formatRupiahShort(s.target) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}><Pct p={s.pct} /></td>
                <td style={{ ...td, fontSize: 11.5, color: '#666' }}>{s.pos.join(', ')}</td>
              </>)} th={th} td={td} />
          )}

          {mode === 'pos' && (<>
            {selPos && (
              <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{selPos.kode_c} · {selPos.salesperson_now || '—'} · <span style={{ color: '#888', fontWeight: 400 }}>{selPos.spv_now || '—'}</span>
                    <span style={{ fontWeight: 400, color: '#888', fontSize: 12 }}> — {formatRupiahShort(selPos.total_revenue)} / {formatRupiahShort(selPos.total_target)} = </span><Pct p={selPos.pct} /></div>
                  <button onClick={() => setSel(null)} style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer' }}>tutup ✕</button>
                </div>
                {(selPos.changes.length > 0 || selPos.spv_changes.length > 0) && <div style={{ fontSize: 11.5, color: '#b45309', margin: '4px 0' }}>
                  {selPos.changes.map(c => `${MN[c.bulan]}: sales ${c.dari}→${c.ke}`).concat(selPos.spv_changes.map(c => `${MN[c.bulan]}: SPV ${c.dari}→${c.ke}`)).join(' · ')}
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
                      <ReferenceLine key={'s' + c.bulan} x={MN[c.bulan]} stroke="#b45309" strokeDasharray="4 3"
                        label={{ value: `↹ ${c.ke}`, position: 'top', fontSize: 10, fill: '#b45309' }} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <Table cols={['Kode C', 'Salesperson', 'SPV', 'Revenue', 'Target', 'Pencapaian', 'Ganti?']} right={[3, 4, 5]}
              rows={data.pos} dl={() => csv(data.pos.map(p => ({ kode_c: p.kode_c, salesperson: p.salesperson_now || '', spv: p.spv_now || '', revenue: p.total_revenue, target: p.total_target, pct: p.pct })), `pos_${year}.csv`)}
              rowClick={p => setSel(p.kode_c)} selKey={sel} keyOf={p => p.kode_c}
              render={(p) => (<>
                <td style={{ ...td, fontWeight: 600, color: '#d31137' }}>{p.kode_c}</td>
                <td style={td}>{p.salesperson_now || '—'}</td>
                <td style={{ ...td, color: '#666' }}>{p.spv_now || '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{formatRupiahShort(p.total_revenue)}</td>
                <td style={{ ...td, textAlign: 'right', color: '#888' }}>{p.total_target ? formatRupiahShort(p.total_target) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}><Pct p={p.pct} /></td>
                <td style={td}>{(p.changes.length + p.spv_changes.length) ? <span style={{ fontSize: 11, color: '#b45309' }}>● {p.changes.length + p.spv_changes.length}×</span> : ''}</td>
              </>)} th={th} td={td} />
            <div style={{ fontSize: 11.5, color: '#999', marginTop: 6 }}>Klik baris pos untuk lihat grafik bulanan + penanda pergantian sales/SPV.</div>
          </>)}
        </div>
      )}
    </div>
  )
}

function Table({ cols, right = [], rows, render, dl, rowClick, selKey, keyOf, th, td }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button onClick={dl} style={{ padding: '5px 12px', fontSize: 12, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>⬇ CSV</button>
      </div>
      <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ maxHeight: 540, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{cols.map((h, i) => <th key={h} style={{ ...th, textAlign: right.includes(i) ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} onClick={rowClick ? () => rowClick(r) : undefined}
                  style={{ cursor: rowClick ? 'pointer' : 'default', background: (selKey != null && keyOf && keyOf(r) === selKey) ? '#fdf2f4' : 'transparent' }}>
                  {render(r)}
                </tr>
              ))}
              {!rows.length && <tr><td style={td} colSpan={cols.length}>Belum ada data. Lengkapi mapping (Kode C → Salesperson / SPV / Target).</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
