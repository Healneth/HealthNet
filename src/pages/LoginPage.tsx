import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Logo from '../components/Logo'
import doctorPhoto from '../assets/doctor-stethoscope.jpg'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdminHelp, setShowAdminHelp] = useState(false)
  const [imgSrc, setImgSrc] = useState(doctorPhoto)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Credenciales inválidas. Por favor verifica tus datos.'
      )
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (role: 'admin' | 'doctor' | 'nurse') => {
    if (role === 'admin') {
      setEmail('admin@healthnet.com')
      setPassword('Admin1234!')
    } else if (role === 'doctor') {
      setEmail('doctor@healthnet.com')
      setPassword('Doctor1234!')
    } else {
      setEmail('enfermero@healthnet.com')
      setPassword('Enfermero1234!')
    }
    setError(null)
  }

  return (
    <div className="h-screen w-screen max-h-screen overflow-hidden bg-[#F4F6F8] dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      
      {/* ══════════════════════════════════════════════════════════════════
          TARJETA CONTENEDORA: PANTALLA DIVIDIDA 50/50 (ESTILO REFERENCIA)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="w-full max-w-4xl xl:max-w-[960px] h-full max-h-[580px] xl:max-h-[620px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl shadow-slate-300/50 dark:shadow-black/70 border border-slate-200/80 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-2 overflow-hidden transition-colors">
        
        {/* ──────────────────────────────────────────────────────────────
            1. PANEL IZQUIERDO: VISUAL HERO (50% DEL ANCHO)
               - Fotografía de doctora cubriendo el 100% de la columna
               - Degradado azul suave inferior
               - Logotipo blanco de HealthNet y frase institucional
            ────────────────────────────────────────────────────────────── */}
        <div className="relative hidden lg:flex flex-col justify-end p-8 xl:p-10 overflow-hidden bg-slate-900">
          
          {/* Fotografía de fondo a sangre completa */}
          <img
            src={imgSrc}
            alt="Doctora profesional HealthNet con estetoscopio"
            onError={() => setImgSrc('/doctor-stethoscope.jpg')}
            className="absolute inset-0 w-full h-full object-cover object-center select-none pointer-events-none"
            loading="eager"
          />

          {/* Degradado azul institucional en la parte inferior (#637fa8) */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#637fa8] via-[#637fa8]/85 via-40% to-transparent pointer-events-none" />

          {/* Elementos sobrepuestos en la esquina inferior izquierda */}
          <div className="relative z-10 flex flex-col gap-3">
            {/* Logotipo en blanco (Isotipo corazón EKG + HEALTHNET) */}
            <Logo size="md" variant="full" light={true} />

            {/* Frases institucionales de la plataforma */}
            <div className="mt-1">
              <p className="text-sm xl:text-base text-white font-bold leading-snug">
                Cuidando a quienes más queremos:
              </p>
              <p className="text-xs xl:text-sm text-white/85 font-medium leading-relaxed mt-0.5">
                Monitoreo integral para adultos mayores.
              </p>
            </div>
          </div>

        </div>

        {/* ──────────────────────────────────────────────────────────────
            2. PANEL DERECHO: FORMULARIO DE ACCESO (50% DEL ANCHO)
               - Fondo blanco limpio
               - Icono de logo superior
               - Título y subtítulo
               - Inputs limpios con bordes redondeados
               - Botón azul estilo píldora institucional
            ────────────────────────────────────────────────────────────── */}
        <div className="h-full p-8 sm:p-10 xl:p-12 flex flex-col justify-between overflow-y-auto bg-white dark:bg-slate-900">
          
          <div className="w-full max-w-[340px] xl:max-w-[360px] mx-auto my-auto flex flex-col justify-center">
            
            {/* Icono de isotipo superior (como en la referencia) */}
            <div className="mb-4">
              <Logo size="sm" variant="icon" />
            </div>

            {/* Título y Subtítulo */}
            <h1 className="text-2xl xl:text-3xl font-black text-slate-800 dark:text-white tracking-tight">
              Iniciar sesión
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Ingresa a tu cuenta para continuar.
            </p>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              
              {/* Campo Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="doctor@healthnet.com"
                  autoComplete="email"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#637fa8]/25 focus:border-[#637fa8] transition-all"
                />
              </div>

              {/* Campo Contraseña con botón de visibilidad */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#637fa8]/25 focus:border-[#637fa8] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 focus:outline-none cursor-pointer"
                    title={showPwd ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Enlace Forgot Password alineado a la derecha */}
                <div className="flex justify-end pt-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAdminHelp(true)}
                    className="text-[11px] font-semibold text-slate-400 hover:text-[#637fa8] dark:text-slate-400 dark:hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </div>

              {/* Alerta de Error */}
              {error && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2 text-red-600 dark:text-red-400 text-xs font-medium">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span className="leading-tight">{error}</span>
                </div>
              )}

              {/* Botón Principal (CTA) redondeado azul institucional (#637fa8) */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 sm:py-3 px-4 rounded-xl bg-[#637fa8] hover:bg-[#526d94] active:bg-[#476083] dark:bg-[#637fa8] dark:hover:bg-[#526d94] active:scale-[0.99] text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-[#637fa8]/20 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verificando…</span>
                  </>
                ) : (
                  <span>Ingresar</span>
                )}
              </button>

              {/* Acceso Rápido Local (Demo) */}
              <div className="pt-2 flex items-center justify-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-medium">Probar:</span>
                <button
                  type="button"
                  onClick={() => fillDemo('admin')}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 transition-colors cursor-pointer"
                  title="Admin (admin@healthnet.com)"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('doctor')}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#637fa8] dark:text-sky-300 bg-[#637fa8]/10 hover:bg-[#637fa8]/20 dark:bg-sky-950/40 border border-[#637fa8]/30 dark:border-sky-800 transition-colors cursor-pointer"
                  title="Doctor (doctor@healthnet.com)"
                >
                  Doctor
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('nurse')}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                  title="Enfermero (enfermero@healthnet.com)"
                >
                  Enfermero
                </button>
              </div>

            </form>

            {/* Pie inferior: Enlace Solicitar Acceso */}
            <div className="pt-6 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => setShowAdminHelp(true)}
                  className="font-bold text-slate-800 dark:text-white hover:underline cursor-pointer"
                >
                  Solicita acceso
                </button>
              </p>
            </div>

          </div>

        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MODAL INFORMATIVO: SOLICITAR ACCESO AL ADMINISTRADOR
          ══════════════════════════════════════════════════════════════════ */}
      {showAdminHelp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full border border-slate-200 dark:border-slate-800 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-hn-50 dark:bg-slate-800 flex items-center justify-center text-hn-800 dark:text-sky-300">
                <ShieldCheck size={20} />
              </div>
              <button
                type="button"
                onClick={() => setShowAdminHelp(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <h3 className="text-base font-black text-slate-800 dark:text-white mb-1.5">
              Acceso Institucional HealthNet
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Por confidencialidad clínica y protección de los adultos mayores, las cuentas de <strong>HealthNet</strong> son gestionadas por el área administrativa del asilo o centro médico.
            </p>

            <div className="flex gap-2">
              <a
                href="mailto:admin@healthnet.com?subject=Solicitud%20de%20Acceso%20a%20HealthNet"
                className="flex-1 py-2 px-3 rounded-xl bg-[#637fa8] hover:bg-[#526d94] text-white font-bold text-xs text-center transition-all shadow-sm cursor-pointer"
              >
                Contactar Administrador
              </a>
              <button
                type="button"
                onClick={() => setShowAdminHelp(false)}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
