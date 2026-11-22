import { describe, it, expect } from 'vitest'
import {
  checkShiftConflict,
  determineShiftFromTimestamp,
  getMondayOfDate,
  DEFAULT_SHIFT_CONFIGS
} from '../services/shiftService'
import type { NurseShiftAssignment } from '../types'

describe('Servicio de Turnos de Enfermería (shiftService)', () => {
  it('detecta conflicto cuando un enfermero ya tiene turno asignado en la misma semana', () => {
    const existingAssignments: NurseShiftAssignment[] = [
      {
        id: 'shift-101',
        nurseId: 'nurse-carlos',
        nurseName: 'Carlos Domínguez',
        nurseEmail: 'carlos@healthnet.com',
        weekStartDate: '2026-11-23',
        shiftType: 'matutino',
        days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
        notes: '',
        assignedByUserName: 'Admin',
        createdAt: new Date().toISOString(),
      },
    ]

    const result = checkShiftConflict(
      existingAssignments,
      'nurse-carlos',
      '2026-11-23',
      'vespertino'
    )

    expect(result.hasConflict).toBe(true)
    expect(result.reason).toContain('Incompatibilidad horaria')
  })

  it('no genera conflicto si la asignación es para otra semana o es el mismo registro en edición', () => {
    const existingAssignments: NurseShiftAssignment[] = [
      {
        id: 'shift-101',
        nurseId: 'nurse-carlos',
        nurseName: 'Carlos Domínguez',
        nurseEmail: 'carlos@healthnet.com',
        weekStartDate: '2026-11-23',
        shiftType: 'matutino',
        days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
        notes: '',
        assignedByUserName: 'Admin',
        createdAt: new Date().toISOString(),
      },
    ]

    // Semana distinta
    const diffWeek = checkShiftConflict(
      existingAssignments,
      'nurse-carlos',
      '2026-11-30',
      'vespertino'
    )
    expect(diffWeek.hasConflict).toBe(false)

    // Mismo ID siendo editado
    const sameRecord = checkShiftConflict(
      existingAssignments,
      'nurse-carlos',
      '2026-11-23',
      'matutino',
      'shift-101'
    )
    expect(sameRecord.hasConflict).toBe(false)
  })

  it('determina el turno correspondiente según la hora del evento', () => {
    // 09:30 -> Matutino (07:00 - 15:00)
    const morningDate = new Date('2026-11-23T09:30:00')
    expect(determineShiftFromTimestamp(morningDate, DEFAULT_SHIFT_CONFIGS)).toBe('matutino')

    // 17:45 -> Vespertino (15:00 - 23:00)
    const afternoonDate = new Date('2026-11-23T17:45:00')
    expect(determineShiftFromTimestamp(afternoonDate, DEFAULT_SHIFT_CONFIGS)).toBe('vespertino')

    // 01:15 -> Nocturno (23:00 - 07:00, cruza medianoche)
    const nightDate = new Date('2026-11-24T01:15:00')
    expect(determineShiftFromTimestamp(nightDate, DEFAULT_SHIFT_CONFIGS)).toBe('nocturno')

    // 23:30 -> Nocturno
    const nightLate = new Date('2026-11-23T23:30:00')
    expect(determineShiftFromTimestamp(nightLate, DEFAULT_SHIFT_CONFIGS)).toBe('nocturno')
  })

  it('calcula correctamente el lunes de cualquier fecha dada', () => {
    // 2026-11-25 es Miércoles -> El lunes debe ser 2026-11-23
    const wednesday = new Date(2026, 10, 25)
    expect(getMondayOfDate(wednesday)).toBe('2026-11-23')

    // 2026-11-23 es Lunes -> El lunes debe ser 2026-11-23
    const monday = new Date(2026, 10, 23)
    expect(getMondayOfDate(monday)).toBe('2026-11-23')
  })
})
