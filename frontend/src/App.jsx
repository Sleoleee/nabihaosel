import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import CustomerIntelligence from './pages/CustomerIntelligence'
import Products from './pages/Products'
import SalesPerformance from './pages/SalesPerformance'
import Discounts from './pages/Discounts'
import Upload from './pages/Upload'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{
          marginLeft: 220, flex: 1, padding: 32,
          minHeight: '100vh', background: 'var(--color-bg)',
        }}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/customers" element={<CustomerIntelligence />} />
            <Route path="/products" element={<Products />} />
            <Route path="/sales" element={<SalesPerformance />} />
            <Route path="/discounts" element={<Discounts />} />
            <Route path="/upload" element={<Upload />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
