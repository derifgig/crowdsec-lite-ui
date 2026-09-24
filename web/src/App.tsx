import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import StatusBar from './components/StatusBar'
import AlertsPage from './pages/AlertsPage'
import DecisionsPage from './pages/DecisionsPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        {/* Nav */}
        <header className="bg-slate-800 border-b border-slate-700 px-4 py-0 flex items-center h-12 gap-6 shrink-0">
          <span className="text-white font-semibold tracking-tight text-sm">
            🛡 CrowdSec Lite
          </span>

          <nav className="flex items-center gap-1 h-full">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center h-full px-3 text-sm border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-400 text-white'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`
              }
            >
              Alerts
            </NavLink>
            <NavLink
              to="/decisions"
              className={({ isActive }) =>
                `flex items-center h-full px-3 text-sm border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-400 text-white'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`
              }
            >
              Decisions
            </NavLink>
          </nav>

          <div className="ml-auto">
            <StatusBar />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<AlertsPage />} />
            <Route path="/decisions" element={<DecisionsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
