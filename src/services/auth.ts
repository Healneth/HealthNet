import { Amplify } from 'aws-amplify'
import {
  signIn, signOut, getCurrentUser, fetchAuthSession,
} from 'aws-amplify/auth'
import { amplifyConfig, isAwsConfigured } from '../config/aws'
import type { AuthUser, UserRole, SystemUser } from '../types'

// Configura Amplify si AWS está configurado
if (isAwsConfigured()) {
  try {
    Amplify.configure(amplifyConfig)
  } catch (e) {
    console.warn('[Amplify] Advertencia al configurar:', e)
  }
}

// ──────────────────────────────────────────────────────────
// CREDENCIALES PRECONFIGURADAS PARA CADA ROL
// ──────────────────────────────────────────────────────────
export interface PreconfiguredUser {
  id: string
  password: string
  role: UserRole
  fullName: string
  phoneNumber: string
}

export const PRECONFIGURED_USERS: Record<string, PreconfiguredUser> = {
  // 1. ROL: ADMINISTRADOR
  'admin@healthnet.com': {
    id: 'a0000000-0000-0000-0000-000000000001',
    password: 'Admin1234!',
    role: 'admin',
    fullName: 'Lic. Laura Martínez',
    phoneNumber: '+52 664 123 4567',
  },
  // 2. ROL: DOCTOR
  'doctor@healthnet.com': {
    id: 'a0000000-0000-0000-0000-000000000002',
    password: 'Doctor1234!',
    role: 'doctor',
    fullName: 'Dr. Roberto Sánchez',
    phoneNumber: '+52 664 234 5678',
  },
  // 3. ROL: ENFERMERO
  'enfermero@healthnet.com': {
    id: 'a0000000-0000-0000-0000-000000000003',
    password: 'Enfermero1234!',
    role: 'nurse',
    fullName: 'Enf. Carlos Domínguez',
    phoneNumber: '+52 664 345 6789',
  },
  'ana.ruiz@healthnet.com': {
    id: 'a0000000-0000-0000-0000-000000000004',
    password: 'Enfermero1234!',
    role: 'nurse',
    fullName: 'Lic. Ana Ruiz Morales',
    phoneNumber: '+52 664 567 8901',
  },
  'elena.soto@healthnet.com': {
    id: 'a0000000-0000-0000-0000-000000000005',
    password: 'Enfermero1234!',
    role: 'nurse',
    fullName: 'Lic. Elena Soto Vargas',
    phoneNumber: '+52 664 678 9012',
  },
  // Alias de compatibilidad adicional
  'viewer@healthnet.com': {
    id: 'a0000000-0000-0000-0000-000000000004',
    password: 'Demo1234!',
    role: 'nurse',
    fullName: 'Lic. Ana Ruiz Morales',
    phoneNumber: '+52 664 567 8901',
  },
}

const LOCAL_STORAGE_USERS_KEY = 'healthnet_system_users'
const LOCAL_STORAGE_AUTH_KEY = 'healthnet_current_user'

export function getSystemUsers(): SystemUser[] {
  // Inicializar con los usuarios predeterminados
  const defaultNurses: SystemUser[] = [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      email: 'admin@healthnet.com',
      fullName: 'Lic. Laura Martínez',
      role: 'admin',
      phoneNumber: '+52 664 123 4567',
      isActive: true,
      createdAt: '2026-01-15T08:00:00Z',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000002',
      email: 'doctor@healthnet.com',
      fullName: 'Dr. Roberto Sánchez',
      role: 'doctor',
      phoneNumber: '+52 664 234 5678',
      isActive: true,
      createdAt: '2026-01-20T09:30:00Z',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000003',
      email: 'enfermero@healthnet.com',
      fullName: 'Enf. Carlos Domínguez',
      role: 'nurse',
      phoneNumber: '+52 664 345 6789',
      defaultShift: 'matutino',
      isActive: true,
      createdAt: '2026-02-01T10:15:00Z',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000004',
      email: 'ana.ruiz@healthnet.com',
      fullName: 'Lic. Ana Ruiz Morales',
      role: 'nurse',
      phoneNumber: '+52 664 567 8901',
      defaultShift: 'vespertino',
      isActive: true,
      createdAt: '2026-02-05T11:00:00Z',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000005',
      email: 'elena.soto@healthnet.com',
      fullName: 'Lic. Elena Soto Vargas',
      role: 'nurse',
      phoneNumber: '+52 664 678 9012',
      defaultShift: 'nocturno',
      isActive: true,
      createdAt: '2026-02-10T14:30:00Z',
    },
  ]

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_USERS_KEY)
    if (raw) {
      const parsed: SystemUser[] = JSON.parse(raw)
      // Asegurar que las enfermeras de prueba estén presentes para rotación y cobertura de turnos
      let updated = false
      defaultNurses.forEach(dn => {
        if (!parsed.some(p => p.email.toLowerCase() === dn.email.toLowerCase())) {
          parsed.push(dn)
          updated = true
        }
      })
      if (updated) {
        saveSystemUsers(parsed)
      }
      return parsed
    }
  } catch (e) {
    console.error(e)
  }

  saveSystemUsers(defaultNurses)
  return defaultNurses
}

export function saveSystemUsers(users: SystemUser[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users))
  } catch (e) {
    console.error(e)
  }
}

let _currentUser: AuthUser | null = (() => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_AUTH_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return null
})()

// ──────────────────────────────────────────────────────────
// FUNCIONES DE AUTENTICACIÓN HÍBRIDA (LOCAL + COGNITO)
// ──────────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = email.toLowerCase().trim()
  const preconfigured = PRECONFIGURED_USERS[normalizedEmail]
  const sysUsers = getSystemUsers()
  const foundUser = sysUsers.find(u => u.email.toLowerCase() === normalizedEmail)

  // Bloqueo de seguridad: Si la cuenta está suspendida en el sistema, denegar acceso inmediatamente
  if (foundUser && foundUser.isActive === false) {
    const reasonDetail = foundUser.suspendedReason ? ` Motivo: ${foundUser.suspendedReason}.` : ''
    throw new Error(`Esta cuenta ha sido suspendida.${reasonDetail} Contacta al administrador del sistema para más información.`)
  }

  // 1. SI ES UN USUARIO LOCAL / PRECONFIGURADO: Autenticar localmente de inmediato
  if (preconfigured || foundUser) {

    // Acepta la contraseña propia del rol, 'Demo1234!' o variantes comunes para facilitar pruebas
    const validPasswords = [
      preconfigured?.password,
      'Admin1234!',
      'Doctor1234!',
      'Enfermero1234!',
      'Demo1234!',
      'Healthnet123!',
      '123456',
    ].filter(Boolean) as string[]

    const passwordMatches = validPasswords.some(
      vp => password === vp || password.toLowerCase() === vp.toLowerCase()
    )

    if (!passwordMatches) {
      throw new Error('Contraseña incorrecta para esta cuenta.')
    }

    _currentUser = {
      id: foundUser?.id || preconfigured?.id || `usr-${Date.now()}`,
      username: normalizedEmail,
      email: normalizedEmail,
      fullName: foundUser?.fullName || preconfigured?.fullName || normalizedEmail,
      role: foundUser?.role || preconfigured?.role || 'nurse',
      phoneNumber: foundUser?.phoneNumber || preconfigured?.phoneNumber,
    }

    localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(_currentUser))
    return _currentUser
  }

  // 2. SI NO ES LOCAL Y AWS COGNITO ESTÁ CONFIGURADO: Intentar login remoto
  if (isAwsConfigured()) {
    try {
      await signIn({ username: email, password })
      return await getAuthenticatedUser()
    } catch (cognitoErr) {
      console.warn('[Auth] Error autenticando en Cognito:', cognitoErr)
      throw new Error(
        cognitoErr instanceof Error
          ? cognitoErr.message
          : 'Credenciales inválidas en AWS Cognito.'
      )
    }
  }

  throw new Error('Usuario no registrado. Solicita acceso al administrador.')
}

export async function logout(): Promise<void> {
  _currentUser = null
  localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY)
  if (isAwsConfigured()) {
    try {
      await signOut()
    } catch (e) {
      console.warn('[Auth] Error al cerrar sesión en Cognito:', e)
    }
  }
}

export async function getAuthenticatedUser(): Promise<AuthUser> {
  // Primero revisar sesión en memoria o localStorage
  if (_currentUser) return _currentUser

  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_AUTH_KEY)
    if (saved) {
      _currentUser = JSON.parse(saved)
      return _currentUser!
    }
  } catch {}

  // Si no hay sesión local y AWS está configurado, consultar Cognito
  if (isAwsConfigured()) {
    try {
      const user = await getCurrentUser()
      const email = user.signInDetails?.loginId || user.username
      const sysUsers = getSystemUsers()
      const matched = sysUsers.find(u => u.email.toLowerCase() === email.toLowerCase())

      _currentUser = {
        id: matched?.id || user.userId,
        username: user.username,
        email,
        fullName: matched?.fullName || user.username,
        role: matched?.role || 'doctor',
        phoneNumber: matched?.phoneNumber,
      }
      localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(_currentUser))
      return _currentUser
    } catch {
      throw new Error('No autenticado')
    }
  }

  throw new Error('No autenticado')
}

export async function getAccessToken(): Promise<string | null> {
  if (!isAwsConfigured()) return 'demo-token'
  try {
    const session = await fetchAuthSession()
    return session.tokens?.accessToken?.toString() ?? 'demo-token'
  } catch {
    return 'demo-token'
  }
}

export async function getCredentials(): Promise<{
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
} | undefined> {
  if (!isAwsConfigured()) return undefined
  try {
    const session = await fetchAuthSession()
    const creds = session.credentials
    if (creds) {
      return {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      }
    }
    return undefined
  } catch (err) {
    console.warn('[Auth] No se obtuvieron credenciales de Cognito Identity Pool, usando modo local:', err)
    return undefined
  }
}
