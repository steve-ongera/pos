// pages/Sales.jsx
import React, { useState, useEffect } from 'react'
import { salesAPI } from '../services/api'
import { useFlash } from '../context/FlashContext'
import { useAuth } from '../context/AuthContext'
import { DataTable, Badge, Modal, SearchBar } from '../components/index.jsx'

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`

const statusColors = { completed: 'success', pending: 'warning', voided: 'danger', refunded: 'info' }
const paymentIcons = { cash: 'bi-cash-coin', mpesa: 'bi-phone', card: 'bi-credit-card', mixed: 'bi-layers', points: 'bi-award' }

export default function Sales() {
  const { canDo, user } = useAuth()
  const { flash } = useFlash()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState({ status: '', payment_method: '', date_from: '', date_to: '' })
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showVoid, setShowVoid] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [supervisorPin, setSupervisorPin] = useState('')

  useEffect(() => { loadSales() }, [filter])

  const loadSales = async () => {
    setLoading(true)
    try {
      const { data } = await salesAPI.list({ ...filter, search })
      setSales(data.results || data)
    } catch { flash('Failed to load sales', 'error') }
    finally { setLoading(false) }
  }

  const handleVoid = async () => {
    if (voidReason.length < 10) { flash('Provide a reason (min 10 characters)', 'error'); return }
    try {
      await salesAPI.void(selected.id, { void_reason: voidReason, supervisor_pin: supervisorPin })
      flash('Sale voided successfully', 'success')
      setShowVoid(false)
      setSelected(null)
      setVoidReason('')
      loadSales()
    } catch (err) { flash(err.response?.data?.error || 'Void failed', 'error') }
  }

  const columns = [
    { key: 'receipt_number', label: 'Receipt #', render: (v) => <code className="receipt-code">{v}</code> },
    { key: 'created_at', label: 'Date/Time', render: (v) => new Date(v).toLocaleString('en-KE') },
    { key: 'cashier_name', label: 'Cashier' },
    { key: 'customer_name', label: 'Customer', render: (v) => v || <span className="text-muted">Walk-in</span> },
    { key: 'payment_method', label: 'Payment', render: (v) => <span className="payment-badge"><i className={`bi ${paymentIcons[v]}`} /> {v?.toUpperCase()}</span> },
    { key: 'total_amount', label: 'Total', render: (v) => <strong>{fmt(v)}</strong> },
    { key: 'status', label: 'Status', render: (v) => <Badge type={statusColors[v]}>{v}</Badge> },
    {
      key: 'id', label: 'Actions', render: (v, row) => (
        <div className="table-actions">
          <button className="btn btn-sm btn-outline" onClick={() => { setSelected(row); setShowDetail(true) }}>
            <i className="bi bi-eye" />
          </button>
          {canDo('void_sale') && row.status === 'completed' && (
            <button className="btn btn-sm btn-danger" onClick={() => { setSelected(row); setShowVoid(true) }}>
              <i className="bi bi-x-circle" />
            </button>
          )}
        </div>
      )
    },
  ]

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales</h1>
          <p className="page-sub">Transaction history and management</p>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search receipt, customer..." />
        <select className="form-select filter-select" value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="voided">Voided</option>
        </select>
        <select className="form-select filter-select" value={filter.payment_method}
          onChange={e => setFilter(f => ({ ...f, payment_method: e.target.value }))}>
          <option value="">All Payments</option>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="card">Card</option>
        </select>
        <input type="date" className="form-input filter-date" value={filter.date_from}
          onChange={e => setFilter(f => ({ ...f, date_from: e.target.value }))} />
        <input type="date" className="form-input filter-date" value={filter.date_to}
          onChange={e => setFilter(f => ({ ...f, date_to: e.target.value }))} />
        <button className="btn btn-outline" onClick={loadSales}><i className="bi bi-funnel" /> Filter</button>
      </div>

      <div className="card">
        <DataTable columns={columns} data={sales} loading={loading} emptyMessage="No sales found." />
      </div>

      {/* Detail Modal */}
      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title={`Receipt: ${selected?.receipt_number}`} size="md"
        footer={<button className="btn btn-ghost" onClick={() => setShowDetail(false)}>Close</button>}>
        {selected && (
          <div className="sale-detail">
            <div className="detail-grid">
              <div><label>Date</label><p>{new Date(selected.created_at).toLocaleString('en-KE')}</p></div>
              <div><label>Cashier</label><p>{selected.cashier_name}</p></div>
              <div><label>Customer</label><p>{selected.customer_name || 'Walk-in'}</p></div>
              <div><label>Payment</label><p className="text-caps">{selected.payment_method}</p></div>
              <div><label>Status</label><Badge type={statusColors[selected.status]}>{selected.status}</Badge></div>
              {selected.mpesa_reference && <div><label>M-Pesa Ref</label><code>{selected.mpesa_reference}</code></div>}
            </div>
            <h4 className="mt-2">Items</h4>
            <div className="sale-items-list">
              {selected.items?.map((item, i) => (
                <div key={i} className="sale-item-row">
                  <span>{item.product_name}</span>
                  <span>x{item.quantity}</span>
                  <span>{fmt(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="sale-totals">
              <div><span>Subtotal</span><span>{fmt(selected.subtotal)}</span></div>
              {Number(selected.discount_amount) > 0 && <div><span>Discount</span><span className="text-green">-{fmt(selected.discount_amount)}</span></div>}
              <div><span>Tax</span><span>{fmt(selected.tax_total)}</span></div>
              <div className="total-row"><span>Total</span><strong>{fmt(selected.total_amount)}</strong></div>
            </div>
            {selected.status === 'voided' && (
              <div className="alert alert-error mt-2">
                <strong>Void Reason:</strong> {selected.void_reason}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Void Modal */}
      <Modal isOpen={showVoid} onClose={() => setShowVoid(false)} title="Void Sale" size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowVoid(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleVoid}>Void Sale</button>
          </>
        }>
        <div className="alert alert-warning mb-2">
          <i className="bi bi-exclamation-triangle-fill" /> This action is irreversible and will be logged.
        </div>
        <div className="form-field">
          <label className="form-label">Void Reason (min 10 chars) <span className="required">*</span></label>
          <textarea className="form-textarea" rows={3} value={voidReason}
            onChange={e => setVoidReason(e.target.value)} placeholder="Explain why this sale is being voided..." />
        </div>
        {user.role === 'cashier' && (
          <div className="form-field">
            <label className="form-label">Supervisor PIN <span className="required">*</span></label>
            <input type="password" className="form-input" value={supervisorPin}
              onChange={e => setSupervisorPin(e.target.value)} placeholder="Enter supervisor PIN" />
          </div>
        )}
      </Modal>
    </div>
  )
}