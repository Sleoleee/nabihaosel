import { useState, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '../context/Auth'
import { BRAND_NAME, BRAND_TAGLINE } from '../config/auth'

/* ---------- SVG aksesori rambut (dekoratif, tema fashion) ---------- */
const Bow = ({ s = 1 }) => (
  <svg width={80 * s} height={80 * s} viewBox="0 0 80 80" fill="none">
    <path d="M40 40C40 40 20 22 12 28c-8 6-8 24 0 30 8 6 28-18 28-18Z" fill="#fff" fillOpacity=".9"/>
    <path d="M40 40C40 40 60 22 68 28c8 6 8 24 0 30-8 6-28-18-28-18Z" fill="#ffe3ea" fillOpacity=".92"/>
    <circle cx="40" cy="40" r="7" fill="#fc3961"/>
    <path d="M40 46c-4 10-6 22-4 30M40 46c4 10 6 22 4 30" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round"/>
  </svg>
)
const Flower = ({ s = 1 }) => (
  <svg width={70 * s} height={70 * s} viewBox="0 0 70 70" fill="none">
    {[0, 72, 144, 216, 288].map(a => (
      <ellipse key={a} cx="35" cy="16" rx="10" ry="17" fill="#fff" fillOpacity=".88"
        transform={`rotate(${a} 35 35)`} />
    ))}
    <circle cx="35" cy="35" r="9" fill="#fc617e"/>
  </svg>
)
const Clip = ({ s = 1 }) => (
  <svg width={90 * s} height={40 * s} viewBox="0 0 90 40" fill="none">
    <rect x="6" y="12" width="78" height="16" rx="8" fill="#fff" fillOpacity=".9"/>
    <rect x="14" y="16" width="62" height="3" rx="1.5" fill="#fc3961" fillOpacity=".6"/>
    <circle cx="16" cy="20" r="4" fill="#fc3961"/>
  </svg>
)
const Sparkle = ({ s = 1 }) => (
  <svg width={24 * s} height={24 * s} viewBox="0 0 24 24" fill="none">
    <path d="M12 0c1 6 5 10 11 12-6 2-10 6-11 12-1-6-5-10-11-12C7 10 11 6 12 0Z" fill="#fff"/>
  </svg>
)

const FLOATERS = [
  { C: Bow,     top: '12%', left: '10%', s: 1.1, rot: -12, dur: 9,  depth: 26 },
  { C: Flower,  top: '68%', left: '14%', s: 1.0, rot: 8,   dur: 11, depth: 40 },
  { C: Clip,    top: '24%', left: '80%', s: 1.0, rot: 16,  dur: 10, depth: 32 },
  { C: Bow,     top: '74%', left: '82%', s: 0.8, rot: 20,  dur: 8,  depth: 48 },
  { C: Flower,  top: '44%', left: '88%', s: 0.7, rot: -6,  dur: 12, depth: 20 },
  { C: Sparkle, top: '30%', left: '30%', s: 1.4, rot: 0,   dur: 6,  depth: 60 },
  { C: Sparkle, top: '60%', left: '60%', s: 1.0, rot: 0,   dur: 7,  depth: 54 },
  { C: Sparkle, top: '18%', left: '58%', s: 0.9, rot: 0,   dur: 9,  depth: 44 },
]

export default function LockPage() {
  const { login } = useAuth()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [par, setPar] = useState({ x: 0, y: 0 })
  const cardRef = useRef(null)

  // partikel yang naik perlahan (glitter)
  const particles = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 4 + Math.random() * 8,
    dur: 10 + Math.random() * 14,
    delay: Math.random() * 14,
    dx: (Math.random() - 0.5) * 120,
    dist: 100 + Math.random() * 40,
  })), [])

  const onMove = useCallback((e) => {
    const x = (e.clientX / window.innerWidth - 0.5)
    const y = (e.clientY / window.innerHeight - 0.5)
    setPar({ x, y })
  }, [])

  const submit = (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr(false)
    // sedikit delay agar spinner terasa responsif
    setTimeout(() => {
      const ok = login(u, p)
      if (!ok) {
        setErr(true)
        setBusy(false)
        if (cardRef.current) {
          cardRef.current.style.animation = 'none'
          // reflow
          void cardRef.current.offsetHeight
          cardRef.current.style.animation = 'lp-shake .5s'
        }
      }
      // jika ok, AuthProvider akan re-render App → LockPage hilang
    }, 450)
  }

  return (
    <div onMouseMove={onMove} style={{
      position: 'fixed', inset: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      background: 'radial-gradient(120% 120% at 20% 10%, #7a0a22 0%, #4a0715 45%, #2a0410 100%)',
    }}>
      {/* Mesh gradient bergerak */}
      <div style={{
        position: 'absolute', inset: '-20%',
        background: 'radial-gradient(40% 40% at 30% 30%, rgba(252,57,97,.55), transparent 60%), radial-gradient(45% 45% at 75% 65%, rgba(211,17,55,.5), transparent 60%), radial-gradient(35% 35% at 60% 20%, rgba(252,97,126,.4), transparent 60%)',
        filter: 'blur(30px)',
        animation: 'lp-mesh 18s ease-in-out infinite',
        transform: `translate(${par.x * 20}px, ${par.y * 20}px)`,
      }} />
      {/* Grid halus */}
      <div style={{
        position: 'absolute', inset: 0, opacity: .12,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
        backgroundSize: '46px 46px',
        maskImage: 'radial-gradient(70% 70% at 50% 50%, #000 30%, transparent 100%)',
      }} />

      {/* Aksesori melayang dengan parallax */}
      {FLOATERS.map((f, i) => {
        const { C } = f
        return (
          <div key={i} style={{
            position: 'absolute', top: f.top, left: f.left,
            transform: `translate(${par.x * f.depth}px, ${par.y * f.depth}px)`,
            transition: 'transform .2s ease-out',
            filter: 'drop-shadow(0 10px 20px rgba(0,0,0,.35))',
            pointerEvents: 'none',
          }}>
            <div style={{ '--rot': `${f.rot}deg`, animation: `lp-float ${f.dur}s ease-in-out ${i * 0.4}s infinite` }}>
              <C s={f.s} />
            </div>
          </div>
        )
      })}

      {/* Partikel glitter naik */}
      {particles.map(pt => (
        <div key={pt.id} style={{
          position: 'absolute', bottom: -20, left: `${pt.left}%`,
          width: pt.size, height: pt.size, borderRadius: '50%',
          background: 'radial-gradient(circle, #fff 0%, #fc93a6 70%, transparent 100%)',
          '--dx': `${pt.dx}px`, '--dist': `${pt.dist}vh`,
          animation: `lp-drift ${pt.dur}s linear ${pt.delay}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Kartu login */}
      <form ref={cardRef} onSubmit={submit} className="lp-rise" style={{
        position: 'relative', zIndex: 2, width: 380, maxWidth: '90vw',
        padding: '38px 34px 30px',
        borderRadius: 22,
        background: 'rgba(255,255,255,.10)',
        backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
        border: '1px solid rgba(255,255,255,.22)',
        boxShadow: '0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25)',
      }}>
        {/* Logo lingkaran */}
        <div style={{
          width: 62, height: 62, margin: '0 auto 16px', borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, #fc3961, #d31137)',
          boxShadow: '0 10px 28px rgba(211,17,55,.5)',
        }}>
          <Bow s={0.62} />
        </div>

        <h1 style={{
          textAlign: 'center', color: '#fff', fontSize: 24, fontWeight: 700, letterSpacing: '-.02em',
          background: 'linear-gradient(90deg,#fff 20%,#ffd7df 50%,#fff 80%)',
          backgroundSize: '200% auto', WebkitBackgroundClip: 'text', backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'lp-shine 4s linear infinite',
        }}>{BRAND_NAME}</h1>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.72)', fontSize: 12.5, marginTop: 4, marginBottom: 26 }}>
          {BRAND_TAGLINE}
        </p>

        <Field icon="user" placeholder="Username" value={u}
          onChange={e => { setU(e.target.value); setErr(false) }} type="text" autoFocus />
        <div style={{ height: 14 }} />
        <Field icon="lock" placeholder="Password" value={p}
          onChange={e => { setP(e.target.value); setErr(false) }}
          type={show ? 'text' : 'password'}
          trailing={
            <button type="button" onClick={() => setShow(s => !s)} aria-label="toggle password" style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)',
              fontSize: 12, fontWeight: 600, padding: 4,
            }}>{show ? 'SEMBUNYI' : 'LIHAT'}</button>
          } />

        {err && (
          <div style={{ color: '#ffd7df', fontSize: 12, marginTop: 12, textAlign: 'center', fontWeight: 500 }}>
            Username atau password salah.
          </div>
        )}

        <button type="submit" disabled={busy} style={{
          width: '100%', marginTop: 22, height: 48, border: 'none', borderRadius: 12,
          cursor: busy ? 'default' : 'pointer', color: '#fff', fontSize: 15, fontWeight: 700,
          letterSpacing: '.01em',
          background: 'linear-gradient(135deg,#fc3961,#d31137)',
          boxShadow: '0 12px 30px rgba(211,17,55,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          transition: 'transform .15s, box-shadow .15s, filter .15s',
          filter: busy ? 'saturate(.8) brightness(.95)' : 'none',
        }}
          onMouseEnter={e => { if (!busy) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(211,17,55,.6)' } }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(211,17,55,.5)' }}
        >
          {busy && <span style={{
            width: 16, height: 16, borderRadius: '50%', display: 'inline-block',
            border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff',
            animation: 'lp-spin .7s linear infinite',
          }} />}
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 10.5, marginTop: 18 }}>
          Area terbatas · khusus tim internal
        </p>
      </form>
    </div>
  )
}

/* ---------- Input field bergaya glass ---------- */
function Field({ icon, trailing, ...rest }) {
  const [focus, setFocus] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      height: 48, padding: '0 12px', borderRadius: 12,
      background: 'rgba(255,255,255,.10)',
      border: `1.5px solid ${focus ? '#fc3961' : 'rgba(255,255,255,.22)'}`,
      boxShadow: focus ? '0 0 0 4px rgba(252,57,97,.22)' : 'none',
      transition: 'border-color .18s, box-shadow .18s',
    }}>
      <Icon name={icon} />
      <input {...rest}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: '#fff', fontSize: 14, fontFamily: 'inherit',
        }} />
      {trailing}
    </div>
  )
}

function Icon({ name }) {
  const c = 'rgba(255,255,255,.75)'
  if (name === 'user') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={c} strokeWidth="1.8"/>
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="10" width="16" height="10" rx="2.5" stroke={c} strokeWidth="1.8"/>
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={c} strokeWidth="1.8"/>
    </svg>
  )
}
