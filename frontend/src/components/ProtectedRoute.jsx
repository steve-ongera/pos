// components/ProtectedRoute.jsx
import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Spinner from './Spinner'

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner fullscreen />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="access-denied">
        <div className="access-denied-inner">
          <i className="bi bi-shield-lock-fill" />
          <h2>Access Denied</h2>
          <p>You don't have permission to view this page.</p>
          <a href="/dashboard" className="btn btn-primary">Back to Dashboard</a>
        </div>
      </div>
    )
  }
  return children
}