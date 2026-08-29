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
import QaPage from './pages/QaPage'
import Upload from './pages/Upload'
import LockPage from './pages/LockPage'
import { useAuth } from './context/Auth'

export default function App() {
  const { user, ready } = useAuth()
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
              <Route path="/upload" element={<Upload />} />
              <Route path="/qa" element={<QaPage />} />
            </Routes>
          </div>
        </main>
      </GlobalFilterProvider>
    </BrowserRouter>
  )
}
