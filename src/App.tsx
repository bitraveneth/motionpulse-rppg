import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AccountPage } from './pages/AccountPage'
import { FeedPage } from './pages/FeedPage'
import { HomePage } from './pages/HomePage'
import { ScanPage } from './pages/ScanPage'
import { SignInPage } from './pages/SignInPage'
import { AdminApp } from './pages/admin/AdminApp'

function HomeOrFeed() {
  if (window.location.hash === '#feed') {
    return <Navigate to="/feed" replace />
  }
  return <HomePage />
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="atmosphere" aria-hidden />
        <Routes>
          <Route path="/" element={<HomeOrFeed />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
