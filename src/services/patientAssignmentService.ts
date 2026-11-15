import type { PatientShiftAssignment, PatientShiftCoverage, ShiftType, SystemUser, DeviceState } from '../types'
import { getCurrentWeekMonday, getMondayOfDate, determineShiftFromTimestamp } from './shiftService'
import { logAuditEvent } from '../utils/auditLogger'

const PATIENT_ASSIGNMENTS_STORAGE_KEY = 'healthnet_patient_shift_assignments'

// ──────────────────────────────────────────────────────────
// Datos Iniciales con Historial Realista de Asignaciones
// ──────────────────────────────────────────────────────────
function getInitialMockPatientAssignments(): PatientShiftAssignment[] {
  const currentMon = getCurrentWeekMonday()
  const today = new Date()

  const nurseCarlosId = 'a0000000-0000-0000-0000-000000000003'
  const nurseCarlosName = 'Enf. Carlos Domínguez'
  const nurseCarlosEmail = 'enfermero@healthnet.com'

  const nurseAnaId = 'a0000000-0000-0000-0000-000000000004'
  const nurseAnaName = 'Lic. Ana Ruiz Morales'
  const nurseAnaEmail = 'ana.ruiz@healthnet.com'

  const nurseElenaId = 'a0000000-0000-0000-0000-000000000005'
  const nurseElenaName = 'Lic. Elena Soto Vargas'
  const nurseElenaEmail = 'elena.soto@healthnet.com'

  return [
    // ──────────────────────────────────────────
    // 1. PACIENTE: Ana García (ESP32-101 · Hab. 101) - Cobertura Completa 3/3
    // ──────────────────────────────────────────
    {
      id: 'psa-ana-mat',
      patientDeviceId: 'ESP32-101',
      patientName: 'Ana García',
      roomNumber: 'Hab. 101',
      floor: 'Piso 1',
      nurseId: nurseCarlosId,
      nurseName: nurseCarlosName,
      nurseEmail: nurseCarlosEmail,
      shiftType: 'matutino',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },
    {
      id: 'psa-ana-vesp',
      patientDeviceId: 'ESP32-101',
      patientName: 'Ana García',
      roomNumber: 'Hab. 101',
      floor: 'Piso 1',
      nurseId: nurseAnaId,
      nurseName: nurseAnaName,
      nurseEmail: nurseAnaEmail,
      shiftType: 'vespertino',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },
    {
      id: 'psa-ana-noct',
      patientDeviceId: 'ESP32-101',
      patientName: 'Ana García',
      roomNumber: 'Hab. 101',
      floor: 'Piso 1',
      nurseId: nurseElenaId,
      nurseName: nurseElenaName,
      nurseEmail: nurseElenaEmail,
      shiftType: 'nocturno',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },

    // ──────────────────────────────────────────
    // 2. PACIENTE: Carlos López (ESP32-102 · Hab. 102) - Cobertura Parcial 2/3
    // ──────────────────────────────────────────
    {
      id: 'psa-carlos-mat',
      patientDeviceId: 'ESP32-102',
      patientName: 'Carlos López',
      roomNumber: 'Hab. 102',
      floor: 'Piso 1',
      nurseId: nurseCarlosId,
      nurseName: nurseCarlosName,
      nurseEmail: nurseCarlosEmail,
      shiftType: 'matutino',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },
    {
      id: 'psa-carlos-vesp',
      patientDeviceId: 'ESP32-102',
      patientName: 'Carlos López',
      roomNumber: 'Hab. 102',
      floor: 'Piso 1',
      nurseId: nurseAnaId,
      nurseName: nurseAnaName,
      nurseEmail: nurseAnaEmail,
      shiftType: 'vespertino',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },

    // ──────────────────────────────────────────
    // 3. PACIENTE: María Martínez (ESP32-201 · Hab. 201) - Cobertura Completa 3/3
    // ──────────────────────────────────────────
    {
      id: 'psa-maria-mat',
      patientDeviceId: 'ESP32-201',
      patientName: 'María Martínez',
      roomNumber: 'Hab. 201',
      floor: 'Piso 2',
      nurseId: nurseAnaId,
      nurseName: nurseAnaName,
      nurseEmail: nurseAnaEmail,
      shiftType: 'matutino',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },
    {
      id: 'psa-maria-vesp',
      patientDeviceId: 'ESP32-201',
      patientName: 'María Martínez',
      roomNumber: 'Hab. 201',
      floor: 'Piso 2',
      nurseId: nurseElenaId,
      nurseName: nurseElenaName,
      nurseEmail: nurseElenaEmail,
      shiftType: 'vespertino',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },
    {
      id: 'psa-maria-noct',
      patientDeviceId: 'ESP32-201',
      patientName: 'María Martínez',
      roomNumber: 'Hab. 201',
      floor: 'Piso 2',
      nurseId: nurseCarlosId,
      nurseName: nurseCarlosName,
      nurseEmail: nurseCarlosEmail,
      shiftType: 'nocturno',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },

    // ──────────────────────────────────────────
    // 4. PACIENTE: José Rodríguez (ESP32-202 · Hab. 202) - Cobertura Parcial 1/3
    // ──────────────────────────────────────────
    {
      id: 'psa-jose-mat',
      patientDeviceId: 'ESP32-202',
      patientName: 'José Rodríguez',
      roomNumber: 'Hab. 202',
      floor: 'Piso 2',
      nurseId: nurseElenaId,
      nurseName: nurseElenaName,
      nurseEmail: nurseElenaEmail,
      shiftType: 'matutino',
      weekStartDate: currentMon,
      active: true,
      assignedAt: new Date(today.getTime() - 2 * 86400000).toISOString(),
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },

    // ──────────────────────────────────────────
    // 5. REGISTRO HISTÓRICO: Asignación retirada archivada
    // ──────────────────────────────────────────
    {
      id: 'psa-hist-001',
      patientDeviceId: 'ESP32-201',
      patientName: 'María Martínez',
      roomNumber: 'Hab. 201',
      floor: 'Piso 2',
      nurseId: nurseCarlosId,
      nurseName: nurseCarlosName,
      nurseEmail: nurseCarlosEmail,
      shiftType: 'matutino',
      weekStartDate: currentMon,
      active: false,
      assignedAt: new Date(today.getTime() - 6 * 86400000).toISOString(),
      withdrawnAt: new Date(today.getTime() - 1 * 86400000).toISOString(),
      withdrawnReason: 'Rotación periódica por cambio de turno asistencial.',
      assignedByUserName: 'Lic. Laura Martínez (Admin)',
    },
  ]
}

// ──────────────────────────────────────────────────────────
// Funciones de Acceso y Persistencia
// ──────────────────────────────────────────────────────────
export function getAllPatientShiftAssignments(): PatientShiftAssignment[] {
  const initial = getInitialMockPatientAssignments()
  try {
    const raw = localStorage.getItem(PATIENT_ASSIGNMENTS_STORAGE_KEY)
    if (raw) {
      const parsed: PatientShiftAssignment[] = JSON.parse(raw)
      let updated = false
      initial.forEach(initItem => {
        if (!parsed.some(p => p.patientDeviceId === initItem.patientDeviceId && p.shiftType === initItem.shiftType && p.weekStartDate === initItem.weekStartDate)) {
          parsed.push(initItem)
          updated = true
        }
      })
      if (updated) {
        saveAllPatientShiftAssignments(parsed)
      }
      return parsed
    }
  } catch (e) {
    console.error('[patientAssignmentService] Error cargando asignaciones:', e)
  }
  saveAllPatientShiftAssignments(initial)
  return initial
}

export function saveAllPatientShiftAssignments(assignments: PatientShiftAssignment[]): void {
  try {
    localStorage.setItem(PATIENT_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments))
  } catch (e) {
    console.error('[patientAssignmentService] Error guardando asignaciones:', e)
  }
}

// ──────────────────────────────────────────────────────────
// Consultas por Enfermero y Paciente
// ──────────────────────────────────────────────────────────
export function getNursePatientAssignments(
  nurseId: string,
  weekStartDate?: string,
  activeOnly = true
): PatientShiftAssignment[] {
  const all = getAllPatientShiftAssignments()
  return all.filter(a => {
    const matchNurse = a.nurseId === nurseId
    const matchWeek = !weekStartDate || a.weekStartDate === weekStartDate
    const matchActive = !activeOnly || a.active === true
    return matchNurse && matchWeek && matchActive
  })
}

export function getPatientShiftAssignments(
  patientDeviceId: string,
  weekStartDate?: string,
  activeOnly = true
): PatientShiftAssignment[] {
  const all = getAllPatientShiftAssignments()
  return all.filter(a => {
    const matchPatient = a.patientDeviceId === patientDeviceId
    const matchWeek = !weekStartDate || a.weekStartDate === weekStartDate
    const matchActive = !activeOnly || a.active === true
    return matchPatient && matchWeek && matchActive
  })
}

/**
 * Obtiene la cobertura de los 3 turnos (matutino, vespertino, nocturno) para un paciente
 */
export function getPatientCoverage(
  patientDeviceId: string,
  weekStartDate: string,
  allAssignments?: PatientShiftAssignment[]
): PatientShiftCoverage {
  const assignments = allAssignments || getAllPatientShiftAssignments()
  const activeForPatient = assignments.filter(
    a => a.patientDeviceId === patientDeviceId && a.weekStartDate === weekStartDate && a.active === true
  )

  const matutino = activeForPatient.find(a => a.shiftType === 'matutino') || null
  const vespertino = activeForPatient.find(a => a.shiftType === 'vespertino') || null
  const nocturno = activeForPatient.find(a => a.shiftType === 'nocturno') || null

  const missingShifts: ShiftType[] = []
  if (!matutino) missingShifts.push('matutino')
  if (!vespertino) missingShifts.push('vespertino')
  if (!nocturno) missingShifts.push('nocturno')

  const sample = activeForPatient[0]
  const coverageCount = (matutino ? 1 : 0) + (vespertino ? 1 : 0) + (nocturno ? 1 : 0)

  return {
    patientDeviceId,
    patientName: sample?.patientName || patientDeviceId,
    roomNumber: sample?.roomNumber || 'Habitación',
    floor: sample?.floor || 'Piso 1',
    matutino,
    vespertino,
    nocturno,
    coverageCount,
    isFullyCovered: missingShifts.length === 0,
    missingShifts,
  }
}

/**
 * Asigna un paciente a un enfermero en su turno programado.
 * Si ya existía una asignación activa para ese mismo paciente y turno, se retira
 * conservando el registro histórico.
 */
export function assignPatientToNurseShift(params: {
  patientDeviceId: string
  patientName: string
  roomNumber?: string
  floor?: string
  nurseId: string
  nurseName: string
  nurseEmail?: string
  shiftType: ShiftType
  weekStartDate: string
  assignedByUserName?: string
  assignedByUserId?: string
}): PatientShiftAssignment {
  const all = getAllPatientShiftAssignments()

  // Buscar si ya existía una asignación activa para este paciente en este turno y semana
  const existingIndex = all.findIndex(
    a =>
      a.patientDeviceId === params.patientDeviceId &&
      a.shiftType === params.shiftType &&
      a.weekStartDate === params.weekStartDate &&
      a.active === true
  )

  if (existingIndex >= 0) {
    const prev = all[existingIndex]
    // Retirar la asignación anterior manteniendo su historial
    all[existingIndex] = {
      ...prev,
      active: false,
      withdrawnAt: new Date().toISOString(),
      withdrawnReason: `Reasignación de turno a ${params.nurseName} por la administración.`,
    }
  }

  const newAssignment: PatientShiftAssignment = {
    id: `psa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patientDeviceId: params.patientDeviceId,
    patientName: params.patientName,
    roomNumber: params.roomNumber || 'Hab. 101',
    floor: params.floor || 'Piso 1',
    nurseId: params.nurseId,
    nurseName: params.nurseName,
    nurseEmail: params.nurseEmail,
    shiftType: params.shiftType,
    weekStartDate: params.weekStartDate,
    active: true,
    assignedAt: new Date().toISOString(),
    assignedByUserName: params.assignedByUserName || 'Lic. Laura Martínez (Admin)',
  }

  all.push(newAssignment)
  saveAllPatientShiftAssignments(all)

  // Auditoría
  try {
    logAuditEvent({
      userId: params.assignedByUserId || 'admin-system',
      userEmail: 'admin@healthnet.com',
      userRole: 'admin',
      userName: params.assignedByUserName || 'Administración',
      action: 'ASSIGN_NURSE',
      entityType: 'patient',
      entityId: params.patientDeviceId,
      details: `Asignación de paciente ${params.patientName} a ${params.nurseName} en turno ${params.shiftType} (Semana ${params.weekStartDate})`,
    }).catch(() => {})
  } catch {}

  return newAssignment
}

/**
 * Retira una asignación conservando el registro histórico intacto.
 */
export function withdrawPatientShiftAssignment(params: {
  assignmentId: string
  reason?: string
  byUserName?: string
  byUserId?: string
}): boolean {
  const all = getAllPatientShiftAssignments()
  const idx = all.findIndex(a => a.id === params.assignmentId)

  if (idx < 0) return false

  const target = all[idx]
  all[idx] = {
    ...target,
    active: false,
    withdrawnAt: new Date().toISOString(),
    withdrawnReason: params.reason || 'Retiro de asignación solicitado por la administración.',
  }

  saveAllPatientShiftAssignments(all)

  try {
    logAuditEvent({
      userId: params.byUserId || 'admin-system',
      userEmail: 'admin@healthnet.com',
      userRole: 'admin',
      userName: params.byUserName || 'Administración',
      action: 'ASSIGN_NURSE',
      entityType: 'patient',
      entityId: target.patientDeviceId,
      details: `Retiro de paciente ${target.patientName} del enfermero ${target.nurseName} en turno ${target.shiftType}: ${params.reason || 'Sin motivo especificado'}`,
    }).catch(() => {})
  } catch {}

  return true
}

/**
 * Calcula el resumen métrico de asignaciones para la vista principal
 */
export function calculateAssignmentsOverview(
  devices: DeviceState[],
  activeNurses: SystemUser[],
  weekStartDate: string
) {
  const allAssignments = getAllPatientShiftAssignments()
  const weekActive = allAssignments.filter(a => a.weekStartDate === weekStartDate && a.active === true)

  const nonArchivedDevices = devices.filter(d => !d.isArchived && d.profile?.isArchived !== true)

  let fullyCovered = 0
  let partiallyCovered = 0
  let unassignedAny = 0

  nonArchivedDevices.forEach(d => {
    const coverage = getPatientCoverage(d.deviceId, weekStartDate, weekActive)
    if (coverage.isFullyCovered) {
      fullyCovered++
    } else if (coverage.missingShifts.length < 3) {
      partiallyCovered++
    } else {
      unassignedAny++
    }
  })

  // Distribución por turno
  const shiftDistribution = {
    matutino: weekActive.filter(a => a.shiftType === 'matutino').length,
    vespertino: weekActive.filter(a => a.shiftType === 'vespertino').length,
    nocturno: weekActive.filter(a => a.shiftType === 'nocturno').length,
  }

  // Pacientes asignados por cada enfermero
  const nursePatientCounts: Record<string, number> = {}
  activeNurses.forEach(n => {
    nursePatientCounts[n.id] = weekActive.filter(a => a.nurseId === n.id).length
  })

  return {
    totalNurses: activeNurses.length,
    totalPatients: nonArchivedDevices.length,
    fullyCovered,
    partiallyCovered,
    unassignedAny,
    shiftDistribution,
    nursePatientCounts,
  }
}

/**
 * Identifica el turno y al enfermero responsable asignado a un paciente para un timestamp determinado.
 * Si no tiene responsable asignado en ese turno, devuelve el turno pero nurseId y nurseName indefinidos.
 */
export function getActiveNurseForPatientShift(
  patientDeviceId: string,
  timestamp: number | Date = Date.now()
): {
  shiftType: ShiftType
  weekStartDate: string
  nurseId?: string
  nurseName?: string
  nurseEmail?: string
  assignmentId?: string
  hasAssignedNurse: boolean
} {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const shiftType = determineShiftFromTimestamp(date)
  const weekStartDate = getMondayOfDate(date)

  const allAssignments = getAllPatientShiftAssignments()
  const assignment = allAssignments.find(
    a =>
      a.patientDeviceId === patientDeviceId &&
      a.weekStartDate === weekStartDate &&
      a.shiftType === shiftType &&
      a.active === true
  )

  if (assignment) {
    return {
      shiftType,
      weekStartDate,
      nurseId: assignment.nurseId,
      nurseName: assignment.nurseName,
      nurseEmail: assignment.nurseEmail,
      assignmentId: assignment.id,
      hasAssignedNurse: true,
    }
  }

  return {
    shiftType,
    weekStartDate,
    hasAssignedNurse: false,
  }
}

