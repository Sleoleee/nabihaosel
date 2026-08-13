import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAnalyticsFilters } from '../utils/api'

const Ctx = createContext(null)
export const useGlobalFilters = () => useContext(Ctx)

const parseList = (v) => (v ? v.split(',').filter(Boolean) : [])

export function GlobalFilterProvider({ children }) {
  const [sp, setSp] = useSearchParams()
  const [avail, setAvail] = useState({ years: [], channels: [] })
  const [ready, setReady] = useState(false)

  const years    = parseList(sp.get('years'))
  const channels = parseList(sp.get('channels'))
  const months   = parseList(sp.get('months'))
  const compare  = sp.get('compare') === '1'

  // Muat daftar tahun/channel; set default tahun terbaru bila URL kosong
  useEffect(() => {
    getAnalyticsFilters().then(f => {
      setAvail({ years: (f.years || []).map(String), channels: f.channels || [] })
      if (!sp.get('years') && f.years?.length) {
        const next = new URLSearchParams(sp)
        next.set('years', String(f.years[0]))
        setSp(next, { replace: true })
      }
      setReady(true)
    }).catch(() => setReady(true))
  }, [])  // eslint-disable-line

  const update = (patch) => {
    const next = new URLSearchParams(sp)
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || (Array.isArray(v) && v.length === 0) || v === false) next.delete(k)
      else if (Array.isArray(v)) next.set(k, v.join(','))
      else if (v === true) next.set(k, '1')
      else next.set(k, String(v))
    })
    setSp(next, { replace: false })
  }

  const toggle = (key, val) => {
    const cur = parseList(sp.get(key))
    update({ [key]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] })
  }

  const resetAll = () => setSp(new URLSearchParams(years.length ? {} : {}), { replace: false })

  // Param siap-pakai untuk API
  const apiParams = useMemo(() => {
    const p = {}
    if (years.length) p.years = years.join(',')
    if (channels.length) p.channels = channels.join(',')
    if (months.length) p.months = months.join(',')
    if (compare) p.compare = true
    return p
  }, [sp])  // eslint-disable-line

  const value = { years, channels, months, compare, avail, ready, update, toggle, resetAll, apiParams }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
