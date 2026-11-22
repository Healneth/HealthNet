import { describe, it, expect } from 'vitest'
import { formatToE164, isValidE164 } from '../utils/phoneValidator'

describe('Validador y Formateador E.164 para AWS Messaging (SMS)', () => {
  it('convierte un número mexicano de 10 dígitos locales a formato E.164 (+52)', () => {
    const res = formatToE164('6641234567')
    expect(res.isValid).toBe(true)
    expect(res.e164).toBe('+526641234567')
    expect(res.formattedDisplay).toBe('+52 664 123 4567')
  })

  it('limpia espacios, guiones y paréntesis de un número formateado', () => {
    const res = formatToE164('+52 (664) 123-4567')
    expect(res.isValid).toBe(true)
    expect(res.e164).toBe('+526641234567')
  })

  it('admite números de EE.UU. / Internacionales con código de país', () => {
    const res = formatToE164('+1 206 555 0100')
    expect(res.isValid).toBe(true)
    expect(res.e164).toBe('+12065550100')
    expect(res.formattedDisplay).toBe('+1 (206) 555-0100')
  })

  it('rechaza cadenas vacías o con formato inválido', () => {
    const emptyRes = formatToE164('')
    expect(emptyRes.isValid).toBe(false)
    expect(emptyRes.error).toBeDefined()

    const shortRes = formatToE164('12345')
    expect(shortRes.isValid).toBe(false)

    const invalidChars = formatToE164('abc-def-ghij')
    expect(invalidChars.isValid).toBe(false)
  })

  it('isValidE164 valida de forma booleana estricta', () => {
    expect(isValidE164('+526641234567')).toBe(true)
    expect(isValidE164('+12065550100')).toBe(true)
    expect(isValidE164('6641234567')).toBe(false) // falta '+'
    expect(isValidE164('+0123456789')).toBe(false) // los códigos de país inician con 1-9
  })
})
