import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthContext, useAuthState } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import { iotService } from './services/iot'
import { getCredentials } from './services/auth'
import { useDeviceStore } from './store/deviceStore'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SimulatorPage = lazy(() => import('./pages/SimulatorPage'))
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const UsersManagementPage = lazy(() => import('./pages/UsersManagementPage'))

function PageFallback() {
  return (
    <div className="flex h-full min-h-[400px] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-hn-800 border-t-transparent dark:border-sky-400 dark:border-t-transparent" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando módulo...</p>
      </div>
    </div>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useDeviceStore(s => s.sidebarCollapsed)

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300">
      <Sidebar />
      <div className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out ${
        sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      }`}>
        <main className="flex-1 p-6 md:p-8 pt-20 lg:pt-8 overflow-y-auto">
          <Suspense fallback={<PageFallback />}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const auth = useAuthState()
  const theme = useDeviceStore(s => s.theme)
  const loadPatientsFromDb = useDeviceStore(s => s.loadPatientsFromDb)

  // Listen to global theme change and apply dark class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    if (auth.loading) return

    let active = true

    if (auth.user) {
      // Cargar pacientes desde la Base de Datos al iniciar sesión
      loadPatientsFromDb()

      const initIot = async () => {
        try {
          const creds = await getCredentials()
          if (active) {
            await iotService.connect(creds)
          }
        } catch (err) {
          console.error('[App] Error conectando a IoT:', err)
        }
      }
      initIot()
    } else {
      iotService.disconnect()
    }

    return () => {
      active = false
    }
  }, [auth.user, auth.loading, loadPatientsFromDb])

  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout><DashboardPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/monitoring"
              element={
                <ProtectedRoute>
                  <Layout><MonitoringPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/alerts"
              element={
                <ProtectedRoute>
                  <Layout><AlertsPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={<Navigate to="/monitoring" replace />}
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Layout><ProfilePage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['admin', 'doctor', 'nurse']}>
                  <Layout><UsersManagementPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/simulator"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Layout><SimulatorPage /></Layout>
                </ProtectedRoute>
              }
            />

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
