const Select = ({ label, value, onChange, options }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px',
      fontSize: 13, background: '#fff', color: 'var(--color-text)', cursor: 'pointer', minWidth: 120,
    }}>
      <option value="all">Semua</option>
      {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
    </select>
  </div>
)

export default function GlobalFilters({ filters, onChange, availableFilters = {} }) {
  const years = availableFilters.years || []
  const katList = availableFilters.kategori || []
  const branches = availableFilters.branches || []

  const months = [
    { value: '1', label: 'Januari' }, { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' }, { value: '4', label: 'April' },
    { value: '5', label: 'Mei' }, { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' }, { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' }, { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
  ]

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', gap: 20, flexWrap: 'wrap',
      alignItems: 'flex-end',
    }}>
      <Select label="Tahun" value={filters.year || 'all'}
        onChange={v => onChange({ ...filters, year: v })}
        options={years.map(y => ({ value: String(y), label: String(y) }))} />
      <Select label="Bulan" value={filters.month || 'all'}
        onChange={v => onChange({ ...filters, month: v })}
        options={months} />
      {katList.length > 0 && (
        <Select label="Kategori" value={filters.kategori || 'all'}
          onChange={v => onChange({ ...filters, kategori: v })}
          options={katList.map(k => ({ value: k, label: k }))} />
      )}
      {branches.length > 0 && (
        <Select label="Branch" value={filters.branch || 'all'}
          onChange={v => onChange({ ...filters, branch: v })}
          options={branches.map(b => ({ value: b, label: b }))} />
      )}
    </div>
  )
}
