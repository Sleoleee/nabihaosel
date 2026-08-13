import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/sales', label: 'Sales Performance' },
  { to: '/customers', label: 'Customer Dashboard' },
  { to: '/products', label: 'Product Opportunity' },
]

export default function Topbar() {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: '#1a1a1a', height: 54, display: 'flex', alignItems: 'center',
      padding: '0 28px', gap: 0,
    }}>
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600, letterSpacing: '0.03em', marginRight: 28, whiteSpace: 'nowrap' }}>
        Sales Analytics
      </span>
      <nav style={{ display: 'flex', gap: 2 }}>
        {NAV.map(({ to, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              padding: '6px 16px', borderRadius: 7,
              color: isActive ? '#fff' : 'rgba(255,255,255,0.52)',
              background: isActive ? '#d31137' : 'transparent',
              textDecoration: 'none', fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap',
            })}>
            {label}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/upload" style={({ isActive }) => ({
        marginLeft: 'auto', padding: '6px 12px', borderRadius: 7, fontSize: 12.5,
        color: isActive ? '#fff' : 'rgba(255,255,255,0.45)', textDecoration: 'none',
        border: '1px solid rgba(255,255,255,0.15)',
      })}>
        📤 Upload Data
      </NavLink>
    </header>
  )
}
