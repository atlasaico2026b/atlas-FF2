// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useEffect } from 'react'
import AccessGate, { type UserRole } from './components/AccessGate'
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'
import DesignWorkspace from './components/DesignWorkspace'
import FireCalcScreen from './components/FireCalcScreen'
import { LangProvider, useLang } from './lib/i18n'
import LanguageToggle from './components/LanguageToggle'

type AppScreen = 'landing' | 'dashboard' | 'workspace' | 'calc'

const AUTH_KEY = 'atlas_user'

export default function App() {
  return (
    <LangProvider>
      <AppInner />
    </LangProvider>
  )
}

function AppInner() {
  const { dir } = useLang()
  const [role, setRole] = useState<UserRole>(null)
  const [screen, setScreen] = useState<AppScreen>('landing')
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('guest') === '1') {
        const guest = { username: 'guest', name: 'کاربر مهمان', role: 'user' }
        localStorage.setItem(AUTH_KEY, JSON.stringify(guest))
        window.history.replaceState({}, '', window.location.pathname)
        setRole('user')
        return
      }
      const stored = localStorage.getItem(AUTH_KEY)
      if (stored) {
        const user = JSON.parse(stored)
        // The stored record is { username, name, role } — there is no `verified`
        // flag, so requiring one sent every reload back to the login form.
        if (user?.role === 'admin' || user?.role === 'user') {
          setRole(user.role)
        }
      }
    } catch { /* ignore */ }
  }, [])

  const handleAuthenticated = useCallback((userRole: UserRole) => {
    setRole(userRole)
  }, [])

  const handleEnterApp = useCallback(() => {
    setScreen('dashboard')
  }, [])

  const handleOpenProject = useCallback((id: string) => {
    setProjectId(id)
    setScreen('workspace')
  }, [])

  const handleBackToDashboard = useCallback(() => {
    setScreen('dashboard')
    setProjectId(null)
  }, [])

  const handleBackToLanding = useCallback(() => {
    setScreen('landing')
    setProjectId(null)
  }, [])

  const handleOpenCalc = useCallback(() => {
    setScreen('calc')
  }, [])

  const handleLogout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY)
    setRole(null)
    setScreen('landing')
    setProjectId(null)
  }, [])

  if (!role) {
    return (
      <div dir={dir}>
        <LanguageToggle floating />
        <AccessGate onAuthenticated={handleAuthenticated} />
      </div>
    )
  }

  return (
    <div dir={dir} className="min-h-screen bg-gradient-to-br from-sky-50 via-pink-50 to-rose-50">
      <LanguageToggle floating />
      {screen === 'landing' && (
        <LandingPage onEnter={handleEnterApp} />
      )}
      {screen === 'dashboard' && (
        <Dashboard
          onOpenProject={handleOpenProject}
          onOpenCalc={handleOpenCalc}
          onBack={handleBackToLanding}
          role={role}
          onLogout={handleLogout}
        />
      )}
      {screen === 'calc' && (
        <FireCalcScreen onBack={handleBackToDashboard} />
      )}
      {screen === 'workspace' && projectId && (
        <DesignWorkspace
          projectId={projectId}
          onBack={handleBackToDashboard}
        />
      )}
    </div>
  )
}
