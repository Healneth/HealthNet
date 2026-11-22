/**
 * phoneValidator.ts — Utilidad de validación y formateo de números de teléfono
 * conforme al estándar internacional E.164 requerido por AWS End User Messaging y Amazon SNS.
 *
 * Formato E.164: +[código de país][código de área / número] (máximo 15 dígitos numéricos)
 * Ejemplo México: +526641234567
 * Ejemplo EE.UU.: +12065550100
 */

export interface PhoneValidationResult {
  isValid: boolean
  e164: string
  formattedDisplay: string
  error?: string
}

const E164_REGEX = /^\+[1-9]\d{7,14}$/

/**
 * Limpia y normaliza un número de teléfono al formato internacional E.164.
 * Si se ingresa un número de 10 dígitos sin prefijo internacional, aplica por defecto el código de México (+52).
 */
export function formatToE164(rawPhone: string, defaultCountryPrefix = '+52'): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      isValid: false,
      e164: '',
      formattedDisplay: '',
      error: 'El número de teléfono es obligatorio para la recepción de alertas críticas vía AWS Messaging (SMS).',
    }
  }

  // Eliminar espacios, guiones, puntos y paréntesis
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '')

  // Si no inicia con '+', verificar si es un número nacional de 10 dígitos
  if (!cleaned.startsWith('+')) {
    // Si empieza con '00', convertir a '+'
    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.slice(2)
    } else if (/^\d{10}$/.test(cleaned)) {
      // 10 dígitos (típico de México u otros países con numeración de 10 dígitos)
      const prefix = defaultCountryPrefix.startsWith('+') ? defaultCountryPrefix : `+${defaultCountryPrefix}`
      cleaned = `${prefix}${cleaned}`
    } else if (/^\d{11,15}$/.test(cleaned)) {
      cleaned = `+${cleaned}`
    } else {
      return {
        isValid: false,
        e164: '',
        formattedDisplay: rawPhone,
        error: 'El número debe contener al menos 10 dígitos o incluir el código de país (ej. +52 664 123 4567).',
      }
    }
  }

  // Validar contra estándar E.164
  if (!E164_REGEX.test(cleaned)) {
    return {
      isValid: false,
      e164: cleaned,
      formattedDisplay: rawPhone,
      error: 'El formato no cumple con el estándar internacional E.164 de AWS (+[país][número], entre 8 y 15 dígitos).',
    }
  }

  // Generar formato visual amigable para la interfaz
  let formattedDisplay = cleaned
  if (cleaned.startsWith('+52') && cleaned.length === 13) {
    // +52 XXX XXX XXXX
    formattedDisplay = `+52 ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`
  } else if (cleaned.startsWith('+1') && cleaned.length === 12) {
    // +1 (XXX) XXX-XXXX
    formattedDisplay = `+1 (${cleaned.slice(2, 5)}) ${cleaned.slice(5, 8)}-${cleaned.slice(8)}`
  }

  return {
    isValid: true,
    e164: cleaned,
    formattedDisplay,
  }
}

/**
 * Comprueba de forma booleana si un número es estrictamente válido en formato E.164
 */
export function isValidE164(phone: string): boolean {
  if (!phone) return false
  const clean = phone.trim().replace(/[\s\-\(\)\.]/g, '')
  return E164_REGEX.test(clean)
}
