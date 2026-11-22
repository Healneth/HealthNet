import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Bell, User, Users, Cpu,
  LogOut, Sun, Moon, Menu, X, Shield, Stethoscope, HeartHandshake,
  ChevronLeft, ChevronRight, KeyRound
} from 'lucide-react'
import Logo from './Logo'
import ChangePasswordModal from './ChangePasswordModal'
import LogoutConfirmModal from './LogoutConfirmModal'
import { useAuth } from '../hooks/useAuth'
import { useDeviceStore } from '../store/deviceStore'
import type { UserRole } from '../types'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: UserRole[]
  badge?: number
}

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)

  // Store details
  const theme = useDeviceStore(s => s.theme)
  const setGlobalTheme = useDeviceStore(s => s.setGlobalTheme)
  const sidebarCollapsed = useDeviceStore(s => s.sidebarCollapsed)
  const toggleSidebarCollapse = useDeviceStore(s => s.toggleSidebarCollapse)
  const unreadAlertsCount = useDeviceStore(s => s.alerts.filter(a => !a.acknowledged).length)

  const handleConfirmLogout = async () => {
    setLogoutModalOpen(false)
    await signOut()
    navigate('/login')
  }

  const toggleTheme = () => {
    setGlobalTheme(theme === 'light' ? 'dark' : 'light')
  }

  const userRole = user?.role || 'nurse'

  // Lista de navegación con filtros por rol (RBAC)
  const allMenuItems: NavItem[] = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'doctor', 'nurse'],
    },
    {
      to: '/monitoring',
      label: 'Monitoreo',
      icon: Activity,
      roles: ['admin', 'doctor', 'nurse'],
    },
    {
      to: '/alerts',
      label: 'Alertas y Bitácora',
      icon: Bell,
      roles: ['admin', 'doctor', 'nurse'],
      badge: unreadAlertsCount > 0 ? unreadAlertsCount : undefined,
    },
    {
      to: '/profile',
      label: 'Pacientes y Brazaletes',
      icon: User,
      roles: ['admin', 'doctor', 'nurse'],
    },
    {
      to: '/users',
      label: userRole === 'admin' ? 'Gestión de Usuarios' : userRole === 'doctor' ? 'Enfermeros Responsables' : 'Mi Turno de Trabajo',
      icon: Users,
      roles: ['admin', 'doctor', 'nurse'],
    },
    {
      to: '/simulator',
      label: 'Simulador IoT',
      icon: Cpu,
      roles: ['admin'], // Restringido exclusivamente al Administrador (Bloqueado para Doctor y Enfermero)
    },
  ]

  const visibleMenuItems = allMenuItems.filter(item => item.roles.includes(userRole))

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return {
          label: 'Administrador',
          color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-800',
          icon: Shield,
        }
      case 'doctor':
        return {
          label: 'Médico Geriatra',
          color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 border-sky-200 dark:border-sky-800',
          icon: Stethoscope,
        }
      case 'nurse':
        return {
          label: 'Enfermería',
          color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
          icon: HeartHandshake,
        }
    }
  }

  const roleInfo = getRoleBadge(userRole)
  const RoleIcon = roleInfo.icon

  // Componente de contenido del sidebar (renderiza expandido o colapsado)
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    const isMini = !isMobile && sidebarCollapsed

    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-colors duration-300">
        
        {/* ── HEADER SUPERIOR ── */}
        {isMini ? (
          // Header Colapsado (Mini Sidebar)
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2.5">
            <Logo size="sm" variant="icon" />
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSidebarCollapse}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all active:scale-95 cursor-pointer shadow-sm"
                title="Expandir menú lateral"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer"
                title="Cambiar tema"
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            </div>
          </div>
        ) : (
          // Header Expandido
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <Logo size="sm" variant="full" />
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer"
                title="Cambiar tema"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {!isMobile && (
                <button
                  onClick={toggleSidebarCollapse}
                  className="hidden lg:flex p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer"
                  title="Colapsar menú lateral"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── NAVEGACIÓN Y SECCIONES ── */}
        <nav className={`flex-1 overflow-y-auto ${isMini ? 'py-4 px-2 space-y-2' : 'p-3 space-y-1'}`}>
          {!isMini && (
            <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Módulos del Sistema
            </div>
          )}

          {visibleMenuItems.map(({ to, label, icon: Icon, badge }) => {
            const active = location.pathname === to

            if (isMini) {
              // Item en Estado Colapsado: Solo Icono + Tooltip Flotante
              return (
                <div key={to} className="relative group flex justify-center">
                  <Link
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    title={label}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all relative
                      ${active
                        ? 'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 shadow-md shadow-hn-900/10 scale-105'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'
                      }`}
                  >
                    <Icon size={19} className={`transition-transform duration-200 group-hover:scale-110 ${active ? 'text-white dark:text-slate-950' : 'text-slate-500 dark:text-slate-400'}`} />
                    
                    {/* Badge de Alerta en modo mini */}
                    {badge !== undefined && (
                      <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] flex items-center justify-center text-[9px] font-black rounded-full px-1 bg-red-500 text-white border-2 border-white dark:border-slate-900 animate-pulse">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>

                  {/* Tooltip flotante en hover */}
                  <div className="fixed left-20 ml-2 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-800 text-xs font-bold rounded-xl shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 z-50 flex items-center gap-2 border border-slate-700/60">
                    <span>{label}</span>
                    {badge !== undefined && (
                      <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-full">
                        {badge}
                      </span>
                    )}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900 dark:border-r-slate-800" />
                  </div>
                </div>
              )
            }

            // Item en Estado Expandido: Icono + Texto + Badge
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all relative group
                  ${active
                    ? 'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 shadow-md shadow-hn-900/10'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'
                  }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon size={16} className={`transition-transform duration-200 group-hover:scale-110 ${active ? 'text-white dark:text-slate-950' : 'text-slate-400'}`} />
                  <span>{label}</span>
                </span>
                {badge !== undefined && (
                  <span className={`min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-black rounded-full px-1 border transition-colors
                    ${active
                      ? 'bg-white text-hn-800 border-white dark:bg-slate-950 dark:text-hn-400 dark:border-slate-950'
                      : 'bg-red-500 text-white border-red-500 animate-pulse'
                    }`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* ── PIE DE PÁGINA (USUARIO Y LOGOUT) ── */}
        {isMini ? (
          // Pie Colapsado: Avatar con Tooltip y Logout
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30 flex flex-col items-center gap-2.5">
            <div className="relative group">
              <div
                className="w-10 h-10 rounded-xl bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 flex items-center justify-center font-black text-xs shadow-sm cursor-pointer"
                title={`${user?.fullName || user?.email?.split('@')[0]} (${roleInfo.label})`}
              >
                {user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="fixed left-20 ml-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 z-50 flex flex-col gap-0.5 border border-slate-700/60">
                <span className="font-extrabold">{user?.fullName || user?.email?.split('@')[0]}</span>
                <span className="text-[10px] text-slate-400 font-semibold">{roleInfo.label}</span>
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900 dark:border-r-slate-800" />
              </div>
            </div>

            <div className="relative group">
              <button
                onClick={() => setChangePasswordOpen(true)}
                className="p-2 rounded-xl text-slate-400 hover:text-[#637fa8] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Cambiar contraseña"
              >
                <KeyRound size={17} />
              </button>
              <div className="fixed left-20 ml-2 px-2.5 py-1 bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 z-50 border border-slate-700/60">
                Cambiar contraseña
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900 dark:border-r-slate-800" />
              </div>
            </div>

            <div className="relative group">
              <button
                onClick={() => setLogoutModalOpen(true)}
                className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut size={18} />
              </button>
              <div className="fixed left-20 ml-2 px-2.5 py-1 bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 z-50 border border-slate-700/60">
                Cerrar sesión
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900 dark:border-r-slate-800" />
              </div>
            </div>
          </div>
        ) : (
          // Pie Expandido: Datos completos de usuario y rol
          <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 flex items-center justify-center font-black text-xs shadow-sm flex-shrink-0">
                {user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-none">
                  {user?.fullName || user?.email?.split('@')[0]}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${roleInfo.color}`}>
                    <RoleIcon size={10} />
                    {roleInfo.label}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setChangePasswordOpen(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#637fa8] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Cambiar contraseña"
                >
                  <KeyRound size={15} />
                </button>
                <button
                  onClick={() => setLogoutModalOpen(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Cerrar sesión"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    )
  }

  return (
    <>
      {/* Encabezado Mobile */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-40 transition-colors duration-300">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Sidebar de Escritorio: Ancho dinámico (w-64 en Expandido / w-20 en Colapsado) */}
      <aside className={`hidden lg:block fixed top-0 bottom-0 left-0 z-30 transition-all duration-300 ease-in-out ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      }`}>
        <SidebarContent isMobile={false} />
      </aside>

      {/* Drawer Móvil (Siempre a ancho completo cuando se abre en móviles) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-xs flex flex-col h-full animate-in slide-in-from-left duration-200 z-50">
            <SidebarContent isMobile={true} />
          </div>
        </div>
      )}
      {/* Modal para Cambiar Contraseña */}
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      {/* Modal de Confirmación de Cierre de Sesión */}
      <LogoutConfirmModal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        userName={user?.fullName || user?.email}
        userRole={roleInfo.label}
      />
    </>
  )
}
