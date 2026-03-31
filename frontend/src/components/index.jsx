// components/Spinner.jsx
import React from 'react'

export default function Spinner({ fullscreen, size = 'md' }) {
  if (fullscreen) {
    return (
      <div className="spinner-fullscreen">
        <div className="spinner-ring" />
        <p>Loading...</p>
      </div>
    )
  }
  return <div className={`spinner-ring spinner-${size}`} />
}

// components/Modal.jsx
export function Modal({ isOpen, onClose, title, children, size = 'md', footer }) {
  if (!isOpen) return null
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-box modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h3 id="modal-title" className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// components/DataTable.jsx
export function DataTable({ columns, data, loading, emptyMessage = 'No records found.' }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={col.style}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="table-loading">
              <div className="spinner-ring" />
            </td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={columns.length} className="table-empty">
              <i className="bi bi-inbox" />
              <p>{emptyMessage}</p>
            </td></tr>
          ) : (
            data.map((row, i) => (
              <tr key={row.id || i}>
                {columns.map(col => (
                  <td key={col.key}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// components/Badge.jsx
export function Badge({ type, children }) {
  return <span className={`badge badge-${type}`}>{children}</span>
}

// components/StatCard.jsx
export function StatCard({ icon, label, value, sub, color = 'primary', onClick }) {
  return (
    <div className={`stat-card stat-${color}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
      <div className="stat-icon">
        <i className={`bi ${icon}`} />
      </div>
      <div className="stat-info">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  )
}

// components/SearchBar.jsx
export function SearchBar({ value, onChange, placeholder = 'Search...', onScan }) {
  return (
    <div className="search-bar">
      <i className="bi bi-search search-icon" />
      <input
        type="text"
        className="search-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {onScan && (
        <button className="btn-scan" onClick={onScan} title="Scan Barcode">
          <i className="bi bi-upc-scan" />
        </button>
      )}
      {value && (
        <button className="search-clear" onClick={() => onChange('')}>
          <i className="bi bi-x" />
        </button>
      )}
    </div>
  )
}

// components/ConfirmDialog.jsx
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', confirmVariant = 'danger' }) {
  if (!isOpen) return null
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-sm">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn btn-${confirmVariant}`} onClick={() => { onConfirm(); onClose() }}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

// components/FormField.jsx
export function FormField({ label, error, children, required }) {
  return (
    <div className="form-field">
      {label && <label className="form-label">{label}{required && <span className="required">*</span>}</label>}
      {children}
      {error && <span className="form-error"><i className="bi bi-exclamation-circle" /> {error}</span>}
    </div>
  )
}

// components/EmptyState.jsx
export function EmptyState({ icon = 'bi-inbox', title, message, action }) {
  return (
    <div className="empty-state">
      <i className={`bi ${icon}`} />
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}