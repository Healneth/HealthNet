// ──────────────────────────────────────────────
// ROLES Y CONTROL DE ACCESO (RBAC)
// ──────────────────────────────────────────────
export type UserRole = 'admin' | 'doctor' | 'nurse'

export interface RolePermissions {
  // Navegación y módulos
  canViewDashboard: boolean
  canViewMonitoring: boolean
  canViewAlerts: boolean
  canViewHistory: boolean
  canViewPatientGeneral: boolean
  canViewAdvancedHistory: boolean
  canManageUsers: boolean
  canSimulateIoT: boolean

  // Gestión de Pacientes y Fisiología
  canRegisterPatient: boolean
  canDeletePatient: boolean
  canEditPersonalData: boolean // Nombre, edad, género, teléfono
  canEditPhysiologicalData: boolean // Peso y estatura completo (Doctor)
  canUpdateNurseVitals: boolean // Actualizar peso y estatura cuando esté autorizado (Enfermero)
  canEditEmergencyContact: boolean // Contacto de emergencia (Admin, Doctor)
  canEditLocationAndNurse: boolean // Habitación, piso y enfermero responsable (Admin)
  canAssignBracelets: boolean // Vincular y asignar brazaletes (Admin)

  // Umbrales clínicos y reportes
  canEditClinicalThresholds: boolean // Modificar umbrales clínicos de alerta (Únicamente Doctor)
  canGenerateReports: boolean // Generar reportes clínicos (Doctor)

  // Alertas y Bitácora
  canManageAlerts: boolean
  canAttendAlerts: boolean // Atender/resolver alertas y registrar en bitácora (Doctor, Enfermero)
  canLogCareNotes: boolean
  canConsultOnlyAssignedPatients: boolean // Restringido exclusivamente a sus pacientes asignados (Enfermero)

  // Turnos de Enfermería
  canManageShifts: boolean // Administrador: crear, editar horarios y programar turnos
  canViewAllShifts: boolean // Administrador y Doctor: consultar la programación de todo el personal
  canViewOwnShifts: boolean // Enfermero: consultar su propia programación semanal
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  // ──────────────────────────────────────────
  // 1. ROL: ADMINISTRADOR
  // Gestión administrativa del centro asistencial
  // ──────────────────────────────────────────
  admin: {
    canViewDashboard: true,
    canViewMonitoring: true,
    canViewAlerts: true,
    canViewHistory: true,
    canViewPatientGeneral: true,
    canViewAdvancedHistory: true,
    canManageUsers: true, // Control integral de cuentas y roles de usuarios
    canSimulateIoT: true,

    canRegisterPatient: true,
    canDeletePatient: true,
    canEditPersonalData: true,
    canEditPhysiologicalData: false, // NO PUEDE modificar datos clínicos como peso y estatura
    canUpdateNurseVitals: false,
    canEditEmergencyContact: true,
    canEditLocationAndNurse: true, // Gestionar habitaciones, pisos y enfermeros responsables
    canAssignBracelets: true, // Asignar brazaletes a pacientes

    canEditClinicalThresholds: false, // NO PUEDE modificar umbrales clínicos de alerta
    canGenerateReports: true, // Consulta de reportes generales

    canManageAlerts: false, // NO PUEDE atender o resolver alertas médicas
    canAttendAlerts: false, // Ocultar controles de atención médica de alertas
    canLogCareNotes: false,
    canConsultOnlyAssignedPatients: false, // Consulta global de pacientes

    canManageShifts: true, // Gestionar y programar turnos de enfermeros
    canViewAllShifts: true, // Consultar turnos de todo el personal
    canViewOwnShifts: true,
  },

  // ──────────────────────────────────────────
  // 2. ROL: DOCTOR
  // Responsable de la información clínica y diagnóstico
  // ──────────────────────────────────────────
  doctor: {
    canViewDashboard: true,
    canViewMonitoring: true,
    canViewAlerts: true,
    canViewHistory: true, // Consultar mediciones, caídas e historial clínico completo
    canViewPatientGeneral: true,
    canViewAdvancedHistory: true,
    canManageUsers: false, // NO PUEDE administrar usuarios ni modificar roles
    canSimulateIoT: false, // NO PUEDE acceder al simulador IoT (exclusivo para Administrador)

    canRegisterPatient: false, // NO PUEDE registrar pacientes (función exclusiva del Administrador)
    canDeletePatient: false, // NO PUEDE eliminar permanentemente pacientes o historiales
    canEditPersonalData: false, // NO PUEDE modificar datos personales (función de Administración)
    canEditPhysiologicalData: false, // NO PUEDE modificar peso ni estatura (función asistencial de Enfermería)
    canUpdateNurseVitals: false,
    canEditEmergencyContact: false, // NO PUEDE modificar contacto de emergencia (función de Administración)
    canEditLocationAndNurse: false, // NO PUEDE modificar habitaciones ni asignaciones de enfermeros
    canAssignBracelets: false, // NO PUEDE asignar ni desvincular brazaletes

    canEditClinicalThresholds: true, // ÚNICAMENTE el Doctor puede calibrar umbrales clínicos y notas clínicas
    canGenerateReports: true, // Generar reportes clínicos médicos

    canManageAlerts: false, // Solo consulta: NO PUEDE resolver, cerrar ni modificar tickets o alertas
    canAttendAlerts: false, // Solo consulta: NO PUEDE atender alertas (atención operativa de Enfermería)
    canLogCareNotes: false, // Solo consulta de bitácora: NO PUEDE registrar notas operativas de atención
    canConsultOnlyAssignedPatients: false, // Consulta integral de pacientes

    canManageShifts: false, // NO PUEDE modificar turnos de personal
    canViewAllShifts: false, // Oculto para Doctor: no puede ver Programación Semanal de Turnos
    canViewOwnShifts: false,
  },

  // ──────────────────────────────────────────
  // 3. ROL: ENFERMERO
  // Seguimiento de los pacientes que tiene asignados
  // ──────────────────────────────────────────
  nurse: {
    canViewDashboard: true,
    canViewMonitoring: true,
    canViewAlerts: true,
    canViewHistory: true, // Consulta de mediciones e historial de sus pacientes asignados
    canViewPatientGeneral: true,
    canViewAdvancedHistory: false,
    canManageUsers: false, // NO PUEDE administrar usuarios ni acceder a configs administrativas
    canSimulateIoT: false, // Ocultar simulación/registro de hardware a enfermeros

    canRegisterPatient: false, // NO PUEDE registrar ni dar de alta pacientes
    canDeletePatient: false, // NO PUEDE eliminar pacientes
    canEditPersonalData: false, // NO PUEDE modificar nombre, edad, género ni teléfono
    canEditPhysiologicalData: false,
    canUpdateNurseVitals: true, // PUEDE actualizar peso y estatura cuando esté autorizado
    canEditEmergencyContact: false, // Solo consulta
    canEditLocationAndNurse: false, // Solo consulta
    canAssignBracelets: false, // NO PUEDE asignar brazaletes

    canEditClinicalThresholds: false, // Solo consulta los umbrales establecidos por el doctor
    canGenerateReports: false,

    canManageAlerts: true,
    canAttendAlerts: true, // Recibir y atender alertas de sus pacientes asignados
    canLogCareNotes: true, // Registrar las acciones realizadas al atender una alerta
    canConsultOnlyAssignedPatients: false, // Consulta general de pacientes autorizada en Dashboard, Monitoreo, Alertas, Bitácora y Pacientes/Brazaletes

    canManageShifts: false, // NO PUEDE modificar turnos
    canViewAllShifts: false, // NO PUEDE consultar turnos de otros
    canViewOwnShifts: true, // PUEDE consultar su propia programación semanal
  },
} as const

// ──────────────────────────────────────────────
// Auditoría de Modificaciones de Datos (Audit Log)
// ──────────────────────────────────────────────
export interface AuditLogEntry {
  id: string
  userId: string
  userEmail: string
  userRole: UserRole
  userName: string
  action: 'UPDATE_PROFILE' | 'UPDATE_VITALS' | 'UPDATE_THRESHOLDS' | 'ASSIGN_NURSE' | 'ATTEND_ALERT' | 'REGISTER_PATIENT' | 'DELETE_PATIENT' | 'ARCHIVE_PATIENT' | 'UNARCHIVE_PATIENT' | 'SUSPEND_ACCOUNT' | 'REACTIVATE_ACCOUNT' | 'CREATE_USER' | 'ADMIN_RESET_PASSWORD'
  entityType: 'patient' | 'thresholds' | 'alert' | 'bracelet' | 'user' | 'ticket' | 'ticket_note' | 'ticket_transfer'
  entityId: string
  details?: string
  changes?: Record<string, { oldVal: any; newVal: any }>
  timestamp: number
}

// ──────────────────────────────────────────────
// Usuario Autenticado y Gestión de Usuarios
// ──────────────────────────────────────────────
export interface AuthUser {
  id: string
  username: string
  email: string
  fullName: string
  role: UserRole
  phoneNumber?: string
}

export interface SystemUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  phoneNumber: string
  isActive: boolean
  createdAt: string
  defaultShift?: ShiftType
  suspendedAt?: string
  suspendedBy?: string
  suspendedByUserId?: string
  suspendedReason?: string
}

// ──────────────────────────────────────────────
// Gestión de Turnos de Enfermería (Rotaciones)
// ──────────────────────────────────────────────
export type ShiftType = 'matutino' | 'vespertino' | 'nocturno'

export interface ShiftConfig {
  id: ShiftType
  name: string
  startTime: string // "07:00"
  endTime: string   // "15:00"
  description?: string
}

export interface NurseShiftAssignment {
  id: string
  nurseId: string
  nurseName: string
  nurseEmail?: string
  weekStartDate: string // ISO "YYYY-MM-DD" representando el lunes de inicio
  shiftType: ShiftType
  days?: string[] // ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', etc.]
  notes?: string
  assignedByUserName?: string
  createdAt: string
  updatedAt?: string
}

// ──────────────────────────────────────────────
// Asignación de Pacientes por Turno a Enfermeros
// ──────────────────────────────────────────────
export interface PatientShiftAssignment {
  id: string
  patientDeviceId: string
  patientName: string
  roomNumber?: string
  floor?: string
  nurseId: string
  nurseName: string
  nurseEmail?: string
  shiftType: ShiftType
  weekStartDate: string // ISO "YYYY-MM-DD"
  active: boolean
  assignedAt: string
  withdrawnAt?: string
  withdrawnReason?: string
  assignedByUserName?: string
}

export interface PatientShiftCoverage {
  patientDeviceId: string
  patientName: string
  roomNumber: string
  floor: string
  matutino: PatientShiftAssignment | null
  vespertino: PatientShiftAssignment | null
  nocturno: PatientShiftAssignment | null
  coverageCount: number
  isFullyCovered: boolean
  missingShifts: ShiftType[]
}

// ──────────────────────────────────────────────
// Telemetría enviada por el ESP32 / simulador
// ──────────────────────────────────────────────
export interface EmergencyButtonPayload {
  pressed: boolean
  eventId?: string
  lastEventId?: string
}

export interface DeviceTelemetry {
  deviceId: string
  patientName?: string
  timestamp: number // Unix ms
  heartRate: number // bpm
  temperature: number // °C
  fallDetected: boolean
  emergencyButtonPressed?: boolean
  emergencyButton?: EmergencyButtonPayload
  eventId?: string
  eventType?: string
  batteryLevel?: number // 0-100 (opcional en telemetría de transmisión)
  isSimulated?: boolean
  accelerometer?: {
    x: number
    y: number
    z: number
  }
}

// ──────────────────────────────────────────────
// Brazalete (Dispositivo IoT Desacoplado)
// NOTA: Se omiten 'model' y 'battery_level' según especificación
// ──────────────────────────────────────────────
export interface Bracelet {
  deviceId: string
  patientId: string | null
  status: 'DISPONIBLE' | 'ASIGNADO' | 'MANTENIMIENTO'
  assignedAt?: string | null
  lastSyncAt?: string | null
}

// ──────────────────────────────────────────────
// Sistema de Tickets de Alertas Clínicas (v6.0)
// ──────────────────────────────────────────────
export type TicketStatus = 'recibido' | 'en_progreso' | 'completado'
export type TicketCriticality = 'baja' | 'media' | 'alta' | 'critica'

export interface TicketNote {
  id: string
  ticketId: string
  userId: string
  userName: string
  userRole: UserRole
  text: string
  type?: 'general' | 'resolucion' | 'transferencia'
  createdAt: number
}

export interface TicketTransfer {
  id: string
  ticketId: string
  fromNurseId: string
  fromNurseName: string
  toNurseId: string
  toNurseName: string
  toShiftType: ShiftType
  reason: string
  createdAt: number
}

export interface TicketActivity {
  id: string
  ticketId: string
  action: 'CREADO' | 'ASIGNADO' | 'EN_PROGRESO' | 'NOTA_AGREGADA' | 'TRANSFERENCIA' | 'COMPLETADO'
  description: string
  performedBy: string
  performedByRole: UserRole | string
  timestamp: number
}

export interface PatientTicket {
  id: string
  folio: string
  alertId?: string
  deviceId: string
  patientId?: string
  patientName: string
  roomNumber?: string
  floor?: string
  type: 'fall' | 'high_hr' | 'low_hr' | 'high_temp' | 'disconnected' | 'threshold_pending' | string
  title: string
  description: string
  criticality: TicketCriticality | 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA'
  clinicalValue?: string
  shiftType: ShiftType
  status: TicketStatus
  nurseId?: string
  assignedNurseName?: string
  assignedTo?: string
  isUnassigned: boolean
  originalNurseId?: string
  originalNurseName?: string
  notes: TicketNote[]
  transfers: TicketTransfer[]
  activityLog: TicketActivity[]
  resolutionNotes?: string
  completedAt?: number
  completedBy?: string
  createdAt: number
  updatedAt: number
}

// ──────────────────────────────────────────────
// Bitácora de Seguimiento de Alertas (Tickets Legacy & Compatibilidad)
// ──────────────────────────────────────────────
export interface AlertTracking {
  id: string
  alertId: string
  userId: string
  userName: string
  userRole: UserRole
  statusChangedTo: 'EN_ATENCION' | 'ATENDIDA' | 'en_progreso' | 'completado'
  actionNotes: string
  createdAt: number
}

// ──────────────────────────────────────────────
// Alertas Clínicas y Tickets Integrados
// ──────────────────────────────────────────────
export interface Alert {
  id: string
  folio?: string
  eventId?: string
  origin?: 'SENSOR' | 'EMERGENCY_BUTTON' | 'FALL_DETECTION' | 'VITALS_THRESHOLD' | string
  deviceId: string
  patientId?: string
  patientName?: string
  roomNumber?: string
  floor?: string
  type: 'fall' | 'high_hr' | 'low_hr' | 'high_temp' | 'disconnected' | 'threshold_pending' | 'emergency_button' | string
  title?: string
  description?: string
  criticality: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA' | TicketCriticality
  clinicalValue?: string
  message: string
  timestamp: number
  acknowledged: boolean
  status: 'pending' | 'attended' | TicketStatus
  currentStatus: 'PENDIENTE' | 'EN_ATENCION' | 'ATENDIDA' | TicketStatus
  trackingHistory?: AlertTracking[]
  assignedTo?: string
  nurseId?: string
  assignedNurseName?: string
  isUnassigned?: boolean
  originalNurseId?: string
  originalNurseName?: string
  shiftType?: ShiftType
  attendedBy?: string
  attendedAt?: number
  notes?: TicketNote[]
  transfers?: TicketTransfer[]
  activityLog?: TicketActivity[]
  resolutionNotes?: string
  completedAt?: number
  completedBy?: string
  createdAt?: number
  updatedAt?: number
}

// ──────────────────────────────────────────────
// Estado de un dispositivo / paciente en el store
// ──────────────────────────────────────────────
export interface DeviceState {
  deviceId: string
  patientId?: string
  patientName: string
  connected: boolean
  lastSeen: number // Unix ms
  latest: DeviceTelemetry | null
  history: DeviceTelemetry[] // últimas 60 lecturas
  alerts: Alert[]
  profile?: UserProfile
  config?: AlertConfig
  bracelet?: Bracelet
  isArchived?: boolean
  braceletStatus?: 'ASIGNADO' | 'NO_EN_USO' | 'DISPONIBLE'
}

// ──────────────────────────────────────────────
// Dispositivo simulado
// ──────────────────────────────────────────────
export interface SimulatedDevice {
  deviceId: string
  patientName: string
  intervalMs: number
  running: boolean
  mqttClientId?: string
}

// ──────────────────────────────────────────────
// Configuración de Alertas y Sistema
// ──────────────────────────────────────────────
export interface AlertConfig {
  hrMin: number
  hrMax: number
  tempMax: number
  notificationsActive: boolean
  theme: 'light' | 'dark'
  watchTheme: 'light' | 'dark'
}

// ──────────────────────────────────────────────
// Perfil del Paciente (Adulto Mayor)
// ──────────────────────────────────────────────
export type PatientGender = 'Hombre' | 'Mujer'

export interface UserProfile {
  id?: string
  name: string
  age: string
  gender: PatientGender | string
  weight: string
  height: string
  phone: string
  // Contacto de emergencia: campos separados obligatorios
  emergencyContactName: string
  emergencyContactPhone: string
  emergencyContact?: string // Compatibilidad con endpoints legacy
  // Ubicación física y asignación a enfermeros de turno
  roomNumber?: string // Número o identificador de cuarto/cama
  floor?: string // Piso / Nivel
  bedNumber?: string // Número de cama
  assignedNurseId?: string // ID del enfermero responsable
  assignedNurseName?: string // Nombre del enfermero responsable
  medicalNotes?: string
  isActive?: boolean
  isArchived?: boolean
  archivedAt?: number
  archivedBy?: string
  archivedByUserId?: string
  archivedReason?: string
  hasThresholdsConfigured?: boolean
}

// ──────────────────────────────────────────────
// Umbrales de alerta por defecto
// ──────────────────────────────────────────────
export const THRESHOLDS = {
  HR_MIN: 50,
  HR_MAX: 110,
  TEMP_MAX: 38.0,
  HISTORY_SIZE: 60,
} as const
