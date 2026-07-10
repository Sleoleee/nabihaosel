import { NavLink } from 'react-router-dom'

export default function Topbar() {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: '#1a1a1a', height: 54,
      display: 'flex', alignItems: 'center',
      padding: '0 28px', gap: 0,
    }}>
      <span style={{
        color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600,
        letterSpacing: '0.03em', marginRight: 28, whiteSpace: 'nowrap',
      }}>
        Sales Analytics
      </span>

      <nav style={{ display: 'flex', gap: 2 }}>
        {[
          { to: '/', label: 'Sales Command Center' },
          { to: '/customers', label: 'Customer Dashboard' },
        ].map(({ to, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              padding: '6px 18px', borderRadius: 7,
              color: isActive ? '#fff' : 'rgba(255,255,255,0.52)',
              background: isActive ? '#d31137' : 'transparent',
              textDecoration: 'none', fontSize: 13.5, fontWeight: 500,
              letterSpacing: '0.01em',
            })}
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
