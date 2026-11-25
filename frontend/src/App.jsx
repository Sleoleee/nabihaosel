import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { pageAllowed } from './auth/access'
import Topbar from './components/Topbar'
import GlobalFilterBar from './components/GlobalFilterBar'
import { GlobalFilterProvider } from './context/GlobalFilters'
import Overview from './pages/Overview'
import CustomerIntelligence from './pages/CustomerIntelligence'
import ScaffoldPage from './pages/ScaffoldPage'
import SalesPerformancePage from './pages/SalesPerformancePage'
import ProductOpportunityPage from './pages/ProductOpportunityPage'
import TerritoryPage from './pages/TerritoryPage'
import SettingsGroupsPage from './pages/SettingsGroupsPage'
import SettingsTargetsPage from './pages/SettingsTargetsPage'
import SettingsMappingPage from './pages/SettingsMappingPage'
import QaPage from './pages/QaPage'
import Upload from './pages/Upload'
import ReportCenterPage from './pages/ReportCenterPage'
import LockPage from './pages/LockPage'
import SplashScreen from './pages/SplashScreen'
import { useAuth } from './context/Auth'
import { useState } from 'react'

export default function App() {
  const { user, ready } = useAuth()
  const [splashDone, setSplashDone] = useState(false)
  if (!ready) return null
  // Splash intro tampil tepat sebelum halaman login (hanya saat belum login).
  if (!user) {
    if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />
    return <LockPage />
  }
  return (
    <BrowserRouter>
      <GlobalFilterProvider>
        <Topbar />
        <main style={{
          marginTop: 54, padding: '0 32px 28px', minHeight: 'calc(100vh - 54px)',
          background: 'var(--color-bg)', boxSizing: 'border-box',
        }}>
          <GlobalFilterBar />
          <div style={{ paddingTop: 16 }}>
            {(() => {
              const home = user.pages === 'all' ? '/' : '/sales'
              const G = (path, el) => (pageAllowed(user, path) ? el : <Navigate to={home} replace />)
              return (
                <Routes>
                  <Route path="/" element={G('/', <Overview />)} />
                  <Route path="/sales" element={G('/sales', <SalesPerformancePage />)} />
                  <Route path="/customers" element={G('/customers', <CustomerIntelligence />)} />
                  <Route path="/products" element={G('/products', <ProductOpportunityPage />)} />
                  <Route path="/territory" element={G('/territory', <TerritoryPage />)} />
                  <Route path="/settings/mapping" element={G('/settings/mapping', <SettingsMappingPage />)} />
                  <Route path="/settings/groups" element={G('/settings/groups', <SettingsGroupsPage />)} />
                  <Route path="/settings/targets" element={G('/settings/targets', <SettingsTargetsPage />)} />
                  <Route path="/reports" element={G('/reports', <ReportCenterPage />)} />
                  <Route path="/upload" element={G('/upload', <Upload />)} />
                  <Route path="/qa" element={<QaPage />} />
                  <Route path="*" element={<Navigate to={home} replace />} />
                </Routes>
              )
            })()}
          </div>
        </main>
      </GlobalFilterProvider>
    </BrowserRouter>
  )
}
