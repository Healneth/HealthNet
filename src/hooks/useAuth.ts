import { useState, useEffect, createContext, useContext } from 'react'
import {
  login,
  logout,
  getAuthenticatedUser,
  confirmNewPassword as serviceConfirmNewPassword,
  requestPasswordReset as serviceRequestPasswordReset,
  confirmPasswordReset as serviceConfirmPasswordReset,
  changePassword as serviceChangePassword,
} from '../services/auth'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<AuthUser>
  confirmNewPassword: (newPassword: string) => Promise<AuthUser>
  requestPasswordReset: (username: string) => Promise<{ destination?: string; deliveryMedium?: string }>
  confirmPasswordReset: (username: string, code: string, newPassword: string) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  signOut: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAuthenticatedUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const signIn = async (email: string, password: string): Promise<AuthUser> => {
    setLoading(true)
    setError(null)
    try {
      const u = await login(email, password)
      setUser(u)
      return u
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar sesión')
      throw e
    } finally {
      setLoading(false)
    }
  }

  const confirmNewPassword = async (newPassword: string): Promise<AuthUser> => {
    setLoading(true)
    setError(null)
    try {
      const u = await serviceConfirmNewPassword(newPassword)
      setUser(u)
      return u
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar nueva contraseña')
      throw e
    } finally {
      setLoading(false)
    }
  }

  const requestPasswordReset = async (username: string) => {
    setError(null)
    try {
      return await serviceRequestPasswordReset(username)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al solicitar recuperación')
      throw e
    }
  }

  const confirmPasswordReset = async (username: string, code: string, newPassword: string) => {
    setError(null)
    try {
      await serviceConfirmPasswordReset(username, code, newPassword)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al restablecer contraseña')
      throw e
    }
  }

  const changePassword = async (oldPassword: string, newPassword: string) => {
    setError(null)
    try {
      await serviceChangePassword(oldPassword, newPassword)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar contraseña')
      throw e
    }
  }

  const signOut = async () => {
    await logout()
    setUser(null)
  }

  return {
    user,
    loading,
    error,
    signIn,
    confirmNewPassword,
    requestPasswordReset,
    confirmPasswordReset,
    changePassword,
    signOut,
  }
}
