import React, { useState, useEffect } from 'react'
import { productsAPI, categoriesAPI } from '../services/api'
import { useFlash } from '../context/FlashContext'
import { DataTable, Badge, Modal, SearchBar, FormField } from '../components/index.jsx'

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`

export default function Products() {
  const { flash } = useFlash()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm())
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  function defaultForm() {
    return { name: '', barcode: '', sku: '', category: '', selling_price: '', cost_price: '', tax_rate: 16, unit: 'piece', min_stock_level: 10, is_active: true, is_weighable: false, allow_discount: true, description: '' }
  }

  useEffect(() => {
    loadProducts()
    categoriesAPI.list().then(({ data }) => setCategories(data.results || data)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(loadProducts, 400)
    return () => clearTimeout(t)
  }, [search])

  const loadProducts = async () => {
    setLoading(true)
    try {
      const { data } = await productsAPI.list({ search })
      setProducts(data.results || data)
    } catch { flash('Failed to load products', 'error') }
    finally { setLoading(false) }
  }

  const openEdit = (product) => {
    setEditing(product)
    setForm({ ...defaultForm(), ...product, category: product.category || '' })
    setErrors({})
    setShowForm(true)
  }

  const openNew = () => {
    setEditing(null)
    setForm(defaultForm())
    setErrors({})
    setShowForm(true)
  }

  const validate = () => {
    const e = {}
    if (!form.name) e.name = 'Product name is required'
    if (!form.selling_price || form.selling_price <= 0) e.selling_price = 'Valid selling price required'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      if (editing) {
        await productsAPI.update(editing.id, form)
        flash(`${form.name} updated`, 'success')
      } else {
        await productsAPI.create(form)
        flash(`${form.name} created`, 'success')
      }
      setShowForm(false)
      loadProducts()
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') setErrors(data)
      else flash('Save failed. Try again.', 'error')
    } finally { setSaving(false) }
  }

  const handleDelete = async (product) => {
    if (!window.confirm(`Deactivate "${product.name}"?`)) return
    try {
      await productsAPI.delete(product.id)
      flash(`${product.name} deactivated`, 'success')
      loadProducts()
    } catch { flash('Failed to deactivate', 'error') }
  }

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const columns = [
    { key: 'name', label: 'Product', render: (v, row) => (
      <div className="product-table-cell">
        <span className="product-table-name">{v}</span>
        {row.barcode && <code className="text-muted">{row.barcode}</code>}
      </div>
    )},
    { key: 'category_name', label: 'Category', render: (v) => v || <span className="text-muted">—</span> },
    { key: 'selling_price', label: 'Price', render: (v) => fmt(v) },
    { key: 'current_stock', label: 'Stock', render: (v, row) => (
      <span className={`stock-badge ${v <= row.min_stock_level ? 'stock-low' : 'stock-ok'}`}>
        {v} {row.unit}
      </span>
    )},
    { key: 'tax_rate', label: 'VAT', render: (v) => `${v}%` },
    { key: 'is_active', label: 'Status', render: (v) => <Badge type={v ? 'success' : 'danger'}>{v ? 'Active' : 'Inactive'}</Badge> },
    { key: 'id', label: 'Actions', render: (v, row) => (
      <div className="table-actions">
        <button className="btn btn-sm btn-outline" onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>
        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(row)}><i className="bi bi-trash3" /></button>
      </div>
    )},
  ]

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div><h1 className="page-title">Products</h1><p className="page-sub">Manage your product catalog</p></div>
        <button className="btn btn-primary" onClick={openNew}><i className="bi bi-plus-lg" /> Add Product</button>
      </div>

      <div className="filter-bar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search products, barcode..." />
      </div>

      <div className="card">
        <DataTable columns={columns} data={products} loading={loading} emptyMessage="No products found." />
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Product' : 'New Product'} size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><div className="spinner-ring spinner-sm" /> Saving...</> : 'Save Product'}
            </button>
          </>
        }>
        <div className="form-grid-2">
          <FormField label="Product Name" error={errors.name} required>
            <input className={`form-input ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={e => f('name', e.target.value)} />
          </FormField>
          <FormField label="Barcode" error={errors.barcode}>
            <input className="form-input" value={form.barcode} onChange={e => f('barcode', e.target.value)} placeholder="Optional — for scanner" />
          </FormField>
          <FormField label="SKU" error={errors.sku}>
            <input className="form-input" value={form.sku} onChange={e => f('sku', e.target.value)} />
          </FormField>
          <FormField label="Category">
            <select className="form-select" value={form.category} onChange={e => f('category', e.target.value)}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Selling Price (KES)" error={errors.selling_price} required>
            <input className={`form-input ${errors.selling_price ? 'input-error' : ''}`} type="number" value={form.selling_price} onChange={e => f('selling_price', e.target.value)} min="0" step="0.01" />
          </FormField>
          <FormField label="Cost Price (KES)">
            <input className="form-input" type="number" value={form.cost_price} onChange={e => f('cost_price', e.target.value)} min="0" step="0.01" />
          </FormField>
          <FormField label="VAT Rate (%)">
            <input className="form-input" type="number" value={form.tax_rate} onChange={e => f('tax_rate', e.target.value)} min="0" max="100" />
          </FormField>
          <FormField label="Unit">
            <select className="form-select" value={form.unit} onChange={e => f('unit', e.target.value)}>
              <option value="piece">Piece</option>
              <option value="kg">Kilogram (kg)</option>
              <option value="litre">Litre</option>
              <option value="pack">Pack</option>
              <option value="box">Box</option>
            </select>
          </FormField>
          <FormField label="Min Stock Level">
            <input className="form-input" type="number" value={form.min_stock_level} onChange={e => f('min_stock_level', e.target.value)} min="0" />
          </FormField>
        </div>
        <div className="form-grid-2 mt-1">
          <label className="form-checkbox"><input type="checkbox" checked={form.is_weighable} onChange={e => f('is_weighable', e.target.checked)} /> Sold by weight</label>
          <label className="form-checkbox"><input type="checkbox" checked={form.allow_discount} onChange={e => f('allow_discount', e.target.checked)} /> Allow discounts</label>
          <label className="form-checkbox"><input type="checkbox" checked={form.is_active} onChange={e => f('is_active', e.target.checked)} /> Active</label>
        </div>
        <FormField label="Description">
          <textarea className="form-textarea" rows={2} value={form.description} onChange={e => f('description', e.target.value)} />
        </FormField>
      </Modal>
    </div>
  )
}