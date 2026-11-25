import { SPV_TEAM } from '../config/auth'

// Halaman yang boleh dibuka user.
export function pageAllowed(user, path) {
  if (!user) return false
  if (path === '/') return user.pages === 'all'           // Overview hanya utk pages:'all'
  if (path.startsWith('/settings') || path === '/upload') return !!user.canEdit
  return true
}

// Daftar nama SP yang boleh dilihat user ('all' => null = tanpa batas).
export function scopeNames(user) {
  if (!user || user.scope === 'all') return null
  if (user.scope === 'self') return user.self ? [user.self] : []
  if (user.scope === 'spv') return SPV_TEAM[user.spv] || []
  return []
}

const norm = (v) => (v || '').trim().toLowerCase()

// Apakah satu SP (by nama) termasuk cakupan user.
export function spInScope(user, name) {
  const allow = scopeNames(user)
  if (allow == null) return true
  const set = new Set(allow.map(norm))
  return set.has(norm(name))
}

// Filter daftar salesperson (punya .slp_name/.name) sesuai cakupan.
export function filterSalespeople(user, list) {
  const allow = scopeNames(user)
  if (allow == null) return list || []
  const set = new Set(allow.map(norm))
  return (list || []).filter(s => set.has(norm(s.slp_name)) || set.has(norm(s.name)))
}

// Filter daftar customer (punya .salesperson_utama) sesuai cakupan.
export function filterCustomers(user, list) {
  const allow = scopeNames(user)
  if (allow == null) return list || []
  const set = new Set(allow.map(norm))
  return (list || []).filter(c => set.has(norm(c.salesperson_utama)))
}

// SPV mana yang boleh ditampilkan (untuk chart Target vs Actual per SPV).
export function spvAllowed(user, spvName) {
  if (!user || user.scope === 'all') return true
  if (user.scope === 'spv') return norm(spvName) === norm(user.spv)
  if (user.scope === 'self') return norm(spvName) === norm(user.spv)
  return false
}
