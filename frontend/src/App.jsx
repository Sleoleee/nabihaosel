import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Topbar from './components/Topbar'
import Overview from './pages/Overview'
import CustomerIntelligence from './pages/CustomerIntelligence'
import Upload from './pages/Upload'

export default function App() {
  return (
    <BrowserRouter>
      <Topbar />
      <main style={{
        marginTop: 56,
        padding: '28px 32px',
        minHeight: 'calc(100vh - 56px)',
        background: 'var(--color-bg)',
        boxSizing: 'border-box',
      }}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/customers" element={<CustomerIntelligence />} />
          <Route path="/upload" element={<Upload />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
