import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFlash } from '../context/FlashContext'

export default function Login() {
  const { login, user } = useAuth()
  const { flash } = useFlash()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const validate = () => {
    const e = {}
    if (!form.email) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.password) e.password = 'Password is required'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    setErrors({})
    try {
      await login(form.email, form.password)
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Check your credentials.'
      flash(msg, 'error')
      setErrors({ general: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Animated background */}
      <div className="login-bg">
        <div className="login-bg-pattern" />
      </div>

      <div className="login-container">
        {/* Single centered card */}
        <div className="login-card">

          {/* Card header with brand */}
          <div className="login-card-header">
            <div className="login-logo-wrap">
              <i className="bi bi-shop-window" />
            </div>
            <span className="login-brand-name">NaivasPOS</span>
            <span className="login-brand-tagline">Professional Point of Sale System</span>
          </div>

          {/* Card body with form */}
          <div className="login-card-body">
            <h2>Welcome back</h2>
            <p>Sign in to access your POS terminal</p>

            {errors.general && (
              <div className="alert alert-error" style={{ marginBottom: '20px' }}>
                <i className="bi bi-exclamation-circle-fill" />
                {errors.general}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-field">
                <label className="form-label">Email Address</label>
                <div className="input-group">
                  <span className="input-icon"><i className="bi bi-envelope" /></span>
                  <input
                    type="email"
                    className={`form-input ${errors.email ? 'input-error' : ''}`}
                    placeholder="cashier@naivas.co.ke"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                {errors.email && (
                  <span className="form-error">
                    <i className="bi bi-exclamation-circle" /> {errors.email}
                  </span>
                )}
              </div>

              <div className="form-field">
                <label className="form-label">Password</label>
                <div className="input-group">
                  <span className="input-icon"><i className="bi bi-lock" /></span>
                  <input
                    type={showPass ? 'text' : 'password'}
                    className={`form-input ${errors.password ? 'input-error' : ''}`}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowPass(s => !s)}
                    tabIndex={-1}
                  >
                    <i className={`bi ${showPass ? 'bi-eye-slash' : 'bi-eye'}`} />
                  </button>
                </div>
                {errors.password && (
                  <span className="form-error">
                    <i className="bi bi-exclamation-circle" /> {errors.password}
                  </span>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={loading}
                style={{ marginTop: '4px' }}
              >
                {loading ? (
                  <><div className="spinner-ring spinner-sm" /> Signing in...</>
                ) : (
                  <><i className="bi bi-box-arrow-in-right" /> Sign In</>
                )}
              </button>
            </form>

            <div className="login-footer-note">
              <i className="bi bi-shield-lock" />
              <span>This system is monitored. All actions are logged.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}