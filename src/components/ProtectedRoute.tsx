import { Navigate, Link } from 'react-router-dom'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-hn-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-hn-300 border-t-hn-800 rounded-full animate-spin" />
          <p className="text-hn-700 dark:text-hn-300 text-sm font-semibold">Verificando sesión…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Validación de Control de Acceso Basado en Roles (RBAC)
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={32} />
          </div>
          
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600 dark:text-amber-400 px-3 py-1 bg-amber-50 dark:bg-amber-950/40 rounded-full border border-amber-200 dark:border-amber-800/60 inline-block mb-3">
            Acceso Restringido
          </span>

          <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">
            Permisos Insuficientes
          </h2>
          
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            Tu perfil actual es <strong className="capitalize text-hn-800 dark:text-sky-300">{user.role}</strong>. Esta sección requiere permisos autorizados de{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {allowedRoles.map(r => r === 'admin' ? 'Administrador' : r === 'doctor' ? 'Doctor' : 'Enfermero').join(', ')}
            </strong>.
          </p>

          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-hn-800 hover:bg-hn-900 text-white font-bold text-xs transition-all shadow-md shadow-hn-800/20"
          >
            <ArrowLeft size={16} />
            <span>Volver al Dashboard</span>
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
