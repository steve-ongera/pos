import React, { useState, useEffect } from 'react'
import { usersAPI } from '../services/api'
import { useFlash } from '../context/FlashContext'
import { DataTable, Badge, Modal, FormField } from '../components/index.jsx'

const ROLES = ['cashier', 'supervisor', 'manager', 'admin']
const roleColors = { admin: 'danger', manager: 'primary', supervisor: 'warning', cashier: 'success' }

export default function Users() {
  const { flash } = useFlash()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'cashier', employee_id: '', phone: '', password: '', confirm_password: '' })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    try { const { data } = await usersAPI.list(); setUsers(data.results || data) }
    catch { flash('Failed to load users', 'error') }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (form.password !== form.confirm_password) { setErrors({ confirm_password: 'Passwords do not match' }); return }
    setSaving(true)
    try {
      await usersAPI.create(form)
      flash(`User ${form.email} created`, 'success')
      setShowForm(false); load()
    } catch (err) {
      const d = err.response?.data
      if (d && typeof d === 'object') setErrors(d)
      else flash('Failed to create user', 'error')
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (user) => {
    if (!window.confirm(`Deactivate ${user.full_name}?`)) return
    try { await usersAPI.deactivate(user.id); flash('User deactivated', 'success'); load() }
    catch { flash('Failed to deactivate', 'error') }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'employee_id', label: 'Staff ID', render: (v) => v || '—' },
    { key: 'role', label: 'Role', render: (v) => <Badge type={roleColors[v]}>{v}</Badge> },
    { key: 'branch_name', label: 'Branch', render: (v) => v || '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge type={v ? 'success' : 'danger'}>{v ? 'Active' : 'Inactive'}</Badge> },
    { key: 'id', label: '', render: (v, row) => (
      row.is_active && <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(row)}><i className="bi bi-person-x" /></button>
    )},
  ]

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div><h1 className="page-title">Staff Users</h1><p className="page-sub">Manage POS access and roles</p></div>
        <button className="btn btn-primary" onClick={() => { setForm({ email:'',first_name:'',last_name:'',role:'cashier',employee_id:'',phone:'',password:'',confirm_password:'' }); setErrors({}); setShowForm(true) }}>
          <i className="bi bi-person-plus" /> Add User
        </button>
      </div>
      <div className="card"><DataTable columns={columns} data={users} loading={loading} /></div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="New Staff User" size="md"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
          </>
        }>
        <div className="alert alert-warning">
          <i className="bi bi-shield-exclamation" /> New users will be able to access POS features based on their assigned role.
        </div>
        <div className="form-grid-2 mt-1">
          <FormField label="First Name" error={errors.first_name} required>
            <input className="form-input" value={form.first_name} onChange={e => f('first_name', e.target.value)} />
          </FormField>
          <FormField label="Last Name" error={errors.last_name} required>
            <input className="form-input" value={form.last_name} onChange={e => f('last_name', e.target.value)} />
          </FormField>
          <FormField label="Email" error={errors.email} required>
            <input className="form-input" type="email" value={form.email} onChange={e => f('email', e.target.value)} />
          </FormField>
          <FormField label="Employee ID">
            <input className="form-input" value={form.employee_id} onChange={e => f('employee_id', e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <input className="form-input" value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="0712345678" />
          </FormField>
          <FormField label="Role" required>
            <select className="form-select" value={form.role} onChange={e => f('role', e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </FormField>
          <FormField label="Password" error={errors.password} required>
            <input className="form-input" type="password" value={form.password} onChange={e => f('password', e.target.value)} />
          </FormField>
          <FormField label="Confirm Password" error={errors.confirm_password} required>
            <input className="form-input" type="password" value={form.confirm_password} onChange={e => f('confirm_password', e.target.value)} />
          </FormField>
        </div>
      </Modal>
    </div>
  )
}