import { useState, useEffect } from 'react'
import Card from '../components/Card'
import Skeleton from '../components/Skeleton'
import { formatRupiah } from '../utils/format'
import { getQaReconcile } from '../utils/api'

export default function QaPage() {
  const [rows, setRows] = useState(null)
  useEffect(() => { getQaReconcile().then(setRows).catch(()=>setRows([])) }, [])
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div><div style={{ fontSize:20, fontWeight:700 }}>QA — Rekonsiliasi Lintas Sumber</div>
        <div style={{ fontSize:13, color:'#666' }}>Total revenue harus sama dari agregat kategori, customer, dan salesperson (toleransi 0,01%).</div></div>
      <Card style={{ padding:16 }}>
        {!rows ? <Skeleton height={180}/> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead><tr style={{ borderBottom:'2px solid #f0f0f0' }}>{['Filter','Σ Kategori','Σ Customer','Σ Salesperson','Selisih maks','Status'].map(h=><th key={h} style={{ padding:'7px 10px', textAlign:h==='Filter'?'left':'right', color:'#888', fontSize:11, fontWeight:600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid #f5f5f5' }}>
                    <td style={{ padding:'7px 10px', fontWeight:600 }}>{r.filter}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right' }}>{formatRupiah(r.category)}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right' }}>{formatRupiah(r.customer)}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right' }}>{formatRupiah(r.salesperson)}</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', color:'#888' }}>{r.max_diff_pct}%</td>
                    <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:r.status==='LOLOS'?'#15803d':'#d31137' }}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div style={{ fontSize:11.5, color:'#888' }}>
        Catatan: RFM, tier, interval, revenue-at-risk, growth dihitung SEKALI di lapisan cache (compute_cache / build_analytics) — frontend tidak menghitung ulang. Kategori memakai kolom <b>Kategori</b> (bukan U_Kategori); customer dikunci pada <b>Customer/Vendor_Code</b>; Quantity tidak dijumlah lintas SKU.
      </div>
    </div>
  )
}
