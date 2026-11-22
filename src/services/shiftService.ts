import { format, startOfWeek, endOfWeek, addDays, parseISO, isBefore, isAfter, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ShiftType, ShiftConfig, NurseShiftAssignment, AuthUser } from '../types'
import { AWS_CONFIG, isApiConfigured } from '../config/aws'

const SHIFT_CONFIGS_STORAGE_KEY = 'healthnet_facility_shifts'
const SHIFT_ASSIGNMENTS_STORAGE_KEY = 'healthnet_nurse_shifts'

export const DEFAULT_SHIFT_CONFIGS: Record<ShiftType, ShiftConfig> = {
  matutino: {
    id: 'matutino',
    name: 'Matutino',
    startTime: '07:00',
    endTime: '15:00',
    description: 'Turno matutino de atención y suministro clínico matinal',
  },
  vespertino: {
    id: 'vespertino',
    name: 'Vespertino',
    startTime: '15:00',
    endTime: '23:00',
    description: 'Turno de tarde, seguimiento terapéutico y recepción de visitas',
  },
  nocturno: {
    id: 'nocturno',
    name: 'Nocturno',
    startTime: '23:00',
    endTime: '07:00',
    description: 'Turno nocturno, supervisión de sueño y monitoreo continuo',
  },
}

// ──────────────────────────────────────────────────────────
// Funciones de Configuración de Horarios del Centro
// ──────────────────────────────────────────────────────────
export function getShiftConfigs(): Record<ShiftType, ShiftConfig> {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SHIFT_CONFIGS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return {
          ...DEFAULT_SHIFT_CONFIGS,
          ...parsed,
        }
      }
    }
  } catch (e) {
    console.error('[shiftService] Error cargando configuraciones de turnos:', e)
  }
  return DEFAULT_SHIFT_CONFIGS
}

export function saveShiftConfigs(configs: Record<ShiftType, ShiftConfig>): void {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(SHIFT_CONFIGS_STORAGE_KEY, JSON.stringify(configs))
    }
  } catch (e) {
    console.error('[shiftService] Error guardando configuraciones de turnos:', e)
  }
}

/**
 * Consulta la configuración de horarios del centro desde AWS API Gateway (/facility-shifts).
 * Sincroniza el almacenamiento local y responde con fallback automático ante fallas de red.
 */
export async function fetchShiftConfigsFromApi(): Promise<Record<ShiftType, ShiftConfig>> {
  if (isApiConfigured()) {
    try {
      const res = await fetch(`${AWS_CONFIG.apiEndpoint}/facility-shifts`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const mapped: Partial<Record<ShiftType, ShiftConfig>> = {}
          data.forEach((item: any) => {
            if (item.id && (item.id === 'matutino' || item.id === 'vespertino' || item.id === 'nocturno')) {
              mapped[item.id as ShiftType] = {
                id: item.id,
                name: item.name || DEFAULT_SHIFT_CONFIGS[item.id as ShiftType].name,
                startTime: item.startTime ? item.startTime.slice(0, 5) : DEFAULT_SHIFT_CONFIGS[item.id as ShiftType].startTime,
                endTime: item.endTime ? item.endTime.slice(0, 5) : DEFAULT_SHIFT_CONFIGS[item.id as ShiftType].endTime,
                description: item.description || DEFAULT_SHIFT_CONFIGS[item.id as ShiftType].description,
              }
            }
          })
          const merged = { ...DEFAULT_SHIFT_CONFIGS, ...mapped }
          saveShiftConfigs(merged)
          return merged
        }
      }
    } catch (e) {
      console.warn('[shiftService] AWS API /facility-shifts no accesible, usando configuración local:', e)
    }
  }
  return getShiftConfigs()
}

/**
 * Persiste la configuración de horarios en AWS API Gateway y localmente.
 */
export async function saveShiftConfigsToApi(configs: Record<ShiftType, ShiftConfig>, user?: AuthUser | null): Promise<void> {
  saveShiftConfigs(configs)
  if (isApiConfigured()) {
    try {
      await fetch(`${AWS_CONFIG.apiEndpoint}/facility-shifts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user?.role || 'admin',
          'X-User-Id': user?.id || 'admin',
        },
        body: JSON.stringify(configs),
      })
    } catch (e) {
      console.warn('[shiftService] Error sincronizando configuración de turnos con AWS API:', e)
    }
  }
}

// ──────────────────────────────────────────────────────────
// Utilidades de Fechas y Semanas (Lunes a Domingo)
// ──────────────────────────────────────────────────────────
export function getMondayOfDate(date: Date): string {
  // En date-fns, startOfWeek con weekStartsOn: 1 obtiene el Lunes
  const monday = startOfWeek(date, { weekStartsOn: 1 })
  return format(monday, 'yyyy-MM-dd')
}

export function getCurrentWeekMonday(): string {
  return getMondayOfDate(new Date())
}

export function formatWeekLabel(weekMondayStr: string): string {
  try {
    const monday = parseISO(weekMondayStr)
    const sunday = addDays(monday, 6)
    const monStr = format(monday, 'd', { locale: es })
    const sunStr = format(sunday, "d 'de' MMMM, yyyy", { locale: es })
    return `Semana del ${monStr} al ${sunStr}`
  } catch {
    return weekMondayStr
  }
}

export function getWeekDaysList(weekMondayStr: string): Array<{ dateStr: string; dayName: string; dayNumber: string }> {
  try {
    const monday = parseISO(weekMondayStr)
    const days = []
    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i)
      days.push({
        dateStr: format(d, 'yyyy-MM-dd'),
        dayName: dayNames[i],
        dayNumber: format(d, 'd MMM', { locale: es }),
      })
    }
    return days
  } catch {
    return []
  }
}

// ──────────────────────────────────────────────────────────
// Semillas Iniciales con Historial Realista de Rotaciones
// ──────────────────────────────────────────────────────────
function getInitialMockAssignments(): NurseShiftAssignment[] {
  const currentMon = getCurrentWeekMonday()
  const today = new Date()
  const mondayDate = parseISO(currentMon)
  const prevWeek1 = format(addDays(mondayDate, -7), 'yyyy-MM-dd')
  const prevWeek2 = format(addDays(mondayDate, -14), 'yyyy-MM-dd')
  const nextWeek1 = format(addDays(mondayDate, 7), 'yyyy-MM-dd')

  const defaultNurseId = 'a0000000-0000-0000-0000-000000000003'
  const defaultNurseName = 'Enf. Carlos Domínguez'

  return [
    {
      id: 'shift-hist-01',
      nurseId: defaultNurseId,
      nurseName: defaultNurseName,
      nurseEmail: 'enfermero@healthnet.com',
      weekStartDate: prevWeek2,
      shiftType: 'matutino',
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
      notes: 'Rotación quincenal matutina inicial.',
      assignedByUserName: 'Lic. Laura Martínez',
      createdAt: new Date(today.getTime() - 15 * 86400000).toISOString(),
    },
    {
      id: 'shift-hist-02',
      nurseId: defaultNurseId,
      nurseName: defaultNurseName,
      nurseEmail: 'enfermero@healthnet.com',
      weekStartDate: prevWeek1,
      shiftType: 'vespertino',
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
      notes: 'Rotación intermedia a turno vespertino.',
      assignedByUserName: 'Lic. Laura Martínez',
      createdAt: new Date(today.getTime() - 8 * 86400000).toISOString(),
    },
    {
      id: 'shift-hist-03',
      nurseId: defaultNurseId,
      nurseName: defaultNurseName,
      nurseEmail: 'enfermero@healthnet.com',
      weekStartDate: currentMon,
      shiftType: 'matutino',
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
      notes: 'Turno activo programado para el ciclo en curso.',
      assignedByUserName: 'Lic. Laura Martínez',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'shift-hist-03-ana',
      nurseId: 'a0000000-0000-0000-0000-000000000004',
      nurseName: 'Lic. Ana Ruiz Morales',
      nurseEmail: 'ana.ruiz@healthnet.com',
      weekStartDate: currentMon,
      shiftType: 'vespertino',
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
      notes: 'Turno vespertino asignado para cobertura asistencial.',
      assignedByUserName: 'Lic. Laura Martínez',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'shift-hist-03-elena',
      nurseId: 'a0000000-0000-0000-0000-000000000005',
      nurseName: 'Lic. Elena Soto Vargas',
      nurseEmail: 'elena.soto@healthnet.com',
      weekStartDate: currentMon,
      shiftType: 'nocturno',
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
      notes: 'Turno nocturno asignado para vigilancia continua.',
      assignedByUserName: 'Lic. Laura Martínez',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'shift-hist-04',
      nurseId: defaultNurseId,
      nurseName: defaultNurseName,
      nurseEmail: 'enfermero@healthnet.com',
      weekStartDate: nextWeek1,
      shiftType: 'nocturno',
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
      notes: 'Próxima rotación a guardia nocturna.',
      assignedByUserName: 'Lic. Laura Martínez',
      createdAt: new Date().toISOString(),
    },
  ]
}

// ──────────────────────────────────────────────────────────
// Funciones de Asignación y Consulta Histórica de Turnos
// ──────────────────────────────────────────────────────────
export function getShiftAssignments(): NurseShiftAssignment[] {
  const initial = getInitialMockAssignments()
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SHIFT_ASSIGNMENTS_STORAGE_KEY)
      if (raw) {
        const parsed: NurseShiftAssignment[] = JSON.parse(raw)
        let updated = false
        initial.forEach(initItem => {
          if (!parsed.some(p => p.nurseId === initItem.nurseId && p.weekStartDate === initItem.weekStartDate)) {
            parsed.push(initItem)
            updated = true
          }
        })
        if (updated) {
          saveShiftAssignments(parsed)
        }
        return parsed
      }
    }
  } catch (e) {
    console.error('[shiftService] Error cargando asignaciones de turnos:', e)
  }
  saveShiftAssignments(initial)
  return initial
}

export function saveShiftAssignments(assignments: NurseShiftAssignment[]): void {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(SHIFT_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments))
    }
  } catch (e) {
    console.error('[shiftService] Error guardando asignaciones de turnos:', e)
  }
}

/**
 * Valida incompatibilidades y solapamientos de turnos para un mismo enfermero.
 * Impide que un enfermero tenga dos turnos incompatibles registrados en el mismo período/semana.
 */
export function checkShiftConflict(
  assignments: NurseShiftAssignment[],
  nurseId: string,
  weekStartDate: string,
  _newShiftType: ShiftType,
  excludeId?: string
): { hasConflict: boolean; conflictingShift?: NurseShiftAssignment; reason?: string } {
  const existing = assignments.find(
    a => a.nurseId === nurseId && a.weekStartDate === weekStartDate && a.id !== excludeId
  )

  if (existing) {
    const configs = getShiftConfigs()
    const shiftName = configs[existing.shiftType]?.name || existing.shiftType
    return {
      hasConflict: true,
      conflictingShift: existing,
      reason: `Incompatibilidad horaria: El enfermero ya tiene asignado el turno ${shiftName} (${configs[existing.shiftType]?.startTime} - ${configs[existing.shiftType]?.endTime}) para esta misma semana. No es posible asignar dos turnos incompatibles simultáneamente. Puedes modificar el turno existente en su lugar.`,
    }
  }

  return { hasConflict: false }
}

/**
 * Registra o actualiza una asignación de turno sin sobrescribir las semanas anteriores.
 */
export function saveOrUpdateNurseShift(
  assignmentData: Omit<NurseShiftAssignment, 'id' | 'createdAt'> & { id?: string }
): NurseShiftAssignment {
  const allAssignments = getShiftAssignments()

  // Validar solapamiento/incompatibilidad
  const conflictCheck = checkShiftConflict(
    allAssignments,
    assignmentData.nurseId,
    assignmentData.weekStartDate,
    assignmentData.shiftType,
    assignmentData.id
  )

  if (conflictCheck.hasConflict) {
    throw new Error(conflictCheck.reason || 'Conflicto de turno detectado en el mismo horario.')
  }

  let savedRecord: NurseShiftAssignment

  if (assignmentData.id) {
    // Modificar programación existente (preservando fecha de creación y asignaciones históricas de otras semanas)
    allAssignments.forEach((a, idx) => {
      if (a.id === assignmentData.id) {
        savedRecord = {
          ...a,
          ...assignmentData,
          id: a.id,
          createdAt: a.createdAt,
          updatedAt: new Date().toISOString(),
        }
        allAssignments[idx] = savedRecord
      }
    })
    savedRecord = savedRecord! || {
      ...assignmentData,
      id: assignmentData.id,
      createdAt: new Date().toISOString(),
    }
  } else {
    // Nueva asignación semanal
    savedRecord = {
      ...assignmentData,
      id: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    }
    allAssignments.push(savedRecord)
  }

  saveShiftAssignments(allAssignments)
  return savedRecord
}

/**
 * Elimina una asignación específica de turno.
 */
export function removeNurseShift(id: string): void {
  const all = getShiftAssignments().filter(a => a.id !== id)
  saveShiftAssignments(all)
}

/**
 * Consulta las asignaciones de turnos de enfermería desde AWS API Gateway (/nurse-shifts).
 * Permite filtrar por semana y sincroniza de forma transparente la memoria local.
 */
export async function fetchShiftAssignmentsFromApi(weekStartDate?: string): Promise<NurseShiftAssignment[]> {
  if (isApiConfigured()) {
    try {
      const url = new URL(`${AWS_CONFIG.apiEndpoint}/nurse-shifts`)
      if (weekStartDate) url.searchParams.set('weekStartDate', weekStartDate)
      const res = await fetch(url.toString())
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const currentLocal = getShiftAssignments()
          const merged = [...currentLocal]
          data.forEach((remote: any) => {
            const idx = merged.findIndex(m => m.id === remote.id || (m.nurseId === remote.nurseId && m.weekStartDate === remote.weekStartDate))
            const formatted: NurseShiftAssignment = {
              id: remote.id,
              nurseId: remote.nurseId,
              nurseName: remote.nurseName,
              nurseEmail: remote.nurseEmail,
              weekStartDate: remote.weekStartDate,
              shiftType: remote.shiftType,
              days: remote.days || ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
              notes: remote.notes || '',
              assignedByUserName: remote.assignedByUserName || 'Administración',
              createdAt: remote.createdAt || new Date().toISOString(),
              updatedAt: remote.updatedAt,
            }
            if (idx >= 0) {
              merged[idx] = formatted
            } else {
              merged.push(formatted)
            }
          })
          saveShiftAssignments(merged)
          return merged
        }
      }
    } catch (e) {
      console.warn('[shiftService] AWS API /nurse-shifts no disponible, usando asignaciones locales:', e)
    }
  }
  return getShiftAssignments()
}

/**
 * Registra o actualiza una asignación de turno en AWS API Gateway y en local.
 */
export async function saveOrUpdateNurseShiftApi(
  assignmentData: Omit<NurseShiftAssignment, 'id' | 'createdAt'> & { id?: string },
  user?: AuthUser | null
): Promise<NurseShiftAssignment> {
  const localSaved = saveOrUpdateNurseShift(assignmentData)
  if (isApiConfigured()) {
    try {
      await fetch(`${AWS_CONFIG.apiEndpoint}/nurse-shifts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user?.role || 'admin',
          'X-User-Id': user?.id || 'admin',
        },
        body: JSON.stringify(localSaved),
      })
    } catch (e) {
      console.warn('[shiftService] Error sincronizando asignación de turno con AWS API:', e)
    }
  }
  return localSaved
}

/**
 * Elimina una asignación de turno en local y en AWS API Gateway.
 */
export async function removeNurseShiftApi(id: string, user?: AuthUser | null): Promise<void> {
  removeNurseShift(id)
  if (isApiConfigured()) {
    try {
      await fetch(`${AWS_CONFIG.apiEndpoint}/nurse-shifts/${id}`, {
        method: 'DELETE',
        headers: {
          'X-User-Role': user?.role || 'admin',
          'X-User-Id': user?.id || 'admin',
        },
      })
    } catch (e) {
      console.warn('[shiftService] Error eliminando turno en AWS API:', e)
    }
  }
}

/**
 * Obtiene el turno actual o el próximo turno programado para un enfermero.
 */
export function getCurrentOrNextShift(
  nurseId: string,
  assignments?: NurseShiftAssignment[],
  configs?: Record<ShiftType, ShiftConfig>
): {
  shift: ShiftConfig | null
  assignment: NurseShiftAssignment | null
  status: 'actual' | 'proximo' | 'sin_asignar'
  badgeLabel: string
  hoursLabel: string
} {
  const allAssignments = assignments || getShiftAssignments()
  const allConfigs = configs || getShiftConfigs()
  const currentMon = getCurrentWeekMonday()

  const nurseAssignments = allAssignments.filter(a => a.nurseId === nurseId)

  // 1. Verificar si tiene turno en la semana actual
  const currentAssignment = nurseAssignments.find(a => a.weekStartDate === currentMon)
  if (currentAssignment) {
    const cfg = allConfigs[currentAssignment.shiftType] || DEFAULT_SHIFT_CONFIGS[currentAssignment.shiftType]
    return {
      shift: cfg,
      assignment: currentAssignment,
      status: 'actual',
      badgeLabel: `${cfg.name} (Esta semana)`,
      hoursLabel: `${cfg.startTime} - ${cfg.endTime}`,
    }
  }

  // 2. Si no tiene turno esta semana, buscar el próximo turno futuro más cercano
  const futureAssignments = nurseAssignments
    .filter(a => a.weekStartDate > currentMon)
    .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))

  if (futureAssignments.length > 0) {
    const nextAssignment = futureAssignments[0]
    const cfg = allConfigs[nextAssignment.shiftType] || DEFAULT_SHIFT_CONFIGS[nextAssignment.shiftType]
    return {
      shift: cfg,
      assignment: nextAssignment,
      status: 'proximo',
      badgeLabel: `${cfg.name} (Próx. semana)`,
      hoursLabel: `${cfg.startTime} - ${cfg.endTime}`,
    }
  }

  return {
    shift: null,
    assignment: null,
    status: 'sin_asignar',
    badgeLabel: 'Sin turno programado',
    hoursLabel: 'Pendiente de asignar',
  }
}

/**
 * Estilos visuales institucionales para cada tipo de turno
 */
export function getShiftStyle(shiftType: ShiftType) {
  switch (shiftType) {
    case 'matutino':
      return {
        bg: 'bg-amber-50 dark:bg-amber-500/10',
        text: 'text-amber-800 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-500/30',
        dot: 'bg-amber-500',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-700/50',
      }
    case 'vespertino':
      return {
        bg: 'bg-sky-50 dark:bg-sky-500/10',
        text: 'text-sky-800 dark:text-sky-300',
        border: 'border-sky-200 dark:border-sky-500/30',
        dot: 'bg-sky-500',
        badge: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300 border-sky-200 dark:border-sky-700/50',
      }
    case 'nocturno':
      return {
        bg: 'bg-indigo-50 dark:bg-indigo-500/10',
        text: 'text-indigo-800 dark:text-indigo-300',
        border: 'border-indigo-200 dark:border-indigo-500/30',
        dot: 'bg-indigo-500',
        badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700/50',
      }
  }
}

/**
 * Determina el turno correspondiente según la fecha y hora proporcionada.
 * Maneja correctamente los turnos nocturnos que cruzan la medianoche y terminan al día siguiente (ej. 23:00 a 07:00).
 */
export function determineShiftFromTimestamp(
  timestamp: number | Date,
  configs?: Record<ShiftType, ShiftConfig>
): ShiftType {
  const allConfigs = configs || getShiftConfigs()
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const timeStr = format(date, 'HH:mm')

  const isTimeInShift = (current: string, start: string, end: string): boolean => {
    if (start < end) {
      // Turno diurno estándar en el mismo día (ej. 07:00 a 15:00 o 15:00 a 23:00)
      return current >= start && current < end
    } else {
      // Turno nocturno que cruza medianoche y termina al día siguiente (ej. 23:00 a 07:00)
      return current >= start || current < end
    }
  }

  const mat = allConfigs.matutino || DEFAULT_SHIFT_CONFIGS.matutino
  const vesp = allConfigs.vespertino || DEFAULT_SHIFT_CONFIGS.vespertino
  const noct = allConfigs.nocturno || DEFAULT_SHIFT_CONFIGS.nocturno

  if (isTimeInShift(timeStr, mat.startTime, mat.endTime)) {
    return 'matutino'
  }
  if (isTimeInShift(timeStr, vesp.startTime, vesp.endTime)) {
    return 'vespertino'
  }
  if (isTimeInShift(timeStr, noct.startTime, noct.endTime)) {
    return 'nocturno'
  }

  return 'matutino'
}

