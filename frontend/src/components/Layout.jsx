import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { drawerAPI } from '../services/api'

const NAV_ITEMS = [
  { path: '/dashboard', icon: 'bi-speedometer2', label: 'Dashboard', roles: null },
  { path: '/pos', icon: 'bi-cart3', label: 'Point of Sale', roles: null },
  { path: '/sales', icon: 'bi-receipt', label: 'Sales', roles: null },
  { path: '/customers', icon: 'bi-people', label: 'Customers', roles: null },
  { path: '/products', icon: 'bi-box-seam', label: 'Products', roles: ['admin', 'manager'] },
  { path: '/inventory', icon: 'bi-archive', label: 'Inventory', roles: ['admin', 'manager'] },
  { path: '/reports', icon: 'bi-bar-chart-line', label: 'Reports', roles: ['admin', 'manager', 'supervisor'] },
  { path: '/users', icon: 'bi-person-badge', label: 'Users', roles: ['admin', 'manager'] },
  { path: '/audit-logs', icon: 'bi-journal-check', label: 'Audit Logs', roles: ['admin', 'manager'] },
  { path: '/settings', icon: 'bi-gear', label: 'Settings', roles: null },
]

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024)
  const [drawer, setDrawer] = useState(null)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    drawerAPI.current().then(({ data }) => setDrawer(data)).catch(() => {})
  }, [location.pathname])

  const isPOS = location.pathname === '/pos'
  const visibleNav = NAV_ITEMS.filter(item => !item.roles || hasRole(...item.roles))

  return (
    <div className={`layout ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <i className="bi bi-shop-window" />
          </div>
          <div className="brand-text">
            <span className="brand-name">NaivasPOS</span>
            <span className="brand-role">{user?.branch?.name || 'Main Store'}</span>
          </div>
          <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(false)}>
            <i className="bi bi-chevron-left" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {visibleNav.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <i className={`bi ${item.icon}`} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.full_name}</span>
              <span className={`user-role role-${user?.role}`}>{user?.role}</span>
            </div>
          </div>
          <button className="btn-logout" onClick={logout} title="Logout">
            <i className="bi bi-box-arrow-right" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-wrapper">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <i className="bi bi-list" />
            </button>
            <div className="page-breadcrumb">
              <span className="page-title">
                {NAV_ITEMS.find(n => location.pathname.startsWith(n.path))?.label || 'NaivasPOS'}
              </span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-clock">
              <i className="bi bi-clock" />
              <span>{time.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="topbar-date">{time.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>

            {/* Drawer status */}
            <div className={`drawer-badge ${drawer ? 'drawer-open' : 'drawer-closed'}`}
                 onClick={() => navigate('/pos')} title="Cash Drawer Status">
              <i className={`bi ${drawer ? 'bi-safe2' : 'bi-safe2-fill'}`} />
              <span>{drawer ? `KES ${Number(drawer.opening_float).toLocaleString()}` : 'No Drawer'}</span>
            </div>

            {!isPOS && (
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/pos')}>
                <i className="bi bi-cart-plus" /> New Sale
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  )
}