import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { ThemeProvider, useTheme } from './theme'
import StatusBar from './components/StatusBar'
import AlertsPage from './pages/AlertsPage'
import DecisionsPage from './pages/DecisionsPage'
import InfoPage from './pages/InfoPage'

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      style={{
        background: 'var(--btn-secondary)',
        border: '1px solid var(--border)',
        color: 'var(--text-base)',
        borderRadius: '6px',
        padding: '4px 10px',
        fontSize: '13px',
        cursor: 'pointer',
        lineHeight: 1.4,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--btn-secondary-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--btn-secondary)')}
    >
      {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
    </button>
  )
}

function Shell() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-base)', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--nav-border)',
        padding: '0 16px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: '14px', letterSpacing: '-0.01em', color: 'var(--text-base)' }}>
          🛡 CrowdSec Lite
        </span>

        <nav style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '2px' }}>
          {[
            { to: '/', label: 'Decisions', end: true },
            { to: '/alerts', label: 'Alerts', end: false },
            { to: '/info', label: 'Info', end: true },
          ].map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                height: '100%',
                padding: '0 12px',
                fontSize: '14px',
                borderBottom: isActive ? `2px solid var(--nav-active)` : '2px solid transparent',
                color: isActive ? 'var(--text-base)' : 'var(--nav-inactive)',
                textDecoration: 'none',
                transition: 'color 0.15s',
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ThemeToggle />
          <StatusBar />
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto' }}>
        <Routes>
          <Route path="/" element={<DecisionsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/info" element={<InfoPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </ThemeProvider>
  )
}
