import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { FlashProvider } from './context/FlashContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Spinner from './components/Spinner'

// Lazy-loaded pages
const Login       = lazy(() => import('./pages/Login'))
const Dashboard   = lazy(() => import('./pages/Dashboard'))
const POS         = lazy(() => import('./pages/POS'))
const Products    = lazy(() => import('./pages/Products'))
const Customers   = lazy(() => import('./pages/Customers'))
const Sales       = lazy(() => import('./pages/Sales'))
const Reports     = lazy(() => import('./pages/Reports'))
const Inventory   = lazy(() => import('./pages/Inventory'))
const Users       = lazy(() => import('./pages/Users'))
const Settings    = lazy(() => import('./pages/Settings'))
const AuditLogs   = lazy(() => import('./pages/AuditLogs'))
const NotFound    = lazy(() => import('./pages/NotFound'))

export default function App() {
  return (
    <BrowserRouter>
      <FlashProvider>
        <AuthProvider>
          <Suspense fallback={<Spinner fullscreen />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/pos" element={<POS />} />
                <Route path="/products" element={
                  <ProtectedRoute roles={['admin','manager']}><Products /></ProtectedRoute>
                } />
                <Route path="/customers" element={<Customers />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/reports" element={
                  <ProtectedRoute roles={['admin','manager','supervisor']}><Reports /></ProtectedRoute>
                } />
                <Route path="/inventory" element={
                  <ProtectedRoute roles={['admin','manager']}><Inventory /></ProtectedRoute>
                } />
                <Route path="/users" element={
                  <ProtectedRoute roles={['admin','manager']}><Users /></ProtectedRoute>
                } />
                <Route path="/audit-logs" element={
                  <ProtectedRoute roles={['admin','manager']}><AuditLogs /></ProtectedRoute>
                } />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </FlashProvider>
    </BrowserRouter>
  )
}