/**
 * HEALTH NET — Validador de Política Estricta de Contraseñas
 * Reglas de seguridad institucional:
 * - Mínimo 12 caracteres
 * - Al menos una letra mayúscula (A-Z)
 * - Al menos una letra minúscula (a-z)
 * - Al menos un número (0-9)
 * - Al menos un carácter especial / símbolo (!@#$%^&*()_+-=[]{};':"|,.<>/?~`)
 */

export interface PasswordValidationResult {
  isValid: boolean
  hasMinLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecialChar: boolean
  errorMessage?: string
}

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  const hasMinLength = password.length >= 12
  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password)

  const isValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar

  let errorMessage: string | undefined
  if (!hasMinLength) {
    errorMessage = 'La contraseña debe contener al menos 12 caracteres.'
  } else if (!hasUppercase) {
    errorMessage = 'La contraseña debe incluir al menos una letra mayúscula (A-Z).'
  } else if (!hasLowercase) {
    errorMessage = 'La contraseña debe incluir al menos una letra minúscula (a-z).'
  } else if (!hasNumber) {
    errorMessage = 'La contraseña debe incluir al menos un número (0-9).'
  } else if (!hasSpecialChar) {
    errorMessage = 'La contraseña debe incluir al menos un carácter especial o símbolo (!@#$%^&*...).'
  }

  return {
    isValid,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
    errorMessage,
  }
}
