// context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import { useFlash } from './FlashContext'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { flash } = useFlash()

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      authAPI.me()
        .then(({ data }) => setUser(data))
        .catch(() => { localStorage.clear(); setUser(null) })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await authAPI.login(email, password)
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    setUser(data.user)
    flash(`Welcome back, ${data.user.first_name}!`, 'success')
    navigate('/dashboard')
  }, [navigate, flash])

  const logout = useCallback(async () => {
    try {
      const refresh = localStorage.getItem('refresh_token')
      await authAPI.logout(refresh)
    } catch {}
    localStorage.clear()
    setUser(null)
    flash('You have been logged out.', 'info')
    navigate('/login')
  }, [navigate, flash])

  const hasRole = useCallback((...roles) => {
    return user && roles.includes(user.role)
  }, [user])

  const canDo = useCallback((perm) => {
    if (!user) return false
    const perms = {
      admin: ['all'],
      manager: ['view_reports', 'manage_products', 'approve_discount', 'void_sale', 'manage_customers', 'manage_users'],
      supervisor: ['approve_discount', 'void_sale', 'view_reports'],
      cashier: ['create_sale', 'view_own_sales'],
    }
    const rolePerms = perms[user.role] || []
    return rolePerms.includes('all') || rolePerms.includes(perm)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, canDo }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}