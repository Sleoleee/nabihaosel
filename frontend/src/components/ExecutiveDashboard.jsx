export function DashboardHeader({ title, subtitle, children }) {
  return (
    <header className="executive-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="executive-header__filters">{children}</div>
    </header>
  )
}

export function DashboardSelect({ label, value, onChange, options, allLabel = 'Semua' }) {
  return (
    <label className="dashboard-filter">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        <option value="all">{allLabel}</option>
        {options.map(option => {
          const optionValue = option.value ?? option
          return <option key={optionValue} value={optionValue}>{option.label ?? option}</option>
        })}
      </select>
    </label>
  )
}

export function DateRange({ startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div className="date-range" aria-label="Rentang tanggal">
      <label><span>Start Date</span><input type="date" value={startDate} onChange={event => onStartChange(event.target.value)} /></label>
      <label><span>End Date</span><input type="date" value={endDate} onChange={event => onEndChange(event.target.value)} /></label>
    </div>
  )
}

export function MetricCard({ label, value, helper, accent = false }) {
  return (
    <article className={`executive-metric${accent ? ' executive-metric--accent' : ''}`}>
      <span>{label}</span><strong className="tabular-nums">{value ?? '-'}</strong>{helper && <small>{helper}</small>}
    </article>
  )
}

export function DashboardPanel({ title, eyebrow, children, className = '' }) {
  return (
    <section className={`executive-panel ${className}`}>
      <div className="executive-panel__heading"><div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div></div>
      {children}
    </section>
  )
}

export function RecommendationPanel({ title = 'Recommendation', summary, actions = [] }) {
  return (
    <section className="recommendation-panel">
      <div className="recommendation-panel__title"><span className="recommendation-panel__spark">✦</span><div><span>Next best action</span><h2>{title}</h2></div></div>
      <p>{summary}</p>
      <div className="recommendation-list">
        {actions.map((action, index) => (
          <div className="recommendation-item" key={`${action.title}-${index}`}>
            <span>{String(index + 1).padStart(2, '0')}</span><div><strong>{action.title}</strong><small>{action.detail}</small></div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function DashboardTable({ columns, rows, empty = 'Belum ada data.' }) {
  return (
    <div className="dashboard-table-wrap"><table className="dashboard-table">
      <thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead>
      <tbody>{!rows.length ? <tr><td className="dashboard-table__empty" colSpan={columns.length}>{empty}</td></tr> : rows.map((row, index) => (
        <tr key={row.id ?? row.code ?? row.name ?? index}>{columns.map(column => <td key={column.key}>{column.render ? column.render(row, index) : row[column.key]}</td>)}</tr>
      ))}</tbody>
    </table></div>
  )
}
