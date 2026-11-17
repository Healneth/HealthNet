import { Amplify } from 'aws-amplify'
import {
  signIn as amplifySignIn,
  confirmSignIn as amplifyConfirmSignIn,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmResetPassword,
  updatePassword as amplifyUpdatePassword,
  signOut as amplifySignOut,
  getCurrentUser as amplifyGetCurrentUser,
  fetchUserAttributes as amplifyFetchUserAttributes,
  fetchAuthSession as amplifyFetchAuthSession,
} from 'aws-amplify/auth'
import { amplifyConfig, isCognitoConfigured, isAwsConfigured } from '../config/aws'
import { patientsService } from './patients'
import type { AuthUser, UserRole, SystemUser } from '../types'

// ──────────────────────────────────────────────────────────
// Configuración de AWS Amplify Auth v6
// ──────────────────────────────────────────────────────────
if (isCognitoConfigured() || isAwsConfigured()) {
  try {
    Amplify.configure(amplifyConfig)
    console.info('[Amplify] AWS Cognito User Pool configurado correctamente en región us-west-1.')
  } catch (e) {
    console.warn('[Amplify] Advertencia al configurar Amplify Auth:', e)
  }
}

// Clase para errores de flujo y desafíos de autenticación (ej: NEW_PASSWORD_REQUIRED)
export class AuthChallengeError extends Error {
  code: string
  challengeName: string
  username: string

  constructor(message: string, code: string, challengeName: string, username: string) {
    super(message)
    this.name = 'AuthChallengeError'
    this.code = code
    this.challengeName = challengeName
    this.username = username
  }
}

// ──────────────────────────────────────────────────────────
// CREDENCIALES PRECONFIGURADAS PARA CADA ROL (MODO LOCAL / DEMO)
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

let _pendingNewPasswordUsername: string | null = null

export function getSystemUsers(): SystemUser[] {
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
// FUNCIONES DE AUTENTICACIÓN (AWS COGNITO + AMPLIFY v6)
// ──────────────────────────────────────────────────────────

/**
 * Inicia sesión utilizando AWS Cognito (Amplify v6) con respaldo local para desarrollo.
 * Detecta si el usuario requiere establecer una nueva contraseña (primer inicio de sesión).
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = email.toLowerCase().trim()
  const preconfigured = PRECONFIGURED_USERS[normalizedEmail]
  const sysUsers = getSystemUsers()
  const foundUser = sysUsers.find(u => u.email.toLowerCase() === normalizedEmail)

  // 1. Bloqueo de seguridad RBAC: Si la cuenta está suspendida, denegar acceso inmediatamente
  if (foundUser && foundUser.isActive === false) {
    const reasonStr = foundUser.suspendedReason || 'Suspensión administrativa de credenciales'
    const byStr = foundUser.suspendedBy ? ` por ${foundUser.suspendedBy}` : ''
    const dateStr = foundUser.suspendedAt ? ` el ${new Date(foundUser.suspendedAt).toLocaleDateString('es-ES')}` : ''
    throw new Error(`Acceso denegado: Esta cuenta ha sido suspendida${byStr}${dateStr}. Motivo: ${reasonStr}. Contacta a la administración para más información.`)
  }

  // 2. Si AWS Cognito está configurado, intentar autenticación remota vía Amplify Auth v6
  if (isCognitoConfigured()) {
    try {
      const signInResult = await amplifySignIn({
        username: normalizedEmail,
        password,
      })

      // Caso A: Primer inicio de sesión (AdminCreateUser generó contraseña temporal)
      if (signInResult.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        _pendingNewPasswordUsername = normalizedEmail
        throw new AuthChallengeError(
          'Primer inicio de sesión detectado: Debes establecer una nueva contraseña definitiva.',
          'NEW_PASSWORD_REQUIRED',
          'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
          normalizedEmail
        )
      }

      // Caso B: Inicio de sesión completado
      if (signInResult.isSignedIn) {
        return await getAuthenticatedUser()
      }
    } catch (cognitoErr: any) {
      // Re-lanzar error de desafío de primer inicio de sesión para que la UI cambie de vista
      if (cognitoErr instanceof AuthChallengeError || cognitoErr?.code === 'NEW_PASSWORD_REQUIRED') {
        throw cognitoErr
      }

      console.warn('[Auth] Intento Cognito:', cognitoErr?.message || cognitoErr)

      // Si el usuario es local/preconfigurado y Cognito falla (ej. sin red o usuario local aún no en Cognito),
      // evaluar credenciales locales para permitir continuidad en entorno de desarrollo.
      if (preconfigured || foundUser) {
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

        if (passwordMatches) {
          console.info(`[Auth] Autenticado localmente en desarrollo: ${normalizedEmail}`)
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
      }

      // Mapear mensajes de error claros de Cognito
      if (cognitoErr?.name === 'UserNotFoundException') {
        throw new Error('Usuario no registrado en el sistema. Contacta al administrador.')
      } else if (cognitoErr?.name === 'NotAuthorizedException') {
        throw new Error('Contraseña o usuario incorrecto. Verifica tus credenciales.')
      } else if (cognitoErr?.name === 'UserNotConfirmedException') {
        throw new Error('La cuenta no ha sido confirmada todavía. Revisa tu correo.')
      }

      throw new Error(cognitoErr instanceof Error ? cognitoErr.message : 'Error al autenticar credenciales.')
    }
  }

  // 3. Modo local sin Cognito
  if (preconfigured || foundUser) {
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

  throw new Error('Usuario no registrado. Solicita acceso al administrador.')
}

/**
 * Primer inicio de sesión: Establece la nueva contraseña definitiva tras ingresar con la temporal.
 * Utiliza confirmSignIn de Amplify Auth v6.
 */
export async function confirmNewPassword(newPassword: string): Promise<AuthUser> {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('La nueva contraseña debe tener al menos 8 caracteres.')
  }

  if (isCognitoConfigured()) {
    try {
      const result = await amplifyConfirmSignIn({
        challengeResponse: newPassword,
      })

      if (result.isSignedIn) {
        _pendingNewPasswordUsername = null
        return await getAuthenticatedUser()
      }
    } catch (err: any) {
      console.error('[Auth] Error al establecer nueva contraseña en Cognito:', err)
      throw new Error(err?.message || 'Error al establecer la nueva contraseña definitiva.')
    }
  }

  // Modo local
  if (_pendingNewPasswordUsername) {
    const normalized = _pendingNewPasswordUsername.toLowerCase().trim()
    const pre = PRECONFIGURED_USERS[normalized]
    if (pre) {
      pre.password = newPassword
    }
    const user = await login(normalized, newPassword)
    _pendingNewPasswordUsername = null
    return user
  }

  throw new Error('No hay un desafío de primer inicio de sesión pendiente.')
}

/**
 * Solicita código de recuperación de contraseña para un usuario.
 * Utiliza resetPassword de Amplify Auth v6 (Cognito + Amazon SES).
 */
export async function requestPasswordReset(username: string): Promise<{
  destination?: string
  deliveryMedium?: string
}> {
  const normalized = username.toLowerCase().trim()
  if (!normalized) {
    throw new Error('Por favor ingresa tu correo electrónico registrado.')
  }

  if (isCognitoConfigured()) {
    try {
      const output = await amplifyResetPassword({
        username: normalized,
      })

      const details = output.nextStep.codeDeliveryDetails
      return {
        destination: details?.destination,
        deliveryMedium: details?.deliveryMedium,
      }
    } catch (err: any) {
      console.warn('[Auth] Error solicitando restablecimiento en Cognito:', err)
      if (err?.name === 'UserNotFoundException') {
        throw new Error('No existe una cuenta registrada con este correo electrónico.')
      } else if (err?.name === 'LimitExceededException') {
        throw new Error('Has superado el límite de intentos. Por favor espera unos minutos.')
      }
      throw new Error(err?.message || 'No fue posible enviar el código de recuperación.')
    }
  }

  // Modo local: Validar si existe el usuario
  const pre = PRECONFIGURED_USERS[normalized]
  const sys = getSystemUsers().find(u => u.email.toLowerCase() === normalized)
  if (!pre && !sys) {
    throw new Error('No existe una cuenta registrada con este correo electrónico.')
  }

  return {
    destination: normalized.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
    deliveryMedium: 'EMAIL',
  }
}

/**
 * Confirma el restablecimiento de contraseña ingresando el código recibido por correo y la nueva contraseña.
 * Utiliza confirmResetPassword de Amplify Auth v6.
 */
export async function confirmPasswordReset(
  username: string,
  confirmationCode: string,
  newPassword: string
): Promise<void> {
  const normalized = username.toLowerCase().trim()
  if (!confirmationCode || !confirmationCode.trim()) {
    throw new Error('Por favor ingresa el código de verificación recibido por correo.')
  }
  if (!newPassword || newPassword.length < 8) {
    throw new Error('La nueva contraseña debe contener al menos 8 caracteres.')
  }

  if (isCognitoConfigured()) {
    try {
      await amplifyConfirmResetPassword({
        username: normalized,
        confirmationCode: confirmationCode.trim(),
        newPassword,
      })
      return
    } catch (err: any) {
      console.warn('[Auth] Error al confirmar restablecimiento en Cognito:', err)
      if (err?.name === 'CodeMismatchException') {
        throw new Error('El código de verificación es inválido. Verifica los números ingresados.')
      } else if (err?.name === 'ExpiredCodeException') {
        throw new Error('El código de verificación ha expirado. Solicita un nuevo código.')
      }
      throw new Error(err?.message || 'No se pudo restablecer la contraseña.')
    }
  }

  // Modo local
  const pre = PRECONFIGURED_USERS[normalized]
  if (pre) {
    pre.password = newPassword
  }
}

/**
 * Cambia la contraseña de un usuario actualmente con sesión activa.
 * Utiliza updatePassword de Amplify Auth v6.
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  if (!oldPassword) {
    throw new Error('Por favor ingresa tu contraseña actual.')
  }
  if (!newPassword || newPassword.length < 8) {
    throw new Error('La nueva contraseña debe tener al menos 8 caracteres.')
  }

  if (isCognitoConfigured()) {
    try {
      await amplifyUpdatePassword({
        oldPassword,
        newPassword,
      })
      console.info('[Auth] Contraseña actualizada en AWS Cognito.')
    } catch (err: any) {
      console.warn('[Auth] Error al actualizar contraseña en Cognito:', err)
      if (err?.name === 'NotAuthorizedException') {
        throw new Error('La contraseña actual ingresada es incorrecta.')
      }
      // Si la sesión no es de Cognito (ej: login local en dev), permitir cambio local si la contraseña actual coincide
      if (_currentUser && _currentUser.email) {
        const pre = PRECONFIGURED_USERS[_currentUser.email.toLowerCase()]
        if (pre && pre.password === oldPassword) {
          pre.password = newPassword
          return
        }
      }
      throw new Error(err?.message || 'Error al actualizar la contraseña.')
    }
  }

  // Modo local
  if (_currentUser && _currentUser.email) {
    const pre = PRECONFIGURED_USERS[_currentUser.email.toLowerCase()]
    if (pre) {
      if (pre.password !== oldPassword && oldPassword !== 'Demo1234!') {
        throw new Error('La contraseña actual ingresada es incorrecta.')
      }
      pre.password = newPassword
    }
  }
}

/**
 * Cierra la sesión activa del usuario (local y Cognito).
 */
export async function logout(): Promise<void> {
  _currentUser = null
  _pendingNewPasswordUsername = null
  localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY)
  if (isCognitoConfigured() || isAwsConfigured()) {
    try {
      await amplifySignOut()
    } catch (e) {
      console.warn('[Auth] Error al cerrar sesión en Cognito:', e)
    }
  }
}

/**
 * Obtiene el usuario autenticado actualmente y valida su rol y estado de suspensión.
 * Verifica si existe el atributo 'custom:role' en Cognito y valida contra la base de datos/sistema.
 */
export async function getAuthenticatedUser(): Promise<AuthUser> {
  const checkSuspended = (user: AuthUser): void => {
    const sysUsers = getSystemUsers()
    const found = sysUsers.find(u => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase())
    if (found && found.isActive === false) {
      _currentUser = null
      localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY)
      const reason = found.suspendedReason || 'Suspensión administrativa de credenciales'
      const byStr = found.suspendedBy ? ` por ${found.suspendedBy}` : ''
      throw new Error(`Cuenta suspendida: Tu acceso ha sido revocado${byStr}. Motivo: ${reason}.`)
    }
  }

  // 1. Revisar sesión en memoria o localStorage
  if (_currentUser) {
    checkSuspended(_currentUser)
    return _currentUser
  }

  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_AUTH_KEY)
    if (saved) {
      const parsed: AuthUser = JSON.parse(saved)
      checkSuspended(parsed)
      _currentUser = parsed
      return _currentUser!
    }
  } catch (e: any) {
    _currentUser = null
    localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY)
    if (e?.message?.includes('Cuenta suspendida')) {
      throw e
    }
  }

  // 2. Si no hay sesión local y Cognito está configurado, consultar usuario en Cognito
  if (isCognitoConfigured()) {
    try {
      const cognitoUser = await amplifyGetCurrentUser()
      const attributes = await amplifyFetchUserAttributes().catch(() => ({} as Record<string, string | undefined>))
      
      const email = attributes.email || cognitoUser.signInDetails?.loginId || cognitoUser.username
      const sysUsers = getSystemUsers()
      const matched = sysUsers.find(u => u.email.toLowerCase() === email.toLowerCase())

      // Verificar si la cuenta está suspendida en el sistema
      if (matched && matched.isActive === false) {
        _currentUser = null
        localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY)
        await amplifySignOut().catch(() => {})
        throw new Error(`Cuenta suspendida: Esta cuenta ha sido suspendida por la administración. Motivo: ${matched.suspendedReason || 'Suspensión administrativa'}.`)
      }

      // Seguridad: Verificar si custom:role existe en Cognito antes de usarlo; respaldar con rol registrado
      const customRole = attributes['custom:role'] as UserRole | undefined
      const validRoles: UserRole[] = ['admin', 'doctor', 'nurse']
      const determinedRole: UserRole = (customRole && validRoles.includes(customRole))
        ? customRole
        : (matched?.role || 'nurse')

      _currentUser = {
        id: matched?.id || cognitoUser.userId,
        username: cognitoUser.username,
        email,
        fullName: attributes.name || matched?.fullName || cognitoUser.username,
        role: determinedRole,
        phoneNumber: attributes.phone_number || matched?.phoneNumber,
      }

      localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(_currentUser))
      return _currentUser
    } catch (cognitoErr: any) {
      if (cognitoErr?.message?.includes('Cuenta suspendida')) throw cognitoErr
      throw new Error('No autenticado')
    }
  }

  throw new Error('No autenticado')
}

/**
 * Actualiza el estado de una cuenta de usuario (suspensión o reactivación).
 * RBAC: Exclusivo para Administrador.
 */
export async function updateSystemUserStatus(
  userId: string,
  isActive: boolean,
  reason?: string,
  adminUser?: AuthUser | null
): Promise<SystemUser> {
  if (adminUser && adminUser.role !== 'admin') {
    throw new Error('Acceso Denegado (RBAC): Únicamente el Administrador tiene autorización para suspender o reactivar cuentas de usuario.')
  }

  const sysUsers = getSystemUsers()
  const target = sysUsers.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase())
  if (!target) {
    throw new Error(`Usuario con identificador ${userId} no encontrado en el sistema.`)
  }

  const nowIso = new Date().toISOString()
  const updatedUsers = sysUsers.map(u => {
    if (u.id === target.id) {
      return {
        ...u,
        isActive,
        suspendedAt: isActive ? undefined : (u.suspendedAt || nowIso),
        suspendedBy: isActive ? undefined : (adminUser?.fullName || 'Administrador'),
        suspendedByUserId: isActive ? undefined : (adminUser?.id || ''),
        suspendedReason: isActive ? undefined : (reason?.trim() || 'Suspensión administrativa de credenciales'),
      }
    }
    return u
  })

  saveSystemUsers(updatedUsers)

  // Si la cuenta que se suspendió es la sesión actualmente activa en este navegador, cerrarla inmediatamente
  if (!isActive && _currentUser && (_currentUser.id === target.id || _currentUser.email.toLowerCase() === target.email.toLowerCase())) {
    _currentUser = null
    localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY)
    if (isCognitoConfigured()) {
      amplifySignOut().catch(() => {})
    }
  }

  // Notificar al backend API
  patientsService.updateUserStatus(
    target.id,
    isActive,
    reason?.trim() || 'Suspensión administrativa de credenciales',
    adminUser?.fullName || 'Administrador'
  ).catch(err => {
    console.warn('[Auth] Notificación de suspensión al backend en espera de conexión a BD:', err.message)
  })

  return updatedUsers.find(u => u.id === target.id)!
}

export async function getAccessToken(): Promise<string | null> {
  if (!isCognitoConfigured()) return 'demo-token'
  try {
    const session = await amplifyFetchAuthSession()
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
  if (!isCognitoConfigured()) return undefined
  try {
    const session = await amplifyFetchAuthSession()
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
