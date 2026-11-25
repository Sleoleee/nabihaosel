import { createContext, useContext, useEffect, useState } from 'react'
import { USERS, ROLES, AUTH_KEY } from '../config/auth'

const AuthContext = createContext(null)

// Bangun objek user tersimpan (tanpa password) + resolusi konfigurasi peran.
function buildUser(match) {
  const r = ROLES[match.role] || ROLES.sp
  return {
    username: match.username, name: match.name || match.username,
    role: match.role, roleLabel: r.label,
    spv: match.spv || null, self: match.self || null,
    pages: r.pages, channelLock: r.channelLock, scope: r.scope, canEdit: r.canEdit,
    ts: Date.now(),
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        // revalidasi: pastikan akun masih ada; re-resolve konfigurasi peran (agar perubahan peran ikut)
        const match = USERS.find(u => u.username === saved.username)
        if (match) setUser(buildUser(match))
      }
    } catch { /* ignore */ }
    setReady(true)
  }, [])

  const login = (username, password) => {
    const match = USERS.find(
      u => u.username.toLowerCase() === (username || '').trim().toLowerCase() && u.password === password
    )
    if (!match) return false
    const u = buildUser(match)
    setUser(u)
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(u)) } catch { /* ignore */ }
    return true
  }

  const logout = () => {
    setUser(null)
    try { localStorage.removeItem(AUTH_KEY) } catch { /* ignore */ }
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
