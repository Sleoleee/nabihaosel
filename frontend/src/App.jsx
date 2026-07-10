import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import CustomerIntelligence from './pages/CustomerIntelligence'
import Products from './pages/Products'
import SalesPerformance from './pages/SalesPerformance'
import Discounts from './pages/Discounts'
import Upload from './pages/Upload'
import './dashboard.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
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
