import Card from '../components/Card'

export default function ScaffoldPage({ title, question, prompt }) {
  return (
    <Card style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#666', maxWidth: 620, margin: '0 auto 16px' }}>{question}</div>
      <div style={{ display: 'inline-block', background: '#fff8f0', border: '1px dashed #d31137',
        borderRadius: 10, padding: '12px 20px', fontSize: 12.5, color: '#9a3412' }}>
        Halaman ini akan dibangun penuh di <b>{prompt}</b>. Filter global &amp; lapisan data sudah siap.
      </div>
    </Card>
  )
}
