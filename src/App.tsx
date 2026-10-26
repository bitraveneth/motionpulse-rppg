import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AccountPage } from './pages/AccountPage'
import { HomePage } from './pages/HomePage'
import { ScanPage } from './pages/ScanPage'
import { SignInPage } from './pages/SignInPage'
import { AdminApp } from './pages/admin/AdminApp'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="atmosphere" aria-hidden />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
