import { useState, useEffect, useRef } from 'react'
import Card from '../components/Card'
import { checkYears, uploadFile, getUploadHistory } from '../utils/api'

export default function Upload() {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const [pendingMode, setPendingMode] = useState(null) // {file, existingYears}
  const inputRef = useRef()

  const loadHistory = () => {
    getUploadHistory().then(setHistory).catch(() => {})
  }

  useEffect(() => { loadHistory() }, [])

  const handleFile = async (f) => {
    if (!f || !f.name.endsWith('.xlsx')) {
      setError('Hanya file .xlsx yang diizinkan')
      return
    }
    setFile(f)
    setError(null)
    setResult(null)

    // We don't know years until we upload — just start upload with mode=upsert
    // but first give user the option
    setPendingMode({ file: f, existingYears: [] })
  }

  const doUpload = async (mode) => {
    const f = pendingMode?.file || file
    if (!f) return
    setUploading(true)
    setProgress(10)
    setPendingMode(null)

    const timer = setInterval(() => setProgress(p => Math.min(p + 10, 85)), 300)
    try {
      const res = await uploadFile(f, mode)
      setProgress(100)
      setResult(res)
      loadHistory()
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Upload gagal')
    } finally {
      clearInterval(timer)
      setUploading(false)
      setFile(null)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Upload Data</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Upload file Excel dengan sheet "sales detail YYYY"</p>
      </div>

      <Card>
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#d31137' : 'var(--color-border)'}`,
            borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? '#fde3e9' : '#fafafa', transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Drag & drop file Excel di sini</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>atau klik untuk memilih file (.xlsx)</div>
          <input ref={inputRef} type="file" accept=".xlsx" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>

        {file && !uploading && !pendingMode && (
          <div style={{ marginTop: 16, padding: 16, background: '#f8f8f8', borderRadius: 8 }}>
            <span style={{ fontSize: 14 }}>File: <strong>{file.name}</strong></span>
          </div>
        )}

        {/* Pending — ask replace or append */}
        {pendingMode && (
          <div style={{ marginTop: 20, padding: 20, background: '#fde3e9', borderRadius: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>File: <span style={{ color: '#d31137' }}>{pendingMode.file.name}</span></div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Pilih mode import: <strong>Ganti</strong> akan menghapus data tahun yang sama sebelum import. <strong>Tambahkan</strong> akan menambahkan data tanpa menghapus yang lama.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => doUpload('replace')} style={{ padding: '10px 24px', borderRadius: 8, background: '#d31137', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Ganti</button>
              <button onClick={() => doUpload('append')} style={{ padding: '10px 24px', borderRadius: 8, background: '#fff', color: '#d31137', border: '2px solid #d31137', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Tambahkan</button>
              <button onClick={() => { setPendingMode(null); setFile(null) }} style={{ padding: '10px 24px', borderRadius: 8, background: '#fff', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: 14 }}>Batal</button>
            </div>
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>Memproses file...</span>
              <span style={{ fontSize: 13 }}>{progress}%</span>
            </div>
            <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4 }}>
              <div style={{ height: 8, width: `${progress}%`, background: '#d31137', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginTop: 16, padding: 16, background: '#fde3e9', borderRadius: 8, color: '#d31137', fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ marginTop: 16, padding: 20, background: '#f0fdf4', borderRadius: 12, border: '1px solid #86efac' }}>
            <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: 10, fontSize: 15 }}>✅ Upload berhasil!</div>
            <div style={{ display: 'flex', gap: 32, fontSize: 14 }}>
              <div><span style={{ color: 'var(--color-text-muted)' }}>Baris diimpor:</span> <strong>{result.imported?.toLocaleString('id-ID')}</strong></div>
              <div><span style={{ color: 'var(--color-text-muted)' }}>Baris dilewati:</span> <strong>{result.skipped?.toLocaleString('id-ID')}</strong></div>
              <div><span style={{ color: 'var(--color-text-muted)' }}>Tahun terdeteksi:</span> <strong>{result.years?.join(', ')}</strong></div>
            </div>
          </div>
        )}
      </Card>

      {/* Upload History */}
      <Card>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Riwayat Upload</h3>
        {!history.length ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Belum ada riwayat upload.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  {['Tanggal Upload', 'Nama File', 'Baris Import', 'Baris Lewati', 'Tahun', 'Mode'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fde3e9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {h.uploaded_at ? new Date(h.uploaded_at).toLocaleString('id-ID') : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>{h.filename}</td>
                    <td style={{ padding: '8px 10px' }}>{h.rows_imported?.toLocaleString('id-ID')}</td>
                    <td style={{ padding: '8px 10px' }}>{h.rows_skipped?.toLocaleString('id-ID')}</td>
                    <td style={{ padding: '8px 10px' }}>{h.years_covered?.join(', ')}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: h.replace_mode ? '#fde3e9' : '#f0fdf4', color: h.replace_mode ? '#d31137' : '#22c55e', fontWeight: 600 }}>
                        {h.replace_mode ? 'Ganti' : 'Tambah'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
