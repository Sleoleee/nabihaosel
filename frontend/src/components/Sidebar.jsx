import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Overview', icon: '📊' },
  { to: '/customers', label: 'Customer Intelligence', icon: '👥' },
  { to: '/products', label: 'Produk & Kategori', icon: '🛍️' },
  { to: '/sales', label: 'Sales Performance', icon: '🏆' },
  { to: '/discounts', label: 'Discount & Pricing', icon: '🏷️' },
]

export default function Sidebar() {
  return (
    <aside style={{
      width: 220, minHeight: '100vh', background: '#1a1a1a',
      display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 100,
    }}>
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <img src="/logo.png" alt="Logo" style={{ height: 36, maxWidth: '100%', objectFit: 'contain' }}
          onError={e => { e.target.style.display = 'none' }} />
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Sales Analytics
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.65)',
              background: isActive ? '#d31137' : 'transparent',
              textDecoration: 'none', fontSize: 13.5, fontWeight: 500,
              transition: 'all 0.15s',
            })}
          >
            <span style={{ fontSize: 15 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '8px' }}>
        <NavLink to="/upload"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8,
            color: isActive ? '#ffffff' : 'rgba(255,255,255,0.65)',
            background: isActive ? '#d31137' : 'transparent',
            textDecoration: 'none', fontSize: 13.5, fontWeight: 500,
            transition: 'all 0.15s',
          })}
        >
          <span style={{ fontSize: 15 }}>📤</span>
          Upload Data
        </NavLink>
      </div>
    </aside>
  )
}
