import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardAPI, drawerAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useFlash } from '../context/FlashContext'
import { StatCard, Modal } from '../components/index.jsx'
import Spinner from '../components/Spinner'

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`

export default function Dashboard() {
  const { user, canDo } = useAuth()
  const { flash } = useFlash()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(null)
  const [showOpenDrawer, setShowOpenDrawer] = useState(false)
  const [openFloat, setOpenFloat] = useState('')
  const [drawerLoading, setDrawerLoading] = useState(false)

  useEffect(() => {
    Promise.all([dashboardAPI.summary(), drawerAPI.current()])
      .then(([{ data: dash }, { data: drw }]) => {
        setData(dash)
        setDrawer(drw)
      })
      .catch(() => flash('Failed to load dashboard', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const handleOpenDrawer = async () => {
    if (!openFloat || isNaN(openFloat) || Number(openFloat) < 0) {
      flash('Enter a valid float amount', 'error'); return
    }
    setDrawerLoading(true)
    try {
      const { data: drw } = await drawerAPI.open(Number(openFloat))
      setDrawer(drw)
      setShowOpenDrawer(false)
      flash(`Drawer opened with KES ${Number(openFloat).toLocaleString()}`, 'success')
    } catch (err) {
      flash(err.response?.data?.error || 'Failed to open drawer', 'error')
    } finally { setDrawerLoading(false) }
  }

  if (loading) return <Spinner fullscreen />

  const maxHourly = data ? Math.max(...data.hourly_sales.map(h => h.total), 1) : 1
  const paymentColors = { cash: '#2d9b72', mpesa: '#00a651', card: '#0057b8', mixed: '#f59e0b', points: '#8b5cf6' }

  return (
    <div className="page-wrapper">
      {/* Drawer alert banner */}
      {!drawer && (
        <div className="alert alert-warning alert-banner">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>No cash drawer is open. Open a drawer before processing cash sales.</span>
          <button className="btn btn-sm btn-warning" onClick={() => setShowOpenDrawer(true)}>
            Open Drawer
          </button>
        </div>
      )}

      {/* Welcome header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Good {getGreeting()}, {user?.first_name} 👋</h1>
          <p className="page-sub">{new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => navigate('/pos')}>
            <i className="bi bi-cart-plus" /> New Sale
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        <StatCard icon="bi-cash-coin" label="Today's Sales" value={fmt(data?.today_sales)} sub={`${data?.today_transactions} transactions`} color="green" onClick={() => navigate('/sales')} />
        <StatCard icon="bi-bag-check" label="Items Sold Today" value={Number(data?.today_items_sold || 0).toFixed(0)} sub="units" color="blue" />
        <StatCard icon="bi-calendar-week" label="This Week" value={fmt(data?.week_sales)} color="purple" />
        <StatCard icon="bi-graph-up-arrow" label="This Month" value={fmt(data?.month_sales)} color="orange" onClick={() => navigate('/reports')} />
        <StatCard icon="bi-people" label="Total Customers" value={Number(data?.active_customers || 0).toLocaleString()} color="teal" onClick={() => navigate('/customers')} />
        <StatCard icon="bi-exclamation-triangle" label="Low Stock Items" value={data?.low_stock_count || 0} color={data?.low_stock_count > 0 ? 'red' : 'green'} onClick={() => navigate('/inventory')} />
      </div>

      <div className="dashboard-grid">
        {/* Hourly sales bar chart */}
        <div className="card card-lg">
          <div className="card-header">
            <h3><i className="bi bi-bar-chart" /> Today's Hourly Sales</h3>
          </div>
          <div className="card-body">
            <div className="chart-bars">
              {data?.hourly_sales?.map(h => (
                <div key={h.hour} className="chart-bar-col">
                  <div className="chart-bar-wrap">
                    <div
                      className="chart-bar"
                      style={{ height: `${(h.total / maxHourly) * 100}%` }}
                      title={`${h.hour}: ${fmt(h.total)}`}
                    />
                  </div>
                  <span className="chart-bar-label">{h.hour.replace(':00', '')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="card">
          <div className="card-header">
            <h3><i className="bi bi-pie-chart" /> Payment Methods</h3>
            <span className="card-sub">Today</span>
          </div>
          <div className="card-body">
            {data?.payment_breakdown && Object.keys(data.payment_breakdown).length > 0 ? (
              <div className="payment-breakdown">
                {Object.entries(data.payment_breakdown).map(([method, info]) => {
                  const totalAll = Object.values(data.payment_breakdown).reduce((s, v) => s + v.total, 0)
                  const pct = totalAll > 0 ? ((info.total / totalAll) * 100).toFixed(1) : 0
                  return (
                    <div key={method} className="payment-row">
                      <div className="payment-method-info">
                        <span className="payment-dot" style={{ background: paymentColors[method] || '#999' }} />
                        <span className="payment-name">{method.toUpperCase()}</span>
                        <span className="payment-count">{info.count} txns</span>
                      </div>
                      <div className="payment-bar-wrap">
                        <div className="payment-bar" style={{ width: `${pct}%`, background: paymentColors[method] || '#999' }} />
                      </div>
                      <span className="payment-amount">{fmt(info.total)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state-sm">
                <i className="bi bi-pie-chart" />
                <p>No sales today yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Top products */}
        <div className="card">
          <div className="card-header">
            <h3><i className="bi bi-trophy" /> Top Products</h3>
            <span className="card-sub">This month</span>
          </div>
          <div className="card-body">
            {data?.top_products?.length > 0 ? (
              <div className="top-products">
                {data.top_products.map((p, i) => (
                  <div key={i} className="top-product-row">
                    <span className="rank-badge">#{i + 1}</span>
                    <div className="top-product-info">
                      <span className="top-product-name">{p.product__name}</span>
                      <span className="top-product-qty">{Number(p.total_qty).toFixed(0)} units</span>
                    </div>
                    <span className="top-product-revenue">{fmt(p.total_revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-sm">
                <i className="bi bi-trophy" />
                <p>No sales this month</p>
              </div>
            )}
          </div>
        </div>

        {/* Drawer info */}
        {drawer && (
          <div className="card">
            <div className="card-header">
              <h3><i className="bi bi-safe2" /> Cash Drawer</h3>
              <span className="badge badge-success">Open</span>
            </div>
            <div className="card-body">
              <div className="drawer-info">
                <div className="drawer-row">
                  <span>Opening Float</span>
                  <strong>{fmt(drawer.opening_float)}</strong>
                </div>
                <div className="drawer-row">
                  <span>Opened At</span>
                  <strong>{new Date(drawer.opened_at).toLocaleTimeString('en-KE')}</strong>
                </div>
                <div className="drawer-row">
                  <span>Cashier</span>
                  <strong>{drawer.cashier_name}</strong>
                </div>
              </div>
              <button className="btn btn-outline btn-full mt-2" onClick={() => navigate('/pos')}>
                <i className="bi bi-arrow-right-circle" /> Go to POS
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Open Drawer Modal */}
      <Modal isOpen={showOpenDrawer} onClose={() => setShowOpenDrawer(false)} title="Open Cash Drawer"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowOpenDrawer(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleOpenDrawer} disabled={drawerLoading}>
              {drawerLoading ? <><div className="spinner-ring spinner-sm" /> Opening...</> : 'Open Drawer'}
            </button>
          </>
        }>
        <div className="form-field">
          <label className="form-label">Opening Float Amount (KES)</label>
          <div className="input-group">
            <span className="input-icon"><i className="bi bi-currency-exchange" /></span>
            <input
              type="number" className="form-input" placeholder="e.g. 5000"
              value={openFloat} onChange={e => setOpenFloat(e.target.value)}
              min="0" autoFocus
            />
          </div>
          <span className="form-hint">Count your starting cash and enter the total amount.</span>
        </div>
      </Modal>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}