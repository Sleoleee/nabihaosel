export default function Card({ children, style = {} }) {
  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      padding: 24,
      ...style,
    }}>
      {children}
    </div>
  )
}
