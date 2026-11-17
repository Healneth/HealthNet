import { useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, X, Lock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const { user, changePassword } = useAuth()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!oldPassword) {
      setError('Por favor ingresa tu contraseña actual.')
      return
    }
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe contener al menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden. Por favor verifica ambos campos.')
      return
    }
    if (newPassword === oldPassword) {
      setError('La nueva contraseña debe ser diferente a la contraseña actual.')
      return
    }

    setLoading(true)
    try {
      await changePassword(oldPassword, newPassword)
      setSuccess(true)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        handleClose()
      }, 2000)
    } catch (err: any) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar la contraseña. Verifica tus datos.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-hn-50 dark:bg-slate-800 flex items-center justify-center text-[#637fa8] dark:text-sky-400">
              <KeyRound size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white leading-tight">
                Cambiar Contraseña
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {user?.fullName} ({user?.email})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Notificación de Éxito */}
        {success && (
          <div className="mt-4 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3.5 py-2.5 text-emerald-700 dark:text-emerald-300 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 size={16} className="flex-shrink-0" />
            <span>¡Tu contraseña ha sido actualizada exitosamente!</span>
          </div>
        )}

        {/* Notificación de Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5 text-red-600 dark:text-red-400 text-xs font-medium animate-in fade-in">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {/* Contraseña Actual */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Contraseña actual
            </label>
            <div className="relative">
              <input
                type={showOldPwd ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                required
                placeholder="Ingresa tu contraseña actual"
                className="w-full pl-3.5 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#637fa8]/25 focus:border-[#637fa8]"
              />
              <button
                type="button"
                onClick={() => setShowOldPwd(!showOldPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 focus:outline-none cursor-pointer"
              >
                {showOldPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Nueva Contraseña */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                type={showNewPwd ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full pl-3.5 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#637fa8]/25 focus:border-[#637fa8]"
              />
              <button
                type="button"
                onClick={() => setShowNewPwd(!showNewPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 focus:outline-none cursor-pointer"
              >
                {showNewPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Confirmar Nueva Contraseña */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Confirmar nueva contraseña
            </label>
            <div className="relative">
              <input
                type={showConfirmPwd ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Repite la nueva contraseña"
                className="w-full pl-3.5 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#637fa8]/25 focus:border-[#637fa8]"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 focus:outline-none cursor-pointer"
              >
                {showConfirmPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="pt-1 text-[11px] text-slate-400 leading-tight">
            * Se recomienda incluir mayúsculas, minúsculas, números y caracteres especiales.
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={loading || success}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#637fa8] hover:bg-[#526d94] active:scale-[0.99] text-white font-bold text-xs transition-all shadow-md shadow-[#637fa8]/20 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Actualizando en Cognito…</span>
                </>
              ) : (
                <span>Guardar Nueva Contraseña</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="py-2.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}
