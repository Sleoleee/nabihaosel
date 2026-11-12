import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/Auth'

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/sales', label: 'Sales Performance' },
  { to: '/customers', label: 'Customer Dashboard' },
  { to: '/products', label: 'Product Opportunity' },
  { to: '/territory', label: 'Territory' },
  { to: '/reports', label: 'Report Center' },
]

export default function Topbar() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const loc = useLocation()
  const search = loc.search   // bawa filter global aktif saat pindah page
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
      <NavLink to={{ pathname: '/', search }} style={{ display: 'flex', alignItems: 'center', marginRight: 20, flexShrink: 0 }}>
        <img src="/sync-logo.png" alt="SYNC" style={{ height: 30, width: 'auto', display: 'block' }} />
      </NavLink>
      <nav style={{ display: 'flex', gap: 2, minWidth: 0, overflowX: 'auto', flexShrink: 1 }}>
        {NAV.map(({ to, label }) => (
          <NavLink key={to} to={{ pathname: to, search }} end={to === '/'}
            style={({ isActive }) => ({
              padding: '6px 13px', borderRadius: 7,
              color: isActive ? '#fff' : 'rgba(255,255,255,0.52)',
              background: isActive ? '#d31137' : 'transparent',
              textDecoration: 'none', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
            })}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div ref={ref} style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
        <button onClick={() => setOpen(o => !o)} style={{
          padding: '6px 12px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
          color: 'rgba(255,255,255,0.7)', background: 'transparent', whiteSpace: 'nowrap',
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
              { to: '/settings/mapping', label: 'Salesperson Pemegang Customer', desc: 'Atur Kode C, salesperson pemegang, SPV, target & pencapaian' },
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
        marginLeft: 10, padding: '6px 12px', borderRadius: 7, fontSize: 12.5, flexShrink: 0,
        whiteSpace: 'nowrap',
        color: isActive ? '#fff' : 'rgba(255,255,255,0.45)', textDecoration: 'none',
        border: '1px solid rgba(255,255,255,0.15)',
      })}>
        📤 Upload Data
      </NavLink>
      {user && (
        <button onClick={logout} title={`Keluar (${user.username})`} style={{
          marginLeft: 10, padding: '6px 12px', borderRadius: 7, fontSize: 12.5, flexShrink: 0,
          whiteSpace: 'nowrap',
          color: 'rgba(255,255,255,0.55)', background: 'transparent', cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.15)',
        }}>
          Keluar
        </button>
      )}
    </header>
  )
}
