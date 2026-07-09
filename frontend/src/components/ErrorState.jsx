export default function ErrorState({ message, onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <div style={{ marginBottom: 16, color: 'var(--color-text)' }}>{message || 'Terjadi kesalahan'}</div>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: 'var(--color-primary)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14,
        }}>
          Coba Lagi
        </button>
      )}
    </div>
  )
}
