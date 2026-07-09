export const formatRupiah = (num) => {
  if (num === null || num === undefined) return '-'
  return 'Rp ' + Math.round(num).toLocaleString('id-ID')
}

export const formatRupiahShort = (num) => {
  if (num === null || num === undefined) return '-'
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}M`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}jt`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}rb`
  return `${Math.round(num)}`
}

export const formatNumber = (num) => {
  if (num === null || num === undefined) return '-'
  return Math.round(num).toLocaleString('id-ID')
}

export const formatPct = (num) => {
  if (num === null || num === undefined) return '-'
  return `${num.toFixed(1)}%`
}
