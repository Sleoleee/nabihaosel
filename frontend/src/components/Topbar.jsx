import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Sales Command Center', icon: '📊' },
  { to: '/customers', label: 'Customer Dashboard', icon: '👥' },
]

export default function Topbar() {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: '#1a1a1a', height: 56,
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 32,
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    }}>
      {/* Logo / Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <img src="/logo.png" alt="Logo" style={{ height: 28, objectFit: 'contain' }}
          onError={e => { e.target.style.display = 'none' }} />
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Sales Analytics
        </span>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 16px', borderRadius: 8,
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.6)',
              background: isActive ? '#d31137' : 'transparent',
              textDecoration: 'none', fontSize: 13.5, fontWeight: 500,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            })}
          >
            <span style={{ fontSize: 14 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Upload link */}
      <NavLink to="/upload"
        style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 14px', borderRadius: 8, flexShrink: 0,
          color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)',
          background: isActive ? '#d31137' : 'rgba(255,255,255,0.06)',
          textDecoration: 'none', fontSize: 13, fontWeight: 500,
          border: '1px solid rgba(255,255,255,0.1)',
        })}
      >
        <span style={{ fontSize: 13 }}>📤</span>
        Upload Data
      </NavLink>
    </header>
  )
}
