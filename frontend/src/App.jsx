import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Topbar from './components/Topbar'
import GlobalFilterBar from './components/GlobalFilterBar'
import { GlobalFilterProvider } from './context/GlobalFilters'
import Overview from './pages/Overview'
import CustomerIntelligence from './pages/CustomerIntelligence'
import ScaffoldPage from './pages/ScaffoldPage'
import Upload from './pages/Upload'

export default function App() {
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
              <Route path="/sales" element={<ScaffoldPage title="Sales Performance" question="Seberapa baik tim menjual, siapa yang perlu ditindak?" prompt="PROMPT 3" />} />
              <Route path="/customers" element={<CustomerIntelligence />} />
              <Route path="/products" element={<ScaffoldPage title="Product Opportunity" question="Produk mana tumbuh, peluang apa yang belum digarap?" prompt="PROMPT 5" />} />
              <Route path="/upload" element={<Upload />} />
            </Routes>
          </div>
        </main>
      </GlobalFilterProvider>
    </BrowserRouter>
  )
}
