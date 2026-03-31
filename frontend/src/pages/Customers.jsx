// pages/Customers.jsx
import React, { useState, useEffect } from 'react'
import { customersAPI } from '../services/api'
import { useFlash } from '../context/FlashContext'
import { DataTable, Badge, Modal, SearchBar, FormField } from '../components/index.jsx'

export default function Customers() {
  const { flash } = useFlash()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', date_of_birth: '' })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => { load() }, [])
  useEffect(() => { const t = setTimeout(load, 400); return () => clearTimeout(t) }, [search])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await customersAPI.list({ search })
      setCustomers(data.results || data)
    } catch { flash('Failed to load customers', 'error') }
    finally { setLoading(false) }
  }

  const openEdit = (c) => { setEditing(c); setForm({ ...c }); setErrors({}); setShowForm(true) }
  const openNew = () => { setEditing(null); setForm({ first_name: '', last_name: '', phone: '', email: '', date_of_birth: '' }); setErrors({}); setShowForm(true) }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) { await customersAPI.update(editing.id, form); flash('Customer updated', 'success') }
      else { await customersAPI.create(form); flash('Customer created', 'success') }
      setShowForm(false); load()
    } catch (err) {
      const d = err.response?.data
      if (d && typeof d === 'object') setErrors(d)
      else flash('Save failed', 'error')
    } finally { setSaving(false) }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'loyalty_points', label: 'Points', render: (v) => <span className="points-display"><i className="bi bi-award" /> {v}</span> },
    { key: 'total_spent', label: 'Total Spent', render: (v) => `KES ${Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2 })}` },
    { key: 'total_sales', label: 'Purchases' },
    { key: 'created_at', label: 'Joined', render: (v) => new Date(v).toLocaleDateString('en-KE') },
    { key: 'id', label: '', render: (v, row) => (
      <button className="btn btn-sm btn-outline" onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>
    )},
  ]

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div><h1 className="page-title">Customers</h1><p className="page-sub">Loyalty members & customer base</p></div>
        <button className="btn btn-primary" onClick={openNew}><i className="bi bi-person-plus" /> New Customer</button>
      </div>
      <div className="filter-bar"><SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone..." /></div>
      <div className="card"><DataTable columns={columns} data={customers} loading={loading} /></div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Customer' : 'New Customer'} size="md"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Customer'}
            </button>
          </>
        }>
        <div className="form-grid-2">
          <FormField label="First Name" error={errors.first_name} required>
            <input className="form-input" value={form.first_name} onChange={e => f('first_name', e.target.value)} />
          </FormField>
          <FormField label="Last Name" error={errors.last_name}>
            <input className="form-input" value={form.last_name} onChange={e => f('last_name', e.target.value)} />
          </FormField>
          <FormField label="Phone (Safaricom)" error={errors.phone} required>
            <input className="form-input" value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="0712345678" />
          </FormField>
          <FormField label="Email" error={errors.email}>
            <input className="form-input" type="email" value={form.email} onChange={e => f('email', e.target.value)} />
          </FormField>
          <FormField label="Date of Birth">
            <input className="form-input" type="date" value={form.date_of_birth} onChange={e => f('date_of_birth', e.target.value)} />
          </FormField>
        </div>
      </Modal>
    </div>
  )
}