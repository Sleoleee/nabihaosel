import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: BASE })

export const buildParams = (filters = {}) => {
  const params = {}
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== 'all') params[k] = v
  })
  return params
}

// Overview
export const getFilters = () => api.get('/api/overview/filters').then(r => r.data)
export const getKPI = (f) => api.get('/api/overview/kpi', { params: buildParams(f) }).then(r => r.data)
export const getRevenueTrend = (f) => api.get('/api/overview/revenue-trend', { params: buildParams(f) }).then(r => r.data)
export const getBillsAOV = (f) => api.get('/api/overview/bills-aov', { params: buildParams(f) }).then(r => r.data)
export const getByKategori = (f) => api.get('/api/overview/by-kategori', { params: buildParams(f) }).then(r => r.data)
export const getByBranch = (f) => api.get('/api/overview/by-branch', { params: buildParams(f) }).then(r => r.data)
export const getAlerts = (f) => api.get('/api/overview/alerts', { params: buildParams(f) }).then(r => r.data)

// Customers
export const getRFM = (f) => api.get('/api/customers/rfm', { params: buildParams(f) }).then(r => r.data)
export const getTiers = (f) => api.get('/api/customers/tiers', { params: buildParams(f) }).then(r => r.data)
export const getCustomerList = (f) => api.get('/api/customers/list', { params: f }).then(r => r.data)
export const getRecency = (f) => api.get('/api/customers/recency', { params: buildParams(f) }).then(r => r.data)

// Products
export const getKategoriTrend = (f) => api.get('/api/products/kategori-trend', { params: buildParams(f) }).then(r => r.data)
export const getKategoriGrowth = (f) => api.get('/api/products/kategori-growth', { params: buildParams(f) }).then(r => r.data)
export const getTopProducts = (f) => api.get('/api/products/top-products', { params: buildParams(f) }).then(r => r.data)
export const getHeatmap = (f) => api.get('/api/products/heatmap', { params: buildParams(f) }).then(r => r.data)

// Sales
export const getLeaderboard = (f) => api.get('/api/sales/leaderboard', { params: buildParams(f) }).then(r => r.data)
export const getSalesChart = (f) => api.get('/api/sales/chart', { params: buildParams(f) }).then(r => r.data)
export const getSalesDrilldown = (name, f) => api.get(`/api/sales/drilldown/${encodeURIComponent(name)}`, { params: buildParams(f) }).then(r => r.data)
export const getSalesScatter = (f) => api.get('/api/sales/scatter', { params: buildParams(f) }).then(r => r.data)

// Discounts
export const getDiscountOverview = (f) => api.get('/api/discounts/overview', { params: buildParams(f) }).then(r => r.data)
export const getDiscountDist = (f) => api.get('/api/discounts/distribution', { params: buildParams(f) }).then(r => r.data)
export const getDiscountMonthly = (f) => api.get('/api/discounts/monthly', { params: buildParams(f) }).then(r => r.data)
export const getDiscountByCustomer = (f) => api.get('/api/discounts/by-customer', { params: buildParams(f) }).then(r => r.data)
export const getPriceIntegrity = (f) => api.get('/api/discounts/price-integrity', { params: buildParams(f) }).then(r => r.data)

// Upload
export const checkYears = (years) => api.get('/api/upload/check-years', { params: { years: years.join(',') } }).then(r => r.data)
export const uploadFile = (file, mode) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/api/upload?mode=${mode}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
export const getUploadHistory = () => api.get('/api/upload/history').then(r => r.data)
