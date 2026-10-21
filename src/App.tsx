import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ScanPage } from './pages/ScanPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="atmosphere" aria-hidden />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/scan" element={<ScanPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
