// pages/Reports.jsx
import React, { useState } from 'react'
import { reportsAPI } from '../services/api'
import { useFlash } from '../context/FlashContext'

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`

export function Reports() {
  const { flash } = useFlash()
  const today = new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadReport = async () => {
    setLoading(true)
    try {
      const { data } = await reportsAPI.sales({ date_from: dateFrom, date_to: dateTo })
      setReport(data)
    } catch { flash('Failed to generate report', 'error') }
    finally { setLoading(false) }
  }

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div><h1 className="page-title">Sales Reports</h1><p className="page-sub">Generate and analyse performance data</p></div>
      </div>
      <div className="card mb-2">
        <div className="card-body">
          <div className="filter-bar">
            <div className="form-field"><label className="form-label">From</label><input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
            <div className="form-field"><label className="form-label">To</label><input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            <button className="btn btn-primary" onClick={loadReport} disabled={loading}>
              {loading ? 'Generating...' : <><i className="bi bi-bar-chart-line" /> Generate Report</>}
            </button>
          </div>
        </div>
      </div>
      {report && (
        <>
          <div className="stats-grid">
            <div className="stat-card stat-green"><div className="stat-icon"><i className="bi bi-cash-coin" /></div><div className="stat-info"><span className="stat-label">Total Revenue</span><span className="stat-value">{fmt(report.summary.total)}</span></div></div>
            <div className="stat-card stat-blue"><div className="stat-icon"><i className="bi bi-receipt" /></div><div className="stat-info"><span className="stat-label">Transactions</span><span className="stat-value">{report.summary.count}</span></div></div>
            <div className="stat-card stat-orange"><div className="stat-icon"><i className="bi bi-percent" /></div><div className="stat-info"><span className="stat-label">Total Discounts</span><span className="stat-value">{fmt(report.summary.discounts)}</span></div></div>
            <div className="stat-card stat-purple"><div className="stat-icon"><i className="bi bi-bank" /></div><div className="stat-info"><span className="stat-label">Tax Collected</span><span className="stat-value">{fmt(report.summary.tax)}</span></div></div>
          </div>
          <div className="dashboard-grid">
            <div className="card">
              <div className="card-header"><h3>By Payment Method</h3></div>
              <div className="card-body">
                {report.by_payment.map((p, i) => (
                  <div key={i} className="report-row">
                    <span className="text-caps">{p.payment_method}</span>
                    <span>{p.count} txns</span>
                    <strong>{fmt(p.total)}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>By Cashier</h3></div>
              <div className="card-body">
                {report.by_cashier.map((c, i) => (
                  <div key={i} className="report-row">
                    <span>{c.cashier__first_name} {c.cashier__last_name}</span>
                    <span>{c.count} txns</span>
                    <strong>{fmt(c.total)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
export default Reports

// pages/Inventory.jsx
export function Inventory() {
  return (
    <div className="page-wrapper">
      <div className="page-header"><div><h1 className="page-title">Inventory</h1><p className="page-sub">Stock levels and management</p></div></div>
      <div className="card"><div className="card-body"><div className="empty-state"><i className="bi bi-archive" /><h3>Inventory Management</h3><p>Stock levels are automatically updated when sales are processed. Manual adjustments coming soon.</p></div></div></div>
    </div>
  )
}

// pages/AuditLogs.jsx
export function AuditLogs() {
  const [logs, setLogs] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const { flash } = useFlash()

  React.useEffect(() => {
    import('../services/api').then(({ auditAPI }) => {
      auditAPI.list().then(({ data }) => { setLogs(data.results || data); setLoading(false) }).catch(() => { flash('Failed to load logs', 'error'); setLoading(false) })
    })
  }, [])

  return (
    <div className="page-wrapper">
      <div className="page-header"><div><h1 className="page-title">Audit Logs</h1><p className="page-sub">Full activity trail for security and compliance</p></div></div>
      <div className="card">
        {loading ? <div className="card-body"><div className="spinner-ring" /></div> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>IP Address</th></tr></thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td><span className="text-sm text-muted">{new Date(log.timestamp).toLocaleString('en-KE')}</span></td>
                    <td>{log.user_name}</td>
                    <td><code className="audit-action">{log.action}</code></td>
                    <td><span className="text-muted">{log.ip_address || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// pages/Settings.jsx
export function Settings() {
  const { user } = useAuth()
  const { flash } = useFlash()
  const [form, setForm] = React.useState({ old_password: '', new_password: '', confirm_password: '' })
  const [saving, setSaving] = React.useState(false)

  const handleChangePassword = async () => {
    if (form.new_password !== form.confirm_password) { flash('Passwords do not match', 'error'); return }
    setSaving(true)
    try {
      await import('../services/api').then(({ authAPI }) => authAPI.changePassword(form))
      flash('Password changed successfully', 'success')
      setForm({ old_password: '', new_password: '', confirm_password: '' })
    } catch (err) { flash(err.response?.data?.error || 'Failed to change password', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="page-wrapper">
      <div className="page-header"><div><h1 className="page-title">Settings</h1><p className="page-sub">Account and system preferences</p></div></div>
      <div className="settings-grid">
        <div className="card">
          <div className="card-header"><h3><i className="bi bi-person-circle" /> My Profile</h3></div>
          <div className="card-body">
            <div className="profile-display">
              <div className="profile-avatar">{user?.first_name?.[0]}{user?.last_name?.[0]}</div>
              <div>
                <h3>{user?.full_name}</h3>
                <p>{user?.email}</p>
                <span className={`badge badge-${user?.role === 'admin' ? 'danger' : 'primary'}`}>{user?.role}</span>
              </div>
            </div>
            <div className="profile-details mt-2">
              <div><label>Employee ID</label><p>{user?.employee_id || '—'}</p></div>
              <div><label>Branch</label><p>{user?.branch_name || '—'}</p></div>
              <div><label>Phone</label><p>{user?.phone || '—'}</p></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3><i className="bi bi-shield-lock" /> Change Password</h3></div>
          <div className="card-body">
            <div className="form-field"><label className="form-label">Current Password</label><input type="password" className="form-input" value={form.old_password} onChange={e => setForm(p => ({ ...p, old_password: e.target.value }))} /></div>
            <div className="form-field"><label className="form-label">New Password</label><input type="password" className="form-input" value={form.new_password} onChange={e => setForm(p => ({ ...p, new_password: e.target.value }))} /></div>
            <div className="form-field"><label className="form-label">Confirm New Password</label><input type="password" className="form-input" value={form.confirm_password} onChange={e => setForm(p => ({ ...p, confirm_password: e.target.value }))} /></div>
            <button className="btn btn-primary" onClick={handleChangePassword} disabled={saving}>{saving ? 'Changing...' : 'Change Password'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// pages/NotFound.jsx
export function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-inner">
        <span className="not-found-code">404</span>
        <h1>Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/dashboard" className="btn btn-primary"><i className="bi bi-house" /> Back to Dashboard</a>
      </div>
    </div>
  )
}

// Re-export for lazy imports
import { useFlash } from '../context/FlashContext'
import { useAuth } from '../context/AuthContext'