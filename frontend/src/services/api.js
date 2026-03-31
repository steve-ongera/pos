import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// ── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: token refresh ──────────────────────────────────────
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token))
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        }).catch(err => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) {
        isRefreshing = false
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh })
        localStorage.setItem('access_token', data.access)
        api.defaults.headers.Authorization = `Bearer ${data.access}`
        processQueue(null, data.access)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login/', { email, password }),
  logout: (refresh) => api.post('/auth/logout/', { refresh }),
  me: () => api.get('/auth/me/'),
  changePassword: (data) => api.post('/auth/change-password/', data),
  verifyPin: (pin) => api.post('/auth/verify-pin/', { pin }),
  verifySupervisor: (data) => api.post('/auth/supervisor/verify/', data),
  refreshToken: (refresh) => api.post('/auth/token/refresh/', { refresh }),
}

// ─── Products ─────────────────────────────────────────────────────────────────
export const productsAPI = {
  list: (params) => api.get('/products/', { params }),
  posList: (params) => api.get('/products/pos-list/', { params }),
  detail: (id) => api.get(`/products/${id}/`),
  create: (data) => api.post('/products/', data),
  update: (id, data) => api.patch(`/products/${id}/`, data),
  delete: (id) => api.delete(`/products/${id}/`),
  barcodeLookup: (barcode) => api.get(`/products/barcode/${barcode}/`),
}

// ─── Categories ───────────────────────────────────────────────────────────────
export const categoriesAPI = {
  list: (params) => api.get('/categories/', { params }),
  create: (data) => api.post('/categories/', data),
  update: (id, data) => api.patch(`/categories/${id}/`, data),
  delete: (id) => api.delete(`/categories/${id}/`),
}

// ─── Customers ────────────────────────────────────────────────────────────────
export const customersAPI = {
  list: (params) => api.get('/customers/', { params }),
  detail: (id) => api.get(`/customers/${id}/`),
  create: (data) => api.post('/customers/', data),
  update: (id, data) => api.patch(`/customers/${id}/`, data),
  lookup: (params) => api.get('/customers/lookup/', { params }),
  loyaltyHistory: (id) => api.get(`/customers/${id}/loyalty_history/`),
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export const salesAPI = {
  list: (params) => api.get('/sales/', { params }),
  detail: (id) => api.get(`/sales/${id}/`),
  create: (data) => api.post('/sales/', data),
  void: (id, data) => api.post(`/sales/${id}/void/`, data),
  completeMpesa: (id, data) => api.post(`/sales/${id}/complete-mpesa/`, data),
}

// ─── M-Pesa ───────────────────────────────────────────────────────────────────
export const mpesaAPI = {
  stkPush: (data) => api.post('/mpesa/stk-push/', data),
  checkStatus: (checkoutRequestId) => api.get(`/mpesa/status/${checkoutRequestId}/`),
}

// ─── Cash Drawer ─────────────────────────────────────────────────────────────
export const drawerAPI = {
  current: () => api.get('/cash-drawer/current/'),
  open: (opening_float) => api.post('/cash-drawer/open/', { opening_float }),
  close: (id, data) => api.post(`/cash-drawer/${id}/close/`, data),
  list: (params) => api.get('/cash-drawer/', { params }),
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryAPI = {
  list: (params) => api.get('/inventory/', { params }),
  update: (id, data) => api.patch(`/inventory/${id}/`, data),
  create: (data) => api.post('/inventory/', data),
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  summary: () => api.get('/dashboard/'),
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsAPI = {
  sales: (params) => api.get('/reports/sales/', { params }),
  products: (params) => api.get('/reports/products/', { params }),
  cashier: (params) => api.get('/reports/cashier/', { params }),
}

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersAPI = {
  list: (params) => api.get('/users/', { params }),
  create: (data) => api.post('/users/', data),
  update: (id, data) => api.patch(`/users/${id}/`, data),
  deactivate: (id) => api.delete(`/users/${id}/`),
  supervisors: () => api.get('/users/supervisors/'),
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditAPI = {
  list: (params) => api.get('/audit-logs/', { params }),
}

// ─── Discounts ────────────────────────────────────────────────────────────────
export const discountsAPI = {
  list: () => api.get('/discounts/'),
  create: (data) => api.post('/discounts/', data),
  update: (id, data) => api.patch(`/discounts/${id}/`, data),
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────
export const loyaltyAPI = {
  redeem: (data) => api.post('/loyalty/redeem/', data),
  history: (customerId) => api.get(`/loyalty/history/${customerId}/`),
}

export default api