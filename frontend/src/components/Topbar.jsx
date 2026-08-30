import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/Auth'

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/sales', label: 'Sales Performance' },
  { to: '/customers', label: 'Customer Dashboard' },
  { to: '/products', label: 'Product Opportunity' },
  { to: '/territory', label: 'Territory' },
]

export default function Topbar() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
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
      <div ref={ref} style={{ marginLeft: 'auto', position: 'relative' }}>
        <button onClick={() => setOpen(o => !o)} style={{
          padding: '6px 12px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
          color: 'rgba(255,255,255,0.7)', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)',
        }}>
          ⚙ Setting ▾
        </button>
        {open && (
          <div style={{
            position: 'absolute', top: 40, right: 0, background: '#fff', borderRadius: 10,
            boxShadow: '0 12px 34px rgba(0,0,0,0.22)', minWidth: 210, overflow: 'hidden', zIndex: 200,
          }}>
            {[
              { to: '/settings/groups', label: 'Grup Salesperson', desc: 'Atur SPV / grup per tahun' },
              { to: '/settings/targets', label: 'Target Penjualan', desc: 'Target per orang per tahun' },
            ].map(it => (
              <NavLink key={it.to} to={it.to} onClick={() => setOpen(false)}
                style={{ display: 'block', padding: '10px 14px', textDecoration: 'none', color: '#2d2d2d', borderBottom: '1px solid #f4f4f5' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{it.desc}</div>
              </NavLink>
            ))}
          </div>
        )}
      </div>
      <NavLink to="/upload" style={({ isActive }) => ({
        marginLeft: 10, padding: '6px 12px', borderRadius: 7, fontSize: 12.5,
        color: isActive ? '#fff' : 'rgba(255,255,255,0.45)', textDecoration: 'none',
        border: '1px solid rgba(255,255,255,0.15)',
      })}>
        📤 Upload Data
      </NavLink>
      {user && (
        <button onClick={logout} title={`Keluar (${user.username})`} style={{
          marginLeft: 10, padding: '6px 12px', borderRadius: 7, fontSize: 12.5,
          color: 'rgba(255,255,255,0.55)', background: 'transparent', cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.15)',
        }}>
          Keluar
        </button>
      )}
    </header>
  )
}
