import React, { useState, useEffect, useRef, useCallback } from 'react'
import { productsAPI, salesAPI, customersAPI, mpesaAPI, drawerAPI, categoriesAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useFlash } from '../context/FlashContext'
import { Modal } from '../components/index.jsx'

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
const PAYMENT_METHODS = [
  { key: 'cash',  label: 'Cash',  icon: 'bi-cash-coin' },
  { key: 'mpesa', label: 'M-Pesa', icon: 'bi-phone' },
  { key: 'card',  label: 'Card',  icon: 'bi-credit-card' },
  { key: 'mixed', label: 'Mixed', icon: 'bi-layers' },
]

export default function POS() {
  const { user } = useAuth()
  const { flash } = useFlash()

  // Cart state
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [discount, setDiscount] = useState({ type: 'amount', value: 0 })
  const [pointsToRedeem, setPointsToRedeem] = useState(0)

  // UI state
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [productLoading, setProductLoading] = useState(true)

  // Mobile cart drawer state
  const [cartOpen, setCartOpen] = useState(false)

  // Modals
  const [showCheckout, setShowCheckout] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [showMpesa, setShowMpesa] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showWeigh, setShowWeigh] = useState(null)
  const [showOpenDrawer, setShowOpenDrawer] = useState(false)
  const [showVoid, setShowVoid] = useState(false)

  // Checkout form
  const [amountPaid, setAmountPaid] = useState('')
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [mpesaStatus, setMpesaStatus] = useState(null)
  const [checkoutRequestId, setCheckoutRequestId] = useState('')
  const [completedSale, setCompletedSale] = useState(null)
  const [openFloat, setOpenFloat] = useState('')
  const [voidReason, setVoidReason] = useState('')
  const [supervisorPin, setSupervisorPin] = useState('')

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [customerLoading, setCustomerLoading] = useState(false)

  const barcodeRef  = useRef('')
  const barcodeTimer = useRef(null)
  const mpesaPollRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    loadProducts()
    loadCategories()
    drawerAPI.current().then(({ data }) => setDrawer(data)).catch(() => {})
    return () => { if (mpesaPollRef.current) clearInterval(mpesaPollRef.current) }
  }, [])

  useEffect(() => { loadProducts() }, [activeCategory, search])

  // Barcode scanner listener
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Enter' && barcodeRef.current.length >= 4) {
        handleBarcodeScan(barcodeRef.current)
        barcodeRef.current = ''
        return
      }
      if (e.key.length === 1) {
        barcodeRef.current += e.key
        clearTimeout(barcodeTimer.current)
        barcodeTimer.current = setTimeout(() => { barcodeRef.current = '' }, 100)
      }
    }
    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [cart])

  const loadProducts = async () => {
    setProductLoading(true)
    try {
      const params = {}
      if (activeCategory) params.category = activeCategory
      if (search) params.search = search
      const { data } = await productsAPI.posList(params)
      setProducts(data)
    } catch { flash('Failed to load products', 'error') }
    finally { setProductLoading(false) }
  }

  const loadCategories = async () => {
    try {
      const { data } = await categoriesAPI.list()
      setCategories(data.results || data)
    } catch {}
  }

  const handleBarcodeScan = async (barcode) => {
    try {
      const { data } = await productsAPI.barcodeLookup(barcode)
      if (data.is_weighable) { setShowWeigh(data); return }
      addToCart(data, 1)
      flash(`Added: ${data.name}`, 'success', 1500)
    } catch { flash(`No product found: ${barcode}`, 'error') }
  }

  const addToCart = useCallback((product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) {
        return prev.map(i => i.product.id === product.id
          ? { ...i, quantity: i.quantity + quantity }
          : i)
      }
      return [...prev, { product, quantity, discount: 0 }]
    })
  }, [])

  const updateQty = (productId, qty) => {
    if (qty <= 0) { removeFromCart(productId); return }
    setCart(prev => prev.map(i => i.product.id === productId ? { ...i, quantity: qty } : i))
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(i => i.product.id !== productId))
  }

  const updateItemDiscount = (productId, disc) => {
    setCart(prev => prev.map(i => i.product.id === productId ? { ...i, discount: Number(disc) || 0 } : i))
  }

  const subtotal = cart.reduce((s, i) => s + (i.product.selling_price * i.quantity - i.discount), 0)
  const discountAmount = discount.type === 'percent'
    ? subtotal * (discount.value / 100)
    : Number(discount.value) || 0
  const pointsValue = pointsToRedeem * 1
  const total = Math.max(subtotal - discountAmount - pointsValue, 0)
  const change = paymentMethod === 'cash' ? Math.max(Number(amountPaid) - total, 0) : 0
  const pointsEarnable = customer ? Math.floor(total) : 0

  // Customer search
  const searchCustomer = async (q) => {
    setCustomerSearch(q)
    if (q.length < 3) { setCustomerResults([]); return }
    setCustomerLoading(true)
    try {
      const { data } = await customersAPI.lookup({ phone: q })
      setCustomerResults(data)
    } catch {} finally { setCustomerLoading(false) }
  }

  const selectCustomer = (c) => {
    setCustomer(c)
    setCustomerSearch('')
    setCustomerResults([])
    setShowCustomer(false)
    flash(`Customer: ${c.full_name} | Points: ${c.loyalty_points}`, 'success')
  }

  const clearCart = () => {
    setCart([])
    setCustomer(null)
    setDiscount({ type: 'amount', value: 0 })
    setPointsToRedeem(0)
    setAmountPaid('')
    setMpesaPhone('')
    setMpesaStatus(null)
  }

  const handleCheckout = async () => {
    if (cart.length === 0) { flash('Cart is empty', 'error'); return }
    if (!drawer && paymentMethod === 'cash') { flash('Open a cash drawer first', 'error'); return }
    if (paymentMethod === 'cash' && (!amountPaid || Number(amountPaid) < total)) {
      flash('Amount paid is less than total', 'error'); return
    }
    setLoading(true)
    try {
      const payload = {
        customer_id: customer?.id || null,
        payment_method: paymentMethod,
        items: cart.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          discount_amount: i.discount || 0,
        })),
        discount_amount: discountAmount,
        discount_percent: discount.type === 'percent' ? discount.value : 0,
        points_to_redeem: pointsToRedeem,
        amount_paid: Number(amountPaid) || total,
        mpesa_phone: mpesaPhone,
        notes: '',
      }
      const { data: sale } = await salesAPI.create(payload)
      if (paymentMethod === 'mpesa' && !sale.status === 'completed') {
        await initMpesaSTK(sale)
      } else {
        setCompletedSale(sale)
        setShowCheckout(false)
        setShowReceipt(true)
        clearCart()
        flash(`Sale complete! Receipt: ${sale.receipt_number}`, 'success')
      }
    } catch (err) {
      flash(err.response?.data?.error || 'Sale failed. Try again.', 'error')
    } finally { setLoading(false) }
  }

  const initMpesaSTK = async (sale) => {
    setShowMpesa(true)
    setMpesaStatus('pending')
    try {
      const { data } = await mpesaAPI.stkPush({
        phone_number: mpesaPhone,
        amount: total,
        sale_id: sale.id,
      })
      setCheckoutRequestId(data.checkout_request_id)
      if (data.debug) {
        const { data: freshSale } = await salesAPI.detail(sale.id)
        setCompletedSale(freshSale)
        setMpesaStatus('completed')
        setTimeout(() => {
          setShowMpesa(false)
          setShowCheckout(false)
          setShowReceipt(true)
          clearCart()
          flash(`M-Pesa payment received! Ref: ${freshSale.mpesa_reference}`, 'success')
        }, 1500)
      } else {
        pollMpesaStatus(data.checkout_request_id, sale)
      }
    } catch (err) {
      setMpesaStatus('failed')
      flash(err.response?.data?.error || 'M-Pesa STK Push failed', 'error')
    }
  }

  const pollMpesaStatus = (checkoutId, sale) => {
    let attempts = 0
    mpesaPollRef.current = setInterval(async () => {
      attempts++
      if (attempts > 30) { clearInterval(mpesaPollRef.current); setMpesaStatus('timeout'); return }
      try {
        const { data: txn } = await mpesaAPI.checkStatus(checkoutId)
        if (txn.status === 'completed') {
          clearInterval(mpesaPollRef.current)
          setMpesaStatus('completed')
          const { data: freshSale } = await salesAPI.detail(sale.id)
          setCompletedSale(freshSale)
          setTimeout(() => {
            setShowMpesa(false)
            setShowCheckout(false)
            setShowReceipt(true)
            clearCart()
            flash(`M-Pesa confirmed! Ref: ${txn.mpesa_receipt_number}`, 'success')
          }, 1500)
        } else if (txn.status === 'failed') {
          clearInterval(mpesaPollRef.current)
          setMpesaStatus('failed')
          flash('M-Pesa payment was rejected or cancelled.', 'error')
        }
      } catch {}
    }, 3000)
  }

  const handleOpenDrawer = async () => {
    if (!openFloat || isNaN(openFloat)) { flash('Enter valid float amount', 'error'); return }
    try {
      const { data: drw } = await drawerAPI.open(Number(openFloat))
      setDrawer(drw)
      setShowOpenDrawer(false)
      flash(`Drawer opened with ${fmt(openFloat)}`, 'success')
    } catch (err) { flash(err.response?.data?.error || 'Failed', 'error') }
  }

  const openCart = () => setCartOpen(true)
  const closeCart = () => setCartOpen(false)

  return (
    <div className="pos-layout">

      {/* ── Left: Products panel ─────────────────────────────────────── */}
      <div className="pos-products-panel">

        {/* Search bar */}
        <div className="pos-search-bar">
          <div className="search-bar">
            <i className="bi bi-search search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search product or scan barcode..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>
                <i className="bi bi-x" />
              </button>
            )}
            <button className="btn-scan" title="Focus for barcode scan">
              <i className="bi bi-upc-scan" />
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="category-tabs">
          <button
            className={`category-tab ${!activeCategory ? 'active' : ''}`}
            onClick={() => setActiveCategory(null)}
          >
            <i className="bi bi-grid-3x3-gap" /> All
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              className={`category-tab ${activeCategory === c.slug ? 'active' : ''}`}
              onClick={() => setActiveCategory(activeCategory === c.slug ? null : c.slug)}
            >
              {c.icon && <i className={`bi ${c.icon}`} />} {c.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="product-grid">
          {productLoading ? (
            Array(12).fill(0).map((_, i) => <div key={i} className="product-card skeleton" />)
          ) : products.length === 0 ? (
            <div className="pos-empty">
              <i className="bi bi-box-seam" />
              <p>No products found</p>
            </div>
          ) : products.map(p => (
            <button
              key={p.id}
              className={`product-card ${p.current_stock <= 0 ? 'out-of-stock' : ''}`}
              onClick={() => {
                if (p.is_weighable) { setShowWeigh(p); return }
                addToCart(p)
                // On mobile, briefly indicate item was added
                if (window.innerWidth <= 768) {
                  flash(`Added: ${p.name}`, 'success', 1200)
                }
              }}
              disabled={!p.is_weighable && p.current_stock <= 0}
            >
              <div className="product-card-img">
                {p.image ? <img src={p.image} alt={p.name} /> : <i className="bi bi-box-seam" />}
              </div>
              <div className="product-card-info">
                <span className="product-card-name">{p.name}</span>
                <span className="product-card-price">{fmt(p.selling_price)}</span>
                <span className={`product-card-stock ${p.current_stock <= 5 ? 'low' : ''}`}>
                  {p.current_stock <= 0 ? 'Out of stock' : `Stock: ${p.current_stock}`}
                </span>
              </div>
              {p.is_weighable && (
                <span className="weigh-badge"><i className="bi bi-speedometer" /></span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mobile: cart overlay backdrop ───────────────────────────── */}
      <div
        className={`cart-drawer-overlay ${cartOpen ? '' : 'hidden'}`}
        onClick={closeCart}
      />

      {/* ── Right: Cart panel (drawer on mobile) ─────────────────────── */}
      <div className={`pos-cart-panel ${cartOpen ? 'cart-open' : ''}`}>

        {/* Cart header */}
        <div className="cart-header">
          <h2>
            <i className="bi bi-cart3" />
            Cart
            <span className="cart-count">{cart.length}</span>
          </h2>
          <div className="cart-actions">
            {/* Drawer status */}
            {drawer ? (
              <span className="drawer-pill open">
                <i className="bi bi-safe2" /> Open
              </span>
            ) : (
              <button className="drawer-pill closed" onClick={() => setShowOpenDrawer(true)}>
                <i className="bi bi-safe2" /> Open Drawer
              </button>
            )}
            {cart.length > 0 && (
              <button className="btn-icon" style={{ color: 'rgba(255,255,255,0.6)' }} onClick={clearCart} title="Clear cart">
                <i className="bi bi-trash3" />
              </button>
            )}
            {/* Mobile close button */}
            <button
              className="btn-icon"
              style={{ color: 'rgba(255,255,255,0.7)', display: 'none' }}
              id="cart-close-btn"
              onClick={closeCart}
              aria-label="Close cart"
            >
              <i className="bi bi-chevron-down" />
            </button>
          </div>
        </div>

        {/* Customer */}
        <div className="cart-customer" onClick={() => setShowCustomer(true)}>
          {customer ? (
            <>
              <div className="customer-avatar">{customer.full_name[0]}</div>
              <div className="customer-details">
                <span className="customer-name">{customer.full_name}</span>
                <span className="customer-points">
                  <i className="bi bi-award" /> {customer.loyalty_points} pts
                </span>
              </div>
              <button
                className="btn-icon"
                onClick={e => { e.stopPropagation(); setCustomer(null); setPointsToRedeem(0) }}
              >
                <i className="bi bi-x" />
              </button>
            </>
          ) : (
            <>
              <i className="bi bi-person-circle customer-placeholder-icon" />
              <span className="customer-placeholder">Walk-in customer — tap to add</span>
              <i className="bi bi-chevron-right" style={{ color: 'var(--gray-300)', fontSize: '0.8rem' }} />
            </>
          )}
        </div>

        {/* Cart items */}
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <i className="bi bi-cart-x" />
              <p>Cart is empty</p>
              <span>Tap products or scan barcode to add items</span>
            </div>
          ) : cart.map(item => (
            <div key={item.product.id} className="cart-item">
              <div className="cart-item-info">
                <span className="cart-item-name">{item.product.name}</span>
                <span className="cart-item-price">{fmt(item.product.selling_price)} × {item.quantity}</span>
              </div>
              <div className="cart-item-controls">
                <div className="qty-control">
                  <button onClick={() => updateQty(item.product.id, item.quantity - 1)}>
                    <i className="bi bi-dash" />
                  </button>
                  <input
                    type="number"
                    value={item.quantity}
                    min="0.001"
                    step={item.product.unit === 'kg' ? '0.1' : '1'}
                    onChange={e => updateQty(item.product.id, Number(e.target.value))}
                    className="qty-input"
                  />
                  <button onClick={() => updateQty(item.product.id, item.quantity + 1)}>
                    <i className="bi bi-plus" />
                  </button>
                </div>
                <span className="cart-item-total">
                  {fmt(item.product.selling_price * item.quantity - item.discount)}
                </span>
                <button
                  className="btn-icon btn-danger-icon"
                  onClick={() => removeFromCart(item.product.id)}
                >
                  <i className="bi bi-trash3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        {cart.length > 0 && (
          <div className="cart-totals">
            <div className="total-row">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="total-row discount-row">
                <span>Discount</span><span>- {fmt(discountAmount)}</span>
              </div>
            )}
            {pointsToRedeem > 0 && (
              <div className="total-row discount-row">
                <span>Points ({pointsToRedeem} pts)</span><span>- {fmt(pointsValue)}</span>
              </div>
            )}
            <div className="grand-total">
              <span>TOTAL</span><span>{fmt(total)}</span>
            </div>
            {customer && (
              <div className="points-earn-note">
                <i className="bi bi-award" /> Customer will earn {pointsEarnable} loyalty points
              </div>
            )}
          </div>
        )}

        {/* Payment method selector */}
        {cart.length > 0 && (
          <div className="payment-methods">
            {PAYMENT_METHODS.map(pm => (
              <button
                key={pm.key}
                className={`payment-method-btn ${paymentMethod === pm.key ? 'active' : ''}`}
                onClick={() => setPaymentMethod(pm.key)}
              >
                <i className={`bi ${pm.icon}`} />
                <span>{pm.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Checkout button */}
        <button
          className="btn btn-primary btn-full btn-xl checkout-btn"
          disabled={cart.length === 0}
          onClick={() => setShowCheckout(true)}
        >
          <i className="bi bi-bag-check-fill" /> Checkout — {fmt(total)}
        </button>
      </div>

      {/* ── Mobile FAB: open cart ────────────────────────────────────── */}
      <button
        className="cart-toggle-fab"
        onClick={openCart}
        aria-label={`Open cart (${cart.length} items)`}
      >
        <i className="bi bi-cart3" />
        {cart.length > 0 && (
          <span className="fab-badge">{cart.length}</span>
        )}
      </button>

      {/* ── Checkout Modal ───────────────────────────────────────────── */}
      <Modal
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        title="Complete Sale"
        size="md"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowCheckout(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCheckout} disabled={loading}>
              {loading
                ? <><div className="spinner-ring spinner-sm" /> Processing...</>
                : <><i className="bi bi-bag-check-fill" /> Confirm Sale</>}
            </button>
          </>
        }
      >
        <div className="checkout-modal">
          <div className="checkout-summary">
            <div className="checkout-row"><span>Items</span><span>{cart.length}</span></div>
            <div className="checkout-row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            {discountAmount > 0 && (
              <div className="checkout-row text-green">
                <span>Discount</span><span>-{fmt(discountAmount)}</span>
              </div>
            )}
            {pointsToRedeem > 0 && (
              <div className="checkout-row text-green">
                <span>Points Discount</span><span>-{fmt(pointsValue)}</span>
              </div>
            )}
            <div className="checkout-row total-row" style={{ fontWeight: 700, marginTop: 6 }}>
              <span>TOTAL</span><strong>{fmt(total)}</strong>
            </div>
          </div>

          <div className="checkout-payment">
            <h4>Payment: <span className="text-primary">{paymentMethod.toUpperCase()}</span></h4>

            {paymentMethod === 'cash' && (
              <div className="form-field">
                <label className="form-label">Amount Tendered (KES)</label>
                <div className="input-group">
                  <span className="input-icon"><i className="bi bi-cash-coin" /></span>
                  <input
                    type="number"
                    className="form-input form-input-lg"
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)}
                    placeholder={total.toFixed(2)}
                    autoFocus
                  />
                </div>
                {amountPaid && Number(amountPaid) >= total && (
                  <div className="change-display">
                    <span>Change: </span><strong className="text-green">{fmt(change)}</strong>
                  </div>
                )}
                <div className="quick-amounts">
                  {[500, 1000, 2000, 5000].map(a => (
                    <button key={a} className="quick-amount-btn" onClick={() => setAmountPaid(a)}>
                      {a.toLocaleString()}
                    </button>
                  ))}
                  <button className="quick-amount-btn" onClick={() => setAmountPaid(Math.ceil(total / 100) * 100)}>
                    Exact
                  </button>
                </div>
              </div>
            )}

            {paymentMethod === 'mpesa' && (
              <div className="form-field">
                <label className="form-label">Customer's Safaricom Number</label>
                <div className="input-group">
                  <span className="input-icon"><i className="bi bi-phone" /></span>
                  <input
                    type="tel"
                    className="form-input"
                    value={mpesaPhone}
                    onChange={e => setMpesaPhone(e.target.value)}
                    placeholder="07XXXXXXXX"
                  />
                </div>
                <span className="form-hint">STK Push will be sent to this number</span>
              </div>
            )}

            {customer && customer.loyalty_points >= 100 && (
              <div className="form-field redeem-points-section">
                <label className="form-label">
                  <i className="bi bi-award" /> Redeem Loyalty Points
                  <span className="available-points">
                    Available: {customer.loyalty_points} pts = {fmt(customer.loyalty_points)}
                  </span>
                </label>
                <div className="input-group">
                  <input
                    type="number"
                    className="form-input"
                    value={pointsToRedeem}
                    onChange={e => setPointsToRedeem(Math.min(Number(e.target.value), customer.loyalty_points, total))}
                    min="0"
                    max={Math.min(customer.loyalty_points, total)}
                    step="100"
                  />
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setPointsToRedeem(Math.min(customer.loyalty_points, Math.floor(total)))}
                  >
                    Max
                  </button>
                </div>
              </div>
            )}

            {/* Discount */}
            <div className="form-field">
              <label className="form-label">Discount</label>
              <div className="discount-row-form">
                <select
                  className="form-select"
                  value={discount.type}
                  onChange={e => setDiscount(d => ({ ...d, type: e.target.value }))}
                >
                  <option value="amount">Fixed (KES)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
                <input
                  type="number"
                  className="form-input"
                  value={discount.value}
                  onChange={e => setDiscount(d => ({ ...d, value: e.target.value }))}
                  min="0"
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── M-Pesa waiting modal ─────────────────────────────────────── */}
      <Modal isOpen={showMpesa} onClose={() => {}} title="M-Pesa Payment" size="sm">
        <div className="mpesa-modal">
          {mpesaStatus === 'pending' && (
            <>
              <div className="mpesa-logo"><i className="bi bi-phone" /></div>
              <div className="spinner-ring" />
              <h3>STK Push Sent</h3>
              <p>Customer should check their phone <strong>{mpesaPhone}</strong> and enter M-Pesa PIN</p>
              <p className="mpesa-amount">Amount: <strong>{fmt(total)}</strong></p>
            </>
          )}
          {mpesaStatus === 'completed' && (
            <>
              <div className="mpesa-success"><i className="bi bi-check-circle-fill" /></div>
              <h3>Payment Received!</h3>
              <p className="text-green">M-Pesa transaction confirmed</p>
            </>
          )}
          {mpesaStatus === 'failed' && (
            <>
              <div className="mpesa-failed"><i className="bi bi-x-circle-fill" /></div>
              <h3>Payment Failed</h3>
              <p>Customer cancelled or timed out.</p>
              <button className="btn btn-primary" onClick={() => setShowMpesa(false)}>Try Again</button>
            </>
          )}
        </div>
      </Modal>

      {/* ── Receipt Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        title="Sale Receipt"
        size="md"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowReceipt(false)}>Close</button>
            <button className="btn btn-outline" onClick={() => window.print()}>
              <i className="bi bi-printer" /> Print
            </button>
          </>
        }
      >
        {completedSale && <Receipt sale={completedSale} />}
      </Modal>

      {/* ── Customer Lookup Modal ────────────────────────────────────── */}
      <Modal isOpen={showCustomer} onClose={() => setShowCustomer(false)} title="Find Customer" size="sm">
        <div className="form-field">
          <div className="search-bar">
            <i className="bi bi-search search-icon" />
            <input
              className="search-input"
              value={customerSearch}
              onChange={e => searchCustomer(e.target.value)}
              placeholder="Search by phone number..."
              autoFocus
            />
          </div>
        </div>
        {customerLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}><div className="spinner-ring" /></div>}
        {customerResults.map(c => (
          <div key={c.id} className="customer-result" onClick={() => selectCustomer(c)}>
            <div className="customer-result-avatar">{c.full_name[0]}</div>
            <div>
              <strong>{c.full_name}</strong>
              <span>{c.phone}</span>
            </div>
            <div className="customer-result-points">
              <i className="bi bi-award" /> {c.loyalty_points} pts
            </div>
          </div>
        ))}
        <div className="modal-footer-note">
          <button className="btn btn-outline btn-full" onClick={() => setShowCustomer(false)}>
            Continue as Walk-in
          </button>
        </div>
      </Modal>

      {/* ── Open Drawer Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={showOpenDrawer}
        onClose={() => setShowOpenDrawer(false)}
        title="Open Cash Drawer"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowOpenDrawer(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleOpenDrawer}>Open Drawer</button>
          </>
        }
      >
        <div className="form-field">
          <label className="form-label">Opening Float (KES)</label>
          <input
            type="number"
            className="form-input"
            value={openFloat}
            onChange={e => setOpenFloat(e.target.value)}
            placeholder="e.g. 5000"
            autoFocus
          />
        </div>
      </Modal>

      {/* ── Weighable item modal ─────────────────────────────────────── */}
      {showWeigh && (
        <WeighModal
          product={showWeigh}
          onAdd={(p, qty) => { addToCart(p, qty); setShowWeigh(null) }}
          onClose={() => setShowWeigh(null)}
        />
      )}
    </div>
  )
}

/* ── Receipt component ──────────────────────────────────────────────────── */
function Receipt({ sale }) {
  return (
    <div className="receipt">
      <div className="receipt-header">
        <h2>NAIVAS SUPERMARKET</h2>
        <p>{sale.branch?.name}</p>
        <div className="receipt-divider" />
        <div className="receipt-meta">
          <div><span>Receipt#:</span><strong>{sale.receipt_number}</strong></div>
          <div><span>Date:</span><span>{new Date(sale.created_at).toLocaleString('en-KE')}</span></div>
          <div><span>Cashier:</span><span>{sale.cashier_name}</span></div>
          {sale.customer_name && <div><span>Customer:</span><span>{sale.customer_name}</span></div>}
        </div>
        <div className="receipt-divider" />
      </div>
      <div className="receipt-items">
        {sale.items?.map((item, i) => (
          <div key={i} className="receipt-item">
            <span className="receipt-item-name">{item.product_name}</span>
            <span className="receipt-item-qty">x{item.quantity}</span>
            <span className="receipt-item-price">
              KES {Number(item.line_total).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
      <div className="receipt-divider" />
      <div className="receipt-totals">
        <div>
          <span>Subtotal</span>
          <span>KES {Number(sale.subtotal).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
        </div>
        {Number(sale.discount_amount) > 0 && (
          <div className="text-green">
            <span>Discount</span>
            <span>-KES {Number(sale.discount_amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
        {Number(sale.points_redeemed_value) > 0 && (
          <div className="text-green">
            <span>Points Redeemed</span>
            <span>-KES {Number(sale.points_redeemed_value).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
        <div>
          <span>VAT (16%)</span>
          <span>KES {Number(sale.tax_total).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="receipt-total">
          <span>TOTAL</span>
          <strong>KES {Number(sale.total_amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong>
        </div>
        <div>
          <span>Paid ({sale.payment_method?.toUpperCase()})</span>
          <span>KES {Number(sale.amount_paid).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
        </div>
        {Number(sale.change_given) > 0 && (
          <div>
            <span>Change</span>
            <span>KES {Number(sale.change_given).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
        {sale.mpesa_reference && (
          <div><span>M-Pesa Ref</span><span>{sale.mpesa_reference}</span></div>
        )}
        {sale.points_earned > 0 && (
          <div className="text-primary">
            <span>Points Earned</span><span>+{sale.points_earned} pts</span>
          </div>
        )}
      </div>
      <div className="receipt-footer">
        <p>Thank you for shopping at Naivas!</p>
        <p>Goods once sold are not returnable without receipt.</p>
        <p className="receipt-pin">Powered by NaivasPOS</p>
      </div>
    </div>
  )
}

/* ── Weigh modal ────────────────────────────────────────────────────────── */
function WeighModal({ product, onAdd, onClose }) {
  const [weight, setWeight] = useState('')
  const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Enter Weight — ${product.name}`}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => weight > 0 && onAdd(product, Number(weight))}
          >
            Add to Cart
          </button>
        </>
      }
    >
      <div className="form-field">
        <label className="form-label">Weight (kg)</label>
        <input
          type="number"
          className="form-input form-input-lg"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          placeholder="0.000"
          step="0.001"
          min="0.001"
          autoFocus
        />
        <span className="form-hint">Price per kg: {fmt(product.selling_price)}</span>
        {weight > 0 && (
          <div className="weigh-preview">
            Total: <strong>{fmt(product.selling_price * weight)}</strong>
          </div>
        )}
      </div>
    </Modal>
  )
}