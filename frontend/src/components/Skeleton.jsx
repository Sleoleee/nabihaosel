export default function Skeleton({ height = 200, style = {} }) {
  return (
    <div className="skeleton" style={{ height, borderRadius: 8, ...style }} />
  )
}

export function SkeletonCard({ height = 120 }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <Skeleton height={height} />
    </div>
  )
}
