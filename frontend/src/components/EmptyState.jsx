export default function EmptyState({ message = 'Tidak ada data untuk periode ini.' }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <div style={{ fontSize: 15 }}>{message}</div>
    </div>
  )
}
