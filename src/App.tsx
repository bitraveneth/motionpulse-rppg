import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PersistentLab } from './components/PersistentLab'
import { AccountPage } from './pages/AccountPage'
import { FeedPage } from './pages/FeedPage'
import { FindingsPage } from './pages/FindingsPage'
import { HomePage } from './pages/HomePage'
import { LocalLabPage } from './pages/LocalLabPage'
import { ResultsPage } from './pages/ResultsPage'
import { ScanPage } from './pages/ScanPage'
import { TrainPage } from './pages/TrainPage'
import { TrainResultsPage } from './pages/TrainResultsPage'
import { SignInPage } from './pages/SignInPage'
import { AdminApp } from './pages/admin/AdminApp'

function HomeOrFeed() {
  if (window.location.hash === '#feed') {
    return <Navigate to="/feed" replace />
  }
  if (window.location.hash === '#how-it-works') {
    return <Navigate to="/scan" replace />
  }
  if (window.location.hash === '#local-lab') {
    return <Navigate to="/local-lab" replace />
  }
  return <HomePage />
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="atmosphere" aria-hidden />
        <PersistentLab />
        <Routes>
          <Route path="/" element={<HomeOrFeed />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/research" element={<Navigate to="/local-lab" replace />} />
          <Route path="/local-lab" element={<LocalLabPage />} />
          <Route path="/train" element={<TrainPage />} />
          <Route path="/train-results" element={<TrainResultsPage />} />
          <Route path="/train-results/:runId" element={<TrainResultsPage />} />
          <Route path="/findings" element={<FindingsPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/results/:testId" element={<ResultsPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
