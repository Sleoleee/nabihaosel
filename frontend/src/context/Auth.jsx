import { createContext, useContext, useEffect, useState } from 'react'
import { CREDENTIALS, AUTH_KEY } from '../config/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY)
      if (raw) setUser(JSON.parse(raw))
    } catch { /* ignore */ }
    setReady(true)
  }, [])

  const login = (username, password) => {
    const match = CREDENTIALS.find(
      c => c.username.toLowerCase() === (username || '').trim().toLowerCase() && c.password === password
    )
    if (!match) return false
    const u = { username: match.username, ts: Date.now() }
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
