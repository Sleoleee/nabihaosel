import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
  const [showSplash, setShowSplash] = useState(() => {
    try { return !sessionStorage.getItem('syncSplashSeen') } catch { return true }
  })
  if (showSplash) return <SplashScreen onDone={() => {
    try { sessionStorage.setItem('syncSplashSeen', '1') } catch { /* ignore */ }
    setShowSplash(false)
  }} />
  if (!ready) return null
  if (!user) return <LockPage />
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
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/sales" element={<SalesPerformancePage />} />
              <Route path="/customers" element={<CustomerIntelligence />} />
              <Route path="/products" element={<ProductOpportunityPage />} />
              <Route path="/territory" element={<TerritoryPage />} />
              <Route path="/settings/mapping" element={<SettingsMappingPage />} />
              <Route path="/settings/groups" element={<SettingsGroupsPage />} />
              <Route path="/settings/targets" element={<SettingsTargetsPage />} />
              <Route path="/reports" element={<ReportCenterPage />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/qa" element={<QaPage />} />
            </Routes>
          </div>
        </main>
      </GlobalFilterProvider>
    </BrowserRouter>
  )
}
