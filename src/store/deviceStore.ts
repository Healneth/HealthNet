import { create } from 'zustand'
import type {
  DeviceState,
  DeviceTelemetry,
  Alert,
  AlertConfig,
  UserProfile,
  AuthUser,
  AlertTracking,
  TicketStatus,
  TicketNote,
  TicketTransfer,
  TicketActivity,
  ShiftType,
} from '../types'
import { THRESHOLDS } from '../types'
import { patientsService, setDeviceStoreRef } from '../services/patients'
import { logAuditEvent } from '../utils/auditLogger'
import { simulatorService } from '../services/simulator'
import { getActiveNurseForPatientShift, getAllPatientShiftAssignments } from '../services/patientAssignmentService'
import { getSystemUsers } from '../services/auth'

function getCurrentAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('healthnet_current_user')
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

interface DeviceStore {
  devices: Record<string, DeviceState>
  alerts: Alert[]
  theme: 'light' | 'dark'

  sidebarCollapsed: boolean
  sidebarVisible: boolean

  // Actions
  loadPatientsFromDb: () => Promise<void>
  addAlert: (alert: Alert) => void
  upsertTelemetry: (data: DeviceTelemetry) => void
  acknowledgeAlert: (alertId: string) => void
  updateAlertStatus: (
    alertId: string,
    newStatus: 'PENDIENTE' | 'EN_ATENCION' | 'ATENDIDA',
    actionNotes?: string,
    user?: AuthUser
  ) => void
  addTicketNote: (ticketId: string, text: string, user?: AuthUser) => Promise<void>
  updateTicketStatus: (
    ticketId: string,
    newStatus: TicketStatus,
    resolutionNotes?: string,
    user?: AuthUser
  ) => Promise<void>
  transferTicket: (
    ticketId: string,
    toNurseId: string,
    toNurseName: string,
    toShiftType: ShiftType,
    reason: string,
    user?: AuthUser
  ) => Promise<void>
  clearAlerts: (deviceId?: string) => void
  removeDevice: (deviceId: string) => Promise<void>
  updateDeviceProfile: (deviceId: string, prof: Partial<UserProfile>) => Promise<void>
  updateDeviceConfig: (deviceId: string, cfg: Partial<AlertConfig>) => Promise<void>
  assignPatientToNurse: (
    deviceId: string,
    nurseId: string | null,
    nurseName: string | null,
    roomNumber?: string,
    floor?: string
  ) => Promise<void>
  registerPatient: (
    deviceId: string,
    profile: Partial<UserProfile>,
    config?: Partial<AlertConfig>
  ) => Promise<void>
  archivePatient: (deviceId: string, reason?: string) => Promise<void>
  unarchivePatient: (deviceId: string) => Promise<void>
  setGlobalTheme: (theme: 'light' | 'dark') => void
  toggleSidebarCollapse: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setSidebarVisible: (visible: boolean) => void
}

const DEFAULT_CONFIG: AlertConfig = {
  hrMin: THRESHOLDS.HR_MIN,
  hrMax: THRESHOLDS.HR_MAX,
  tempMax: THRESHOLDS.TEMP_MAX,
  notificationsActive: true,
  theme: 'light',
  watchTheme: 'dark',
}

const createDefaultProfile = (name: string): UserProfile => ({
  name: name || 'Paciente Nuevo',
  age: '65',
  gender: 'Hombre',
  weight: '70 kg',
  height: '1.70 m',
  phone: '—',
  emergencyContactName: 'Familiar Responsable',
  emergencyContactPhone: '—',
  emergencyContact: 'Familiar Responsable (—)',
  roomNumber: 'Hab. 101',
  floor: 'Piso 1',
  assignedNurseId: undefined,
  assignedNurseName: undefined,
})

const INITIAL_MOCK_ALERTS: Alert[] = [
  {
    id: 'alert-seed-1',
    folio: 'TCK-2026-0081',
    deviceId: 'ESP32-101',
    patientId: 'p-001',
    patientName: 'Ana García',
    roomNumber: 'Hab. 101',
    floor: 'Piso 1',
    type: 'high_hr',
    title: 'Taquicardia en Reposo',
    description: 'El ritmo cardíaco (114 bpm) ha superado el umbral clínico configurado (110 bpm).',
    clinicalValue: '114 bpm',
    criticality: 'alta',
    message: 'Ritmo cardíaco elevado en Ana García: 114 bpm',
    timestamp: Date.now() - 1000 * 60 * 45,
    acknowledged: false,
    status: 'recibido',
    currentStatus: 'recibido',
    shiftType: 'matutino',
    nurseId: 'a0000000-0000-0000-0000-000000000003',
    assignedNurseName: 'Enf. Carlos Domínguez',
    assignedTo: 'Enf. Carlos Domínguez',
    originalNurseId: 'a0000000-0000-0000-0000-000000000003',
    originalNurseName: 'Enf. Carlos Domínguez',
    isUnassigned: false,
    notes: [],
    transfers: [],
    activityLog: [
      {
        id: 'act-seed-1',
        ticketId: 'alert-seed-1',
        action: 'CREADO',
        description: 'Ticket generado automáticamente por alerta de taquicardia (114 bpm).',
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: Date.now() - 1000 * 60 * 45,
      },
      {
        id: 'act-seed-2',
        ticketId: 'alert-seed-1',
        action: 'ASIGNADO',
        description: 'Asignado automáticamente a Enf. Carlos Domínguez según programación de turno matutino.',
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: Date.now() - 1000 * 60 * 45,
      },
    ],
  },
  {
    id: 'alert-seed-attended',
    folio: 'TCK-2026-0082',
    deviceId: 'ESP32-101',
    patientId: 'p-001',
    patientName: 'Ana García',
    roomNumber: 'Hab. 101',
    floor: 'Piso 1',
    type: 'fall',
    title: 'Detección de Caída / Impacto Biomecánico',
    description: 'Sensor acelerométrico registró aceleración súbita en Eje Z con impacto de 2.8G.',
    clinicalValue: 'Impacto 2.8G / Eje Z',
    criticality: 'critica',
    message: '¡Caída detectada en Ana García!',
    timestamp: Date.now() - 1000 * 60 * 180,
    acknowledged: true,
    status: 'completado',
    currentStatus: 'completado',
    shiftType: 'matutino',
    nurseId: 'a0000000-0000-0000-0000-000000000003',
    assignedNurseName: 'Enf. Carlos Domínguez',
    assignedTo: 'Enf. Carlos Domínguez',
    originalNurseId: 'a0000000-0000-0000-0000-000000000003',
    originalNurseName: 'Enf. Carlos Domínguez',
    isUnassigned: false,
    attendedBy: 'Enf. Carlos Domínguez',
    attendedAt: Date.now() - 1000 * 60 * 165,
    completedAt: Date.now() - 1000 * 60 * 165,
    completedBy: 'Enf. Carlos Domínguez',
    resolutionNotes: 'Paciente valorada. Sin traumatismos ni fracturas. Signos vitales normales y reposo asistido en cama con barandales de seguridad arriba.',
    notes: [
      {
        id: 'not-seed-01',
        ticketId: 'alert-seed-attended',
        userId: 'a0000000-0000-0000-0000-000000000003',
        userName: 'Enf. Carlos Domínguez',
        userRole: 'nurse',
        text: 'Acudiendo de inmediato a habitación 101 para valoración física del paciente.',
        type: 'general',
        createdAt: Date.now() - 1000 * 60 * 175,
      },
      {
        id: 'not-seed-02',
        ticketId: 'alert-seed-attended',
        userId: 'a0000000-0000-0000-0000-000000000003',
        userName: 'Enf. Carlos Domínguez',
        userRole: 'nurse',
        text: 'Paciente valorada. Sin traumatismos ni fracturas. Signos vitales normales y reposo asistido en cama con barandales de seguridad arriba.',
        type: 'resolucion',
        createdAt: Date.now() - 1000 * 60 * 165,
      },
    ],
    transfers: [],
    activityLog: [
      {
        id: 'act-seed-3',
        ticketId: 'alert-seed-attended',
        action: 'CREADO',
        description: 'Ticket generado automáticamente por impacto acelerométrico de caída.',
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: Date.now() - 1000 * 60 * 180,
      },
      {
        id: 'act-seed-4',
        ticketId: 'alert-seed-attended',
        action: 'ASIGNADO',
        description: 'Asignado a Enf. Carlos Domínguez (turno matutino).',
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: Date.now() - 1000 * 60 * 180,
      },
      {
        id: 'act-seed-5',
        ticketId: 'alert-seed-attended',
        action: 'EN_PROGRESO',
        description: 'Atención comenzada por Enf. Carlos Domínguez.',
        performedBy: 'Enf. Carlos Domínguez',
        performedByRole: 'nurse',
        timestamp: Date.now() - 1000 * 60 * 175,
      },
      {
        id: 'act-seed-6',
        ticketId: 'alert-seed-attended',
        action: 'COMPLETADO',
        description: 'Ticket completado y resuelto con nota clínica de resolución.',
        performedBy: 'Enf. Carlos Domínguez',
        performedByRole: 'nurse',
        timestamp: Date.now() - 1000 * 60 * 165,
      },
    ],
    trackingHistory: [
      {
        id: 'trk-seed-01',
        alertId: 'alert-seed-attended',
        userId: 'a0000000-0000-0000-0000-000000000003',
        userName: 'Enf. Carlos Domínguez',
        userRole: 'nurse',
        statusChangedTo: 'EN_ATENCION',
        actionNotes: 'Acudiendo de inmediato a habitación 101 para valoración física del paciente.',
        createdAt: Date.now() - 1000 * 60 * 175,
      },
      {
        id: 'trk-seed-02',
        alertId: 'alert-seed-attended',
        userId: 'a0000000-0000-0000-0000-000000000003',
        userName: 'Enf. Carlos Domínguez',
        userRole: 'nurse',
        statusChangedTo: 'ATENDIDA',
        actionNotes: 'Paciente valorada. Sin traumatismos ni lesiones evidentes. Signos vitales estables y reposo asistido.',
        createdAt: Date.now() - 1000 * 60 * 165,
      },
    ],
  },
  {
    id: 'alert-seed-2',
    folio: 'TCK-2026-0083',
    deviceId: 'ESP32-201',
    patientId: 'p-003',
    patientName: 'María Martínez',
    roomNumber: 'Hab. 201',
    floor: 'Piso 2',
    type: 'high_temp',
    title: 'Hipertermia / Alza Térmica',
    description: 'Temperatura axilar registrada de 38.3°C, superando el umbral de 37.8°C.',
    clinicalValue: '38.3 °C',
    criticality: 'media',
    message: 'Temperatura corporal elevada en María Martínez: 38.3°C',
    timestamp: Date.now() - 1000 * 60 * 25,
    acknowledged: false,
    status: 'en_progreso',
    currentStatus: 'en_progreso',
    shiftType: 'matutino',
    nurseId: 'a0000000-0000-0000-0000-000000000004',
    assignedNurseName: 'Lic. Ana Ruiz Morales',
    assignedTo: 'Lic. Ana Ruiz Morales',
    originalNurseId: 'a0000000-0000-0000-0000-000000000004',
    originalNurseName: 'Lic. Ana Ruiz Morales',
    isUnassigned: false,
    notes: [
      {
        id: 'not-seed-03',
        ticketId: 'alert-seed-2',
        userId: 'a0000000-0000-0000-0000-000000000004',
        userName: 'Lic. Ana Ruiz Morales',
        userRole: 'nurse',
        text: 'Se aplican medios físicos y compresas tibias en axilas y frente. Se reporta al médico tratante y se administra antipirético recetado.',
        type: 'general',
        createdAt: Date.now() - 1000 * 60 * 18,
      },
    ],
    transfers: [],
    activityLog: [
      {
        id: 'act-seed-7',
        ticketId: 'alert-seed-2',
        action: 'CREADO',
        description: 'Ticket generado automáticamente por detección de hipertermia (38.3°C).',
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: Date.now() - 1000 * 60 * 25,
      },
      {
        id: 'act-seed-8',
        ticketId: 'alert-seed-2',
        action: 'ASIGNADO',
        description: 'Asignado a Lic. Ana Ruiz Morales según programación de turno matutino.',
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: Date.now() - 1000 * 60 * 25,
      },
      {
        id: 'act-seed-9',
        ticketId: 'alert-seed-2',
        action: 'EN_PROGRESO',
        description: 'Atención comenzada por Lic. Ana Ruiz Morales.',
        performedBy: 'Lic. Ana Ruiz Morales',
        performedByRole: 'nurse',
        timestamp: Date.now() - 1000 * 60 * 20,
      },
      {
        id: 'act-seed-10',
        ticketId: 'alert-seed-2',
        action: 'NOTA_AGREGADA',
        description: 'Nota de atención clínica registrada por Lic. Ana Ruiz Morales.',
        performedBy: 'Lic. Ana Ruiz Morales',
        performedByRole: 'nurse',
        timestamp: Date.now() - 1000 * 60 * 18,
      },
    ],
  },
  {
    id: 'alert-seed-unassigned',
    folio: 'TCK-2026-0084',
    deviceId: 'ESP32-202',
    patientId: 'p-004',
    patientName: 'José Rodríguez',
    roomNumber: 'Hab. 202',
    floor: 'Piso 2',
    type: 'low_hr',
    title: 'Bradicardia en Paciente Postquirúrgico',
    description: 'El ritmo cardíaco (48 bpm) se encuentra significativamente por debajo del umbral mínimo de 55 bpm.',
    clinicalValue: '48 bpm',
    criticality: 'alta',
    message: 'Ritmo cardíaco bajo en José Rodríguez: 48 bpm',
    timestamp: Date.now() - 1000 * 60 * 12,
    acknowledged: false,
    status: 'recibido',
    currentStatus: 'recibido',
    shiftType: 'matutino',
    nurseId: undefined,
    assignedNurseName: undefined,
    assignedTo: undefined,
    isUnassigned: true,
    notes: [],
    transfers: [],
    activityLog: [
      {
        id: 'act-seed-11',
        ticketId: 'alert-seed-unassigned',
        action: 'CREADO',
        description: 'Ticket generado por alerta clínica de bradicardia (48 bpm).',
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: Date.now() - 1000 * 60 * 12,
      },
      {
        id: 'act-seed-12',
        ticketId: 'alert-seed-unassigned',
        action: 'ASIGNADO',
        description: 'Sin enfermero asignado en la programación de turnos. Ticket marcado como Sin Asignar para supervisión administrativa.',
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: Date.now() - 1000 * 60 * 12,
      },
    ],
  },
]

const INITIAL_MOCK_DEVICES: Record<string, DeviceState> = {
  'ESP32-101': {
    deviceId: 'ESP32-101',
    patientName: 'Ana García',
    connected: true,
    lastSeen: Date.now() - 1000 * 45,
    latest: {
      deviceId: 'ESP32-101',
      patientName: 'Ana García',
      timestamp: Date.now() - 1000 * 45,
      heartRate: 74,
      temperature: 36.6,
      fallDetected: false,
      batteryLevel: 92,
      isSimulated: true,
    },
    history: [
      { deviceId: 'ESP32-101', timestamp: Date.now() - 180000, heartRate: 72, temperature: 36.5, fallDetected: false },
      { deviceId: 'ESP32-101', timestamp: Date.now() - 120000, heartRate: 75, temperature: 36.6, fallDetected: false },
      { deviceId: 'ESP32-101', timestamp: Date.now() - 60000, heartRate: 74, temperature: 36.6, fallDetected: false },
    ],
    alerts: [INITIAL_MOCK_ALERTS[0], INITIAL_MOCK_ALERTS[1]],
    profile: {
      id: 'p-001',
      name: 'Ana García',
      age: '72',
      gender: 'Mujer',
      weight: '64 kg',
      height: '1.58 m',
      phone: '+52 664 111 2233',
      emergencyContactName: 'Roberto García',
      emergencyContactPhone: '+52 55 1234 5678',
      emergencyContact: 'Roberto García (+52 55 1234 5678)',
      roomNumber: 'Hab. 101',
      floor: 'Piso 1',
      assignedNurseId: 'a0000000-0000-0000-0000-000000000003',
      assignedNurseName: 'Enf. Carlos Domínguez',
      medicalNotes: 'Hipertensión controlada con losartán. Monitoreo diario de pulso.',
    },
    config: { ...DEFAULT_CONFIG },
  },
  'ESP32-102': {
    deviceId: 'ESP32-102',
    patientName: 'Carlos López',
    connected: true,
    lastSeen: Date.now() - 1000 * 60,
    latest: {
      deviceId: 'ESP32-102',
      patientName: 'Carlos López',
      timestamp: Date.now() - 1000 * 60,
      heartRate: 82,
      temperature: 36.8,
      fallDetected: false,
      batteryLevel: 88,
      isSimulated: true,
    },
    history: [
      { deviceId: 'ESP32-102', timestamp: Date.now() - 180000, heartRate: 80, temperature: 36.7, fallDetected: false },
      { deviceId: 'ESP32-102', timestamp: Date.now() - 120000, heartRate: 83, temperature: 36.8, fallDetected: false },
      { deviceId: 'ESP32-102', timestamp: Date.now() - 60000, heartRate: 82, temperature: 36.8, fallDetected: false },
    ],
    alerts: [],
    profile: {
      id: 'p-002',
      name: 'Carlos López',
      age: '78',
      gender: 'Hombre',
      weight: '73 kg',
      height: '1.72 m',
      phone: '+52 664 222 3344',
      emergencyContactName: 'Elena López',
      emergencyContactPhone: '+52 55 9876 5432',
      emergencyContact: 'Elena López (+52 55 9876 5432)',
      roomNumber: 'Hab. 102',
      floor: 'Piso 1',
      assignedNurseId: 'a0000000-0000-0000-0000-000000000003',
      assignedNurseName: 'Enf. Carlos Domínguez',
      medicalNotes: 'Arritmia leve en reposo. Precaución con deambulación nocturna.',
    },
    config: { ...DEFAULT_CONFIG },
  },
  'ESP32-201': {
    deviceId: 'ESP32-201',
    patientName: 'María Martínez',
    connected: true,
    lastSeen: Date.now() - 1000 * 30,
    latest: {
      deviceId: 'ESP32-201',
      patientName: 'María Martínez',
      timestamp: Date.now() - 1000 * 30,
      heartRate: 70,
      temperature: 36.4,
      fallDetected: false,
      batteryLevel: 95,
      isSimulated: true,
    },
    history: [
      { deviceId: 'ESP32-201', timestamp: Date.now() - 180000, heartRate: 68, temperature: 36.4, fallDetected: false },
      { deviceId: 'ESP32-201', timestamp: Date.now() - 120000, heartRate: 71, temperature: 36.4, fallDetected: false },
      { deviceId: 'ESP32-201', timestamp: Date.now() - 60000, heartRate: 70, temperature: 36.4, fallDetected: false },
    ],
    alerts: [INITIAL_MOCK_ALERTS[2]],
    profile: {
      id: 'p-003',
      name: 'María Martínez',
      age: '84',
      gender: 'Mujer',
      weight: '58 kg',
      height: '1.55 m',
      phone: '+52 664 333 4455',
      emergencyContactName: 'Sofía Martínez',
      emergencyContactPhone: '+52 55 3344 5566',
      emergencyContact: 'Sofía Martínez (+52 55 3344 5566)',
      roomNumber: 'Hab. 201',
      floor: 'Piso 2',
      assignedNurseId: undefined,
      assignedNurseName: undefined,
      medicalNotes: 'Deterioro cognitivo moderado. Requiere asistencia en traslados.',
    },
    config: { ...DEFAULT_CONFIG },
  },
  'ESP32-202': {
    deviceId: 'ESP32-202',
    patientName: 'José Rodríguez',
    connected: true,
    lastSeen: Date.now() - 1000 * 90,
    latest: {
      deviceId: 'ESP32-202',
      patientName: 'José Rodríguez',
      timestamp: Date.now() - 1000 * 90,
      heartRate: 68,
      temperature: 36.5,
      fallDetected: false,
      batteryLevel: 80,
      isSimulated: true,
    },
    history: [
      { deviceId: 'ESP32-202', timestamp: Date.now() - 180000, heartRate: 66, temperature: 36.5, fallDetected: false },
      { deviceId: 'ESP32-202', timestamp: Date.now() - 120000, heartRate: 69, temperature: 36.5, fallDetected: false },
      { deviceId: 'ESP32-202', timestamp: Date.now() - 60000, heartRate: 68, temperature: 36.5, fallDetected: false },
    ],
    alerts: [],
    profile: {
      id: 'p-004',
      name: 'José Rodríguez',
      age: '69',
      gender: 'Hombre',
      weight: '80 kg',
      height: '1.75 m',
      phone: '+52 664 444 5566',
      emergencyContactName: 'Juan Rodríguez',
      emergencyContactPhone: '+52 55 7788 9900',
      emergencyContact: 'Juan Rodríguez (+52 55 7788 9900)',
      roomNumber: 'Hab. 202',
      floor: 'Piso 2',
      assignedNurseId: undefined,
      assignedNurseName: undefined,
      medicalNotes: 'Recuperación post-operatoria de cadera. Marcha con andadera.',
    },
    config: { ...DEFAULT_CONFIG },
  },
}

const DELETED_DEVICES_KEY = 'healthnet_deleted_devices'

export const loadDeletedDevices = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_DEVICES_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

export const addDeletedDevice = (deviceId: string) => {
  try {
    const list = loadDeletedDevices()
    if (!list.includes(deviceId)) {
      list.push(deviceId)
      localStorage.setItem(DELETED_DEVICES_KEY, JSON.stringify(list))
    }
  } catch {}
}

export const removeDeletedDevice = (deviceId: string) => {
  try {
    const list = loadDeletedDevices().filter(id => id !== deviceId)
    localStorage.setItem(DELETED_DEVICES_KEY, JSON.stringify(list))
  } catch {}
}

const ALERTS_STORAGE_KEY = 'healthnet_clinical_alerts'

export const loadPersistedAlerts = (): Alert[] => {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return INITIAL_MOCK_ALERTS
}

export const savePersistedAlerts = (alerts: Alert[]) => {
  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts))
  } catch {}
}

const loadInitialDevices = (): Record<string, DeviceState> => {
  const deletedDevices = loadDeletedDevices()
  const savedSettings = loadSettingsMap()
  const devices: Record<string, DeviceState> = {}

  for (const devId in INITIAL_MOCK_DEVICES) {
    if (!deletedDevices.includes(devId)) {
      devices[devId] = { ...INITIAL_MOCK_DEVICES[devId] }
    }
  }

  for (const devId in savedSettings) {
    if (deletedDevices.includes(devId)) continue
    const prof = savedSettings[devId].profile
    const isArchived = Boolean(prof?.isArchived)
    if (devices[devId]) {
      devices[devId] = {
        ...devices[devId],
        patientName: prof?.name || devices[devId].patientName,
        profile: prof,
        config: savedSettings[devId].config,
        isArchived,
        braceletStatus: isArchived ? 'NO_EN_USO' : 'ASIGNADO',
      }
    } else {
      devices[devId] = {
        deviceId: devId,
        patientName: prof?.name || devId,
        connected: false,
        lastSeen: 0,
        latest: null,
        history: [],
        alerts: [],
        profile: prof,
        config: savedSettings[devId].config,
        isArchived,
        braceletStatus: isArchived ? 'NO_EN_USO' : 'ASIGNADO',
      }
    }
  }

  // Vincular alertas guardadas para que cada paciente mantenga su historial de alertas
  const persistedAlerts = loadPersistedAlerts()
  persistedAlerts.forEach(a => {
    if (devices[a.deviceId]) {
      const existing = devices[a.deviceId].alerts || []
      const exists = existing.some(ex => (a.eventId && ex.eventId === a.eventId) || (a.folio && ex.folio === a.folio) || ex.id === a.id)
      if (!exists) {
        devices[a.deviceId].alerts = [a, ...existing]
      }
    }
  })

  return devices
}

const loadSettingsMap = (): Record<string, { profile: UserProfile, config: AlertConfig }> => {
  try {
    const raw = localStorage.getItem('healthnet_device_settings')
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.error(e)
  }
  return {}
}

const saveSettingsMap = (map: Record<string, { profile: UserProfile, config: AlertConfig }>) => {
  try {
    localStorage.setItem('healthnet_device_settings', JSON.stringify(map))
  } catch (e) {
    console.error(e)
  }
}

const loadSystemTheme = (): 'light' | 'dark' => {
  try {
    const raw = localStorage.getItem('healthnet_global_theme')
    if (raw === 'dark' || raw === 'light') return raw
  } catch (e) {
    console.error(e)
  }
  return 'light'
}

const loadSidebarCollapsed = (): boolean => {
  try {
    const raw = localStorage.getItem('healthnet_sidebar_collapsed')
    if (raw === 'true') return true
  } catch (e) {
    console.error(e)
  }
  return false
}

const loadSidebarVisibility = (): boolean => {
  try {
    const raw = localStorage.getItem('healthnet_sidebar_visible')
    if (raw === 'false') return false
  } catch (e) {
    console.error(e)
  }
  return true
}

const generateAlertId = () => `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export function isNurseAuthorizedForTicket(ticket: Alert, user: AuthUser): boolean {
  if (user.role !== 'nurse') return false

  const isEmergency = ticket.type === 'emergency_button' || ticket.origin === 'EMERGENCY_BUTTON'

  // Regla 2: Si es una alerta de emergencia y no tiene enfermero asignado, nadie tiene autorización operativa directa
  if (isEmergency && (ticket.isUnassigned || (!ticket.nurseId && !ticket.assignedNurseName))) {
    return false
  }

  // 1. Coincidencia por ID de enfermero asignado
  if (ticket.nurseId && ticket.nurseId === user.id) return true

  // 2. Coincidencia por nombre completo o username
  if (user.fullName && ticket.assignedNurseName &&
      ticket.assignedNurseName.trim().toLowerCase() === user.fullName.trim().toLowerCase()) {
    return true
  }
  if (user.fullName && ticket.assignedTo &&
      ticket.assignedTo.trim().toLowerCase() === user.fullName.trim().toLowerCase()) {
    return true
  }

  // 3. Compatibilidad con credencial de demostración de enfermero (Carlos Domínguez)
  if (user.email === 'enfermero@healthnet.com') {
    if (isEmergency) {
      if (ticket.nurseId === 'a0000000-0000-0000-0000-000000000003' ||
          ticket.assignedNurseName?.includes('Carlos Domínguez') || ticket.assignedTo?.includes('Carlos Domínguez')) {
        return true
      }
      return false
    }

    if (!ticket.nurseId || ticket.nurseId === 'a0000000-0000-0000-0000-000000000003' ||
        ticket.assignedNurseName?.includes('Carlos Domínguez') || ticket.assignedTo?.includes('Carlos Domínguez')) {
      return true
    }
  }

  return false
}

// Conjunto de eventIds de emergencia procesados para deduplicación estricta en memoria
const processedEmergencyEventIds = new Set<string>()

function detectAlerts(
  prev: DeviceState | undefined,
  data: DeviceTelemetry,
  config: AlertConfig,
  patientName: string,
  fallbackNurseName?: string
): Alert[] {
  const alerts: Alert[] = []
  const now = Date.now()

  // Reconocer dinámicamente el turno y el enfermero responsable según programación de turnos
  const shiftInfo = getActiveNurseForPatientShift(data.deviceId, now)
  const shiftType = shiftInfo.shiftType
  const hasAssigned = Boolean(shiftInfo.hasAssignedNurse && shiftInfo.nurseId)
  const assignedNurseName = hasAssigned ? shiftInfo.nurseName : (fallbackNurseName || undefined)
  const nurseId = hasAssigned ? shiftInfo.nurseId : undefined
  const isUnassigned = !hasAssigned && !fallbackNurseName
  const roomNumber = prev?.profile?.roomNumber || 'Hab. 101'
  const floor = prev?.profile?.floor || 'Piso 1'
  const patientId = prev?.profile?.id

  const buildTicketMetadata = (
    type: 'fall' | 'high_hr' | 'low_hr' | 'high_temp' | 'emergency_button' | string,
    title: string,
    description: string,
    clinicalValue: string,
    criticality: 'baja' | 'media' | 'alta' | 'critica' | 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA',
    message: string,
    origin: string = 'SENSOR',
    eventId?: string
  ): Alert => {
    const alertId = generateAlertId()
    const folio = `TCK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
    const finalEventId = eventId || `ev-${alertId}`
    const initialActivity: TicketActivity[] = [
      {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ticketId: alertId,
        action: 'CREADO',
        description: `Ticket generado automáticamente por ${title} (${clinicalValue}).`,
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: now,
      },
      {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ticketId: alertId,
        action: 'ASIGNADO',
        description: hasAssigned
          ? `Asignado automáticamente a ${assignedNurseName} para el turno ${shiftType}.`
          : `Sin enfermero asignado en la programación de turno ${shiftType}. Pendiente de supervisión.`,
        performedBy: 'Sistema HealthNet',
        performedByRole: 'system',
        timestamp: now,
      },
    ]

    return {
      id: alertId,
      folio,
      eventId: finalEventId,
      origin,
      deviceId: data.deviceId,
      patientId,
      patientName,
      roomNumber,
      floor,
      type,
      title,
      description,
      clinicalValue,
      criticality,
      message,
      timestamp: now,
      acknowledged: false,
      status: 'recibido',
      currentStatus: 'recibido',
      shiftType,
      nurseId,
      assignedNurseName,
      assignedTo: assignedNurseName,
      originalNurseId: nurseId,
      originalNurseName: assignedNurseName,
      isUnassigned,
      notes: [],
      transfers: [],
      activityLog: initialActivity,
    }
  }

  // Las alertas del pulsador de emergencia físico PBS-33B se procesan y originan EXCLUSIVAMENTE
  // en el backend central (Regla 3). El frontend nunca crea tickets ni asignaciones por su cuenta.
  // Aquí únicamente se analizan límites biométricos locales (acelerómetro, pulso, temperatura).

  if (data.fallDetected) {
    alerts.push(
      buildTicketMetadata(
        'fall',
        'Detección de Caída / Impacto Biomecánico',
        'El sensor acelerométrico ha detectado un impacto súbito en el paciente con patrón de desaceleración brusca.',
        'Impacto Acelerométrico',
        'critica',
        `¡Caída detectada en ${patientName}!`,
        'FALL_DETECTION'
      )
    )
  }
  if (data.heartRate > config.hrMax) {
    const isCritical = data.heartRate > config.hrMax + 30
    alerts.push(
      buildTicketMetadata(
        'high_hr',
        'Taquicardia / Pulso Elevado',
        `El ritmo cardíaco (${data.heartRate} bpm) ha superado el umbral clínico configurado (${config.hrMax} bpm).`,
        `${data.heartRate} bpm`,
        isCritical ? 'critica' : 'alta',
        `Ritmo cardíaco elevado: ${data.heartRate} bpm`,
        'VITALS_THRESHOLD'
      )
    )
  }
  if (data.heartRate < config.hrMin) {
    const isCritical = data.heartRate < config.hrMin - 15
    alerts.push(
      buildTicketMetadata(
        'low_hr',
        'Bradicardia / Pulso Bajo',
        `El ritmo cardíaco (${data.heartRate} bpm) ha descendido por debajo del umbral clínico (${config.hrMin} bpm).`,
        `${data.heartRate} bpm`,
        isCritical ? 'critica' : 'alta',
        `Ritmo cardíaco bajo: ${data.heartRate} bpm`,
        'VITALS_THRESHOLD'
      )
    )
  }
  if (data.temperature > config.tempMax) {
    const isHigh = data.temperature >= 39.0
    alerts.push(
      buildTicketMetadata(
        'high_temp',
        'Hipertermia / Alza Térmica',
        `La temperatura corporal (${data.temperature.toFixed(1)}°C) superó el umbral clínico (${config.tempMax}°C).`,
        `${data.temperature.toFixed(1)} °C`,
        isHigh ? 'alta' : 'media',
        `Temperatura elevada: ${data.temperature.toFixed(1)}°C`,
        'VITALS_THRESHOLD'
      )
    )
  }

  // Suppress duplicates if prev already has same type unacknowledged or same eventId
  if (prev) {
    return alerts.filter(a => {
      if (a.eventId && prev.alerts.some(p => p.eventId === a.eventId)) {
        return false
      }
      return !prev.alerts.some(p => p.type === a.type && !p.acknowledged && p.status !== 'completado')
    })
  }
  return alerts
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: loadInitialDevices(),
  alerts: loadPersistedAlerts(),
  theme: loadSystemTheme(),
  sidebarCollapsed: loadSidebarCollapsed(),
  sidebarVisible: loadSidebarVisibility(),

  loadPatientsFromDb: async () => {
    try {
      const [patients, dbAlerts] = await Promise.all([
        patientsService.getPatients(),
        patientsService.getAlerts()
      ])
      
      // Si la API remota no devolvió registros (modo local o API en despliegue), preservar estado local sin vaciar nada
      if (patients.length === 0 && dbAlerts.length === 0) {
        return
      }

      set((state) => {
        const deletedDevices = loadDeletedDevices()
        const updatedDevices = { ...state.devices }

        // Si llegaron pacientes de la BD remota, sincronizar catálogo
        if (patients.length > 0) {
          patients.forEach((p) => {
            if (deletedDevices.includes(p.deviceId)) return
            const prev = updatedDevices[p.deviceId]
            
            // Guardar en copia local de respaldo
            const settingsMap = loadSettingsMap()
            settingsMap[p.deviceId] = {
              profile: p.profile,
              config: p.config
            }
            saveSettingsMap(settingsMap)
            
            // Mezclar alertas del dispositivo preservando las locales existentes
            const existingDevAlerts = prev?.alerts || []
            const newDeviceDbAlerts = dbAlerts.filter(a => a.deviceId === p.deviceId)
            const mergedDevAlerts = [...existingDevAlerts]
            newDeviceDbAlerts.forEach(dbA => {
              const idx = mergedDevAlerts.findIndex(a =>
                (dbA.eventId && a.eventId === dbA.eventId) ||
                (dbA.folio && a.folio === dbA.folio) ||
                a.id === dbA.id
              )
              if (idx >= 0) {
                mergedDevAlerts[idx] = { ...mergedDevAlerts[idx], ...dbA }
              } else {
                mergedDevAlerts.unshift(dbA)
              }
            })

            updatedDevices[p.deviceId] = {
              deviceId: p.deviceId,
              patientName: p.patientName,
              connected: prev?.connected ?? false,
              lastSeen: prev?.lastSeen ?? 0,
              latest: prev?.latest ?? null,
              history: prev?.history ?? [],
              alerts: mergedDevAlerts,
              profile: p.profile,
              config: p.config,
              isArchived: Boolean(p.profile?.isArchived),
              braceletStatus: p.profile?.isArchived ? 'NO_EN_USO' : 'ASIGNADO',
            }
          })
        }

        // Combinar alertas remotas con las locales sin borrar las existentes
        const mergedAlerts = [...state.alerts]
        if (dbAlerts.length > 0) {
          dbAlerts.forEach((dbA) => {
            const idx = mergedAlerts.findIndex(a =>
              (dbA.eventId && a.eventId === dbA.eventId) ||
              (dbA.folio && a.folio === dbA.folio) ||
              a.id === dbA.id
            )
            if (idx >= 0) {
              mergedAlerts[idx] = { ...mergedAlerts[idx], ...dbA }
            } else {
              mergedAlerts.unshift(dbA)
            }
          })
          savePersistedAlerts(mergedAlerts)
        }

        return { devices: updatedDevices, alerts: mergedAlerts }
      })
    } catch (err) {
      console.error('[Store] Error cargando pacientes de la BD:', err)
    }
  },

  addAlert: (alert) => {
    set((state) => {
      // Evitar duplicados por id, eventId o folio
      const exists = state.alerts.some(a => (alert.eventId && a.eventId === alert.eventId) || a.id === alert.id || (alert.folio && a.folio === alert.folio))
      if (exists) return state

      const dev = state.devices[alert.deviceId]
      const updatedDevices = dev ? {
        ...state.devices,
        [alert.deviceId]: {
          ...dev,
          alerts: [alert, ...(dev.alerts || [])]
        }
      } : state.devices

      const updatedAlerts = [alert, ...state.alerts]
      savePersistedAlerts(updatedAlerts)

      return {
        alerts: updatedAlerts,
        devices: updatedDevices
      }
    })
  },

  upsertTelemetry: (data) => {
    // Validar y sanitizar timestamp para evitar RangeError (ej. si el ESP32 no tiene NTP activo y manda -1 o desborda)
    let ts = Number(data.timestamp)
    if (isNaN(ts) || ts <= 0 || ts > 8.64e15) {
      ts = Date.now()
    }
    data.timestamp = ts

    // 1. Si el dispositivo fue eliminado definitivamente, rechazar telemetría y apagar simulador
    const deletedDevices = loadDeletedDevices()
    if (deletedDevices.includes(data.deviceId)) {
      try {
        simulatorService.stopDevice(data.deviceId)
        simulatorService.removeDevice(data.deviceId)
      } catch {}
      return
    }

    set((state) => {
      const prev = state.devices[data.deviceId]
      
      // Carga o inicializa perfil y configuración del paciente
      const settingsMap = loadSettingsMap()
      let settings = settingsMap[data.deviceId]

      // 2. Si el paciente está archivado, el dispositivo está "apagado" y deja de registrar telemetría
      const isArchived = Boolean(prev?.isArchived || prev?.profile?.isArchived || settings?.profile?.isArchived)
      if (isArchived) {
        try {
          simulatorService.stopDevice(data.deviceId)
        } catch {}
        return state
      }

      // Si no existe previamente y tampoco en settings, y no fue dado de alta formalmente, no recrear automáticamente
      if (!settings && prev?.profile && prev?.config) {
        settings = {
          profile: prev.profile,
          config: prev.config
        }
        settingsMap[data.deviceId] = settings
        saveSettingsMap(settingsMap)
      } else if (!settings && !prev) {
        // Dispositivo desconocido o eliminado: descartar telemetría para evitar que aparezca de nuevo
        return state
      } else if (!settings) {
        settings = {
          profile: createDefaultProfile(data.patientName || data.deviceId),
          config: { ...DEFAULT_CONFIG }
        }
        settingsMap[data.deviceId] = settings
        saveSettingsMap(settingsMap)

        // Registrar paciente nuevo en la base de datos de manera asíncrona
        patientsService.savePatient(data.deviceId, settings.profile, settings.config)
          .catch(err => console.error('[Store] Error al auto-registrar paciente nuevo en BD:', err))
      } else if (data.isSimulated && data.patientName && settings.profile.name !== data.patientName) {
        // Regla de Oro: Solo actualizar nombre dinámicamente si es un brazalete de prueba dentro del simulador.
        // Si es un dispositivo real conectado a AWS IoT, los datos registrados en la BD tienen prioridad absoluta y no se falsifican.
        settings.profile.name = data.patientName
        settingsMap[data.deviceId] = settings
        saveSettingsMap(settingsMap)

        patientsService.savePatient(data.deviceId, settings.profile, settings.config)
          .catch(err => console.error('[Store] Error al actualizar nombre de paciente en la BD:', err))
      }

      const patientName = settings.profile.name || data.patientName || data.deviceId
      const assignedNurseName = settings.profile.assignedNurseName || prev?.profile?.assignedNurseName
      const newAlerts = detectAlerts(prev, data, settings.config, patientName, assignedNurseName)
      
      // Guardar nuevas alertas en la base de datos de manera asíncrona
      newAlerts.forEach(alert => {
        patientsService.saveAlert(alert)
          .catch(err => console.error('[Store] Error guardando nueva alerta:', err))
      })

      // Si es un dispositivo físico real (no simulado), persistir la medición en AWS RDS (clinical_measurements)
      if (!data.isSimulated) {
        patientsService.saveMeasurement(data.deviceId, {
          heartRate: data.heartRate,
          temperature: data.temperature,
          timestamp: data.timestamp,
        }).catch(err => console.warn('[Store] Medición clínica guardada localmente (esperando reconexión RDS):', err))
      }

      const history = [
        ...(prev?.history ?? []),
        data,
      ].slice(-THRESHOLDS.HISTORY_SIZE)

      const device: DeviceState = {
        deviceId: data.deviceId,
        patientName: patientName,
        connected: true,
        lastSeen: data.timestamp,
        latest: data,
        history,
        alerts: [...(prev?.alerts ?? []), ...newAlerts],
        profile: settings.profile,
        config: settings.config,
      }

      const updatedAlerts = [...state.alerts, ...newAlerts]
      if (newAlerts.length > 0) {
        savePersistedAlerts(updatedAlerts)
      }

      return {
        devices: { ...state.devices, [data.deviceId]: device },
        alerts: updatedAlerts,
      }
    })
  },

  acknowledgeAlert: (alertId) => {
    const authUser = getCurrentAuthUser()

    // RBAC: Ni el Administrador ni el Doctor pueden atender o resolver alertas (función operativa exclusiva de enfermería)
    if (authUser?.role === 'admin' || authUser?.role === 'doctor') {
      console.warn(`[Store] Acceso denegado: El rol ${authUser?.role} no tiene autorización para atender o resolver alertas clínicas.`)
      return
    }

    if (!authUser || authUser.role !== 'nurse') {
      console.warn('[Store] Acceso denegado: Se requiere un rol de enfermero autenticado.')
      return
    }

    const state = useDeviceStore.getState()
    const targetTicket = state.alerts.find(a => a.id === alertId || a.folio === alertId)
    if (!targetTicket) return

    // Validar si el enfermero es el responsable asignado
    if (!isNurseAuthorizedForTicket(targetTicket, authUser)) {
      console.warn(`[Store] Acceso denegado: Solo el enfermero asignado (${targetTicket.assignedNurseName || 'Sin asignar'}) puede atender este ticket.`)
      return
    }

    // Ninguna acción de reconocimiento debe saltarse el proceso formal:
    // Si está en 'recibido', pasar formalmente a 'en_progreso' con registro de actividad
    if (targetTicket.status === 'recibido') {
      useDeviceStore.getState().updateTicketStatus(targetTicket.id, 'en_progreso', undefined, authUser).catch(err => {
        console.error('[Store] Error iniciando atención formal de ticket:', err)
      })
    }
  },

  updateAlertStatus: (alertId, newStatus, actionNotes, user) => {
    const authUser = user || getCurrentAuthUser()

    // RBAC: Ni el Administrador ni el Doctor pueden atender, modificar o resolver alertas clínicas (exclusivo de enfermería)
    if (authUser?.role === 'admin' || authUser?.role === 'doctor') {
      console.warn(`[Store] Acceso denegado: El rol ${authUser?.role} no tiene autorización operativa para atender o modificar tickets de alerta.`)
      return
    }

    const isAttended = newStatus === 'ATENDIDA'
    if (isAttended) {
      patientsService.acknowledgeAlert(alertId)
        .catch(err => console.error('[Store] Error actualizando estado de alerta:', err))
    }

    if (authUser) {
      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: authUser.role,
        userName: authUser.fullName,
        action: 'ATTEND_ALERT',
        entityType: 'alert',
        entityId: alertId,
        details: `Ticket de alerta clínica cambiado a ${newStatus}. Notas: ${actionNotes || 'Sin notas'}`
      }).catch(() => {})
    }

    const attendedTimestamp = Date.now()
    const attendantName = authUser?.fullName || authUser?.username || 'Personal Asistencial'

    const trackingItem: AlertTracking = {
      id: `trk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      alertId,
      userId: authUser?.id || 'usr-default',
      userName: attendantName,
      userRole: authUser?.role || 'nurse',
      statusChangedTo: isAttended ? 'ATENDIDA' : 'EN_ATENCION',
      actionNotes: actionNotes?.trim() || (isAttended ? 'Alerta atendida y resuelta en piso.' : 'En atención asistencial.'),
      createdAt: attendedTimestamp,
    }

    const ticketStatus: TicketStatus = isAttended ? 'completado' : 'en_progreso'
    const noteType = isAttended ? 'resolucion' : 'general'

    set((state) => {
      const updateAlertRecord = (a: Alert): Alert => {
        if (a.id === alertId) {
          const newTracking = [...(a.trackingHistory || []), trackingItem]
          const newNotes: TicketNote[] = actionNotes?.trim()
            ? [
                ...(a.notes || []),
                {
                  id: `not-${attendedTimestamp}-${Math.random().toString(36).slice(2, 6)}`,
                  ticketId: a.id,
                  userId: authUser?.id || 'usr-default',
                  userName: attendantName,
                  userRole: 'nurse',
                  text: actionNotes.trim(),
                  type: noteType,
                  createdAt: attendedTimestamp,
                },
              ]
            : (a.notes || [])

          const newActivity: TicketActivity[] = [
            ...(a.activityLog || []),
            {
              id: `act-${attendedTimestamp}-${Math.random().toString(36).slice(2, 6)}`,
              ticketId: a.id,
              action: isAttended ? 'COMPLETADO' : 'EN_PROGRESO',
              description: isAttended
                ? `Alerta atendida y completada por ${attendantName}.`
                : `Atención iniciada por ${attendantName}.`,
              performedBy: attendantName,
              performedByRole: 'nurse',
              timestamp: attendedTimestamp,
            },
          ]

          return {
            ...a,
            status: ticketStatus,
            currentStatus: isAttended ? ('ATENDIDA' as const) : ('EN_ATENCION' as const),
            acknowledged: isAttended ? true : a.acknowledged,
            attendedBy: isAttended ? attendantName : a.attendedBy,
            attendedAt: isAttended ? attendedTimestamp : a.attendedAt,
            completedBy: isAttended ? attendantName : a.completedBy,
            completedAt: isAttended ? attendedTimestamp : a.completedAt,
            resolutionNotes: isAttended ? (actionNotes?.trim() || a.resolutionNotes) : a.resolutionNotes,
            trackingHistory: newTracking,
            notes: newNotes,
            activityLog: newActivity,
          }
        }
        return a
      }

      const updatedAlerts = state.alerts.map(updateAlertRecord)
      const updatedDevices = { ...state.devices }
      for (const id in updatedDevices) {
        updatedDevices[id] = {
          ...updatedDevices[id],
          alerts: updatedDevices[id].alerts.map(updateAlertRecord),
        }
      }
      savePersistedAlerts(updatedAlerts)

      return { alerts: updatedAlerts, devices: updatedDevices }
    })
  },

  addTicketNote: async (ticketId, text, user) => {
    const authUser = user || getCurrentAuthUser()
    if (!authUser) throw new Error('Usuario no autenticado')

    if (authUser.role === 'admin' || authUser.role === 'doctor') {
      throw new Error(`Acceso Denegado (RBAC): El rol ${authUser.role} no tiene autorización para agregar notas de atención a tickets clínicos.`)
    }

    const state = useDeviceStore.getState()
    const targetTicket = state.alerts.find(a => a.id === ticketId || a.folio === ticketId)
    if (!targetTicket) throw new Error('Ticket no encontrado')

    if (!isNurseAuthorizedForTicket(targetTicket, authUser)) {
      throw new Error(`Acceso Denegado (RBAC): Solo el enfermero asignado (${targetTicket.assignedNurseName || 'Sin asignar'}) puede registrar notas de atención en este ticket.`)
    }

    const now = Date.now()
    const authorName = authUser.fullName || authUser.username || 'Enfermero'
    const newNote: TicketNote = {
      id: `not-${now}-${Math.random().toString(36).slice(2, 6)}`,
      ticketId: targetTicket.id,
      userId: authUser.id,
      userName: authorName,
      userRole: 'nurse',
      text: text.trim(),
      type: 'general',
      createdAt: now,
    }

    const newActivity: TicketActivity = {
      id: `act-${now}-${Math.random().toString(36).slice(2, 6)}`,
      ticketId: targetTicket.id,
      action: 'NOTA_AGREGADA',
      description: `Nota de atención clínica registrada por ${authorName}.`,
      performedBy: authorName,
      performedByRole: 'nurse',
      timestamp: now,
    }

    set(s => {
      const updateAlert = (a: Alert): Alert => {
        if (a.id === targetTicket.id) {
          return {
            ...a,
            notes: [...(a.notes || []), newNote],
            activityLog: [...(a.activityLog || []), newActivity],
          }
        }
        return a
      }

      const updatedAlerts = s.alerts.map(updateAlert)
      const updatedDevices = { ...s.devices }
      for (const dId in updatedDevices) {
        updatedDevices[dId] = {
          ...updatedDevices[dId],
          alerts: updatedDevices[dId].alerts.map(updateAlert),
        }
      }
      savePersistedAlerts(updatedAlerts)
      return { alerts: updatedAlerts, devices: updatedDevices }
    })

    logAuditEvent({
      userId: authUser.id,
      userEmail: authUser.email,
      userRole: authUser.role,
      userName: authUser.fullName,
      action: 'ATTEND_ALERT',
      entityType: 'ticket_note',
      entityId: targetTicket.id,
      details: `Nota agregada al ticket ${targetTicket.folio || targetTicket.id}: ${text.slice(0, 100)}`,
    }).catch(() => {})
  },

  updateTicketStatus: async (ticketId, newStatus, resolutionNotes, user) => {
    const authUser = user || getCurrentAuthUser()
    if (!authUser) throw new Error('Usuario no autenticado')

    if (authUser.role === 'admin' || authUser.role === 'doctor') {
      throw new Error(`Acceso Denegado (RBAC): El rol ${authUser.role} no tiene autorización operativa para modificar el estado de tickets clínicos.`)
    }

    const state = useDeviceStore.getState()
    const targetTicket = state.alerts.find(a => a.id === ticketId || a.folio === ticketId)
    if (!targetTicket) throw new Error('Ticket no encontrado')

    if (!isNurseAuthorizedForTicket(targetTicket, authUser)) {
      throw new Error(`Acceso Denegado (RBAC): Solo el enfermero asignado (${targetTicket.assignedNurseName || 'Sin asignar'}) puede modificar el estado de este ticket.`)
    }

    if (newStatus === 'completado' && (!resolutionNotes || !resolutionNotes.trim())) {
      throw new Error('Para completar el ticket es obligatorio registrar una nota de resolución describiendo las acciones realizadas.')
    }

    const now = Date.now()
    const authorName = authUser.fullName || authUser.username || 'Enfermero'
    const isCompleted = newStatus === 'completado'

    const notesToAdd: TicketNote[] = []
    if (isCompleted && resolutionNotes?.trim()) {
      notesToAdd.push({
        id: `not-${now}-${Math.random().toString(36).slice(2, 6)}`,
        ticketId: targetTicket.id,
        userId: authUser.id,
        userName: authorName,
        userRole: 'nurse',
        text: resolutionNotes.trim(),
        type: 'resolucion',
        createdAt: now,
      })
    }

    const newActivity: TicketActivity = {
      id: `act-${now}-${Math.random().toString(36).slice(2, 6)}`,
      ticketId: targetTicket.id,
      action: isCompleted ? 'COMPLETADO' : newStatus === 'en_progreso' ? 'EN_PROGRESO' : 'CREADO',
      description: isCompleted
        ? `Ticket completado y resuelto por ${authorName}.`
        : newStatus === 'en_progreso'
        ? `Atención comenzada por ${authorName}.`
        : `Estado de ticket cambiado a ${newStatus}.`,
      performedBy: authorName,
      performedByRole: 'nurse',
      timestamp: now,
    }

    const trackingItem: AlertTracking = {
      id: `trk-${now}-${Math.random().toString(36).slice(2, 6)}`,
      alertId: targetTicket.id,
      userId: authUser.id,
      userName: authorName,
      userRole: 'nurse',
      statusChangedTo: isCompleted ? 'ATENDIDA' : 'EN_ATENCION',
      actionNotes: resolutionNotes?.trim() || (isCompleted ? 'Atención y resolución confirmada en el turno.' : 'Atención iniciada.'),
      createdAt: now,
    }

    if (isCompleted) {
      patientsService.acknowledgeAlert(targetTicket.id).catch(() => {})
    }

    set(s => {
      const updateAlert = (a: Alert): Alert => {
        if (a.id === targetTicket.id) {
          return {
            ...a,
            status: newStatus,
            currentStatus: isCompleted ? ('ATENDIDA' as const) : ('EN_ATENCION' as const),
            acknowledged: isCompleted ? true : a.acknowledged,
            attendedBy: isCompleted ? authorName : a.attendedBy,
            attendedAt: isCompleted ? now : a.attendedAt,
            completedBy: isCompleted ? authorName : a.completedBy,
            completedAt: isCompleted ? now : a.completedAt,
            resolutionNotes: isCompleted ? resolutionNotes?.trim() : a.resolutionNotes,
            notes: [...(a.notes || []), ...notesToAdd],
            activityLog: [...(a.activityLog || []), newActivity],
            trackingHistory: [...(a.trackingHistory || []), trackingItem],
          }
        }
        return a
      }

      const updatedAlerts = s.alerts.map(updateAlert)
      const updatedDevices = { ...s.devices }
      for (const dId in updatedDevices) {
        updatedDevices[dId] = {
          ...updatedDevices[dId],
          alerts: updatedDevices[dId].alerts.map(updateAlert),
        }
      }
      savePersistedAlerts(updatedAlerts)
      return { alerts: updatedAlerts, devices: updatedDevices }
    })

    logAuditEvent({
      userId: authUser.id,
      userEmail: authUser.email,
      userRole: authUser.role,
      userName: authUser.fullName,
      action: 'ATTEND_ALERT',
      entityType: 'ticket',
      entityId: targetTicket.id,
      details: `Ticket ${targetTicket.folio || targetTicket.id} actualizado a estado '${newStatus}'. ${resolutionNotes ? `Resolución: ${resolutionNotes.slice(0, 100)}` : ''}`,
    }).catch(() => {})
  },

  transferTicket: async (ticketId, toNurseId, toNurseName, toShiftType, reason, user) => {
    const authUser = user || getCurrentAuthUser()
    if (!authUser) throw new Error('Usuario no autenticado')

    if (authUser.role === 'admin' || authUser.role === 'doctor') {
      throw new Error(`Acceso Denegado (RBAC): El rol ${authUser.role} no tiene autorización operativa para transferir tickets clínicos.`)
    }

    const state = useDeviceStore.getState()
    const targetTicket = state.alerts.find(a => a.id === ticketId || a.folio === ticketId)
    if (!targetTicket) throw new Error('Ticket no encontrado')

    if (!isNurseAuthorizedForTicket(targetTicket, authUser)) {
      throw new Error(`Acceso Denegado (RBAC): Solo el enfermero asignado (${targetTicket.assignedNurseName || 'Sin asignar'}) puede transferir este ticket.`)
    }

    // Regla 2: Restricción estricta de asignación para alertas generadas por el pulsador de emergencia PBS-33B
    const isEmergency = targetTicket.type === 'emergency_button' || targetTicket.origin === 'EMERGENCY_BUTTON'
    if (isEmergency) {
      // 1. Validar que toNurseId sea un enfermero activo registrado (NO doctor, NO admin)
      const targetUser = getSystemUsers().find(u => u.id === toNurseId)
      if (!targetUser || targetUser.role !== 'nurse' || !targetUser.isActive) {
        throw new Error('Restricción de Asignación: Las alertas generadas por el pulsador de emergencia PBS-33B únicamente pueden asignarse a enfermeros registrados y activos. No se permiten doctores ni administradores como responsables.')
      }
      // 2. Comprobar que el enfermero tenga asignación asistencial activa con el paciente para el turno destino
      const hasPsa = getAllPatientShiftAssignments().some(
        a => (a.patientDeviceId === targetTicket.deviceId || a.patientDeviceId === targetTicket.patientId) &&
             a.shiftType === toShiftType &&
             a.nurseId === toNurseId &&
             a.active
      )
      if (!hasPsa) {
        throw new Error(`Asignación no autorizada: El enfermero '${toNurseName}' no tiene asignación asistencial activa con este paciente para el turno ${toShiftType}. Las alertas de emergencia del pulsador PBS-33B solo pueden transferirse a enfermeros formalmente relacionados con el paciente en dicho turno.`)
      }
    }

    if (!reason || !reason.trim()) {
      throw new Error('Debe proporcionar un motivo para la transferencia de turno.')
    }

    const now = Date.now()
    const authorName = authUser.fullName || authUser.username || 'Enfermero'
    const originalNurseId = targetTicket.originalNurseId || targetTicket.nurseId || authUser.id
    const originalNurseName = targetTicket.originalNurseName || targetTicket.assignedNurseName || authorName

    const transferRecord: TicketTransfer = {
      id: `trans-${now}-${Math.random().toString(36).slice(2, 6)}`,
      ticketId: targetTicket.id,
      fromNurseId: authUser.id,
      fromNurseName: authorName,
      toNurseId,
      toNurseName,
      toShiftType,
      reason: reason.trim(),
      createdAt: now,
    }

    const transferNote: TicketNote = {
      id: `not-${now}-${Math.random().toString(36).slice(2, 6)}`,
      ticketId: targetTicket.id,
      userId: authUser.id,
      userName: authorName,
      userRole: 'nurse',
      text: `Transferencia al turno ${toShiftType}: Entregado a ${toNurseName}. Motivo: ${reason.trim()}`,
      type: 'transferencia',
      createdAt: now,
    }

    const transferActivity: TicketActivity = {
      id: `act-${now}-${Math.random().toString(36).slice(2, 6)}`,
      ticketId: targetTicket.id,
      action: 'TRANSFERENCIA',
      description: `Ticket transferido a ${toNurseName} (turno ${toShiftType}). Motivo: ${reason.trim()}`,
      performedBy: authorName,
      performedByRole: 'nurse',
      timestamp: now,
    }

    set(s => {
      const updateAlert = (a: Alert): Alert => {
        if (a.id === targetTicket.id) {
          return {
            ...a,
            nurseId: toNurseId,
            assignedNurseName: toNurseName,
            assignedTo: toNurseName,
            shiftType: toShiftType,
            originalNurseId,
            originalNurseName,
            isUnassigned: false,
            transfers: [...(a.transfers || []), transferRecord],
            notes: [...(a.notes || []), transferNote],
            activityLog: [...(a.activityLog || []), transferActivity],
          }
        }
        return a
      }

      const updatedAlerts = s.alerts.map(updateAlert)
      const updatedDevices = { ...s.devices }
      for (const dId in updatedDevices) {
        updatedDevices[dId] = {
          ...updatedDevices[dId],
          alerts: updatedDevices[dId].alerts.map(updateAlert),
        }
      }
      savePersistedAlerts(updatedAlerts)
      return { alerts: updatedAlerts, devices: updatedDevices }
    })

    logAuditEvent({
      userId: authUser.id,
      userEmail: authUser.email,
      userRole: authUser.role,
      userName: authUser.fullName,
      action: 'ATTEND_ALERT',
      entityType: 'ticket_transfer',
      entityId: targetTicket.id,
      details: `Ticket ${targetTicket.folio || targetTicket.id} transferido de ${authorName} a ${toNurseName} (${toShiftType}). Motivo: ${reason.slice(0, 100)}`,
    }).catch(() => {})
  },

  clearAlerts: (_deviceId) => {
    // SEGURIDAD CLÍNICA: Las alertas y tickets son registros inmutables protegidos.
    // No se permite eliminar ni vaciar la lista de alertas/tickets para garantizar la trazabilidad médica.
    console.warn('[Store] Acción protegida: Las alertas y tickets clínicos son registros inmutables protegidos. No pueden eliminarse ni vaciarse de forma masiva sin el proceso formal de atención.')
  },

  removeDevice: async (deviceId) => {
    const authUser = getCurrentAuthUser()
    // RBAC: Únicamente el Administrador puede eliminar pacientes permanentemente
    if (authUser && authUser.role !== 'admin') {
      console.warn('[Store] Acceso denegado: Solo el Administrador puede eliminar pacientes.')
      throw new Error('Solo el Administrador tiene autorización para dar de baja definitiva a un paciente.')
    }

    try {
      await patientsService.deletePatient(deviceId)
    } catch (err) {
      console.error('[Store] Error eliminando paciente de la BD:', err)
    }

    if (authUser) {
      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: authUser.role,
        userName: authUser.fullName,
        action: 'DELETE_PATIENT',
        entityType: 'patient',
        entityId: deviceId,
        details: `Baja definitiva del paciente y brazalete ${deviceId}`
      }).catch(() => {})
    }

    const settingsMap = loadSettingsMap()
    delete settingsMap[deviceId]
    saveSettingsMap(settingsMap)

    // Detener y remover del simulador para que no siga generando telemetría en segundo plano
    try {
      simulatorService.stopDevice(deviceId)
      simulatorService.removeDevice(deviceId)
    } catch (e) {
      console.warn('[Store] Error al detener simulador de dispositivo eliminado:', e)
    }

    // Registrar en lista negra de eliminados para que no vuelva a auto-aparecer
    addDeletedDevice(deviceId)

    set((state) => {
      const { [deviceId]: _, ...rest } = state.devices
      return {
        devices: rest,
        alerts: state.alerts.filter(a => a.deviceId !== deviceId),
      }
    })
  },

  updateDeviceProfile: async (deviceId, prof) => {
    const { devices } = useDeviceStore.getState()
    const device = devices[deviceId]
    if (!device) return

    const authUser = getCurrentAuthUser()
    const oldProf = device.profile || createDefaultProfile(device.patientName)
    let safeProf: UserProfile

    if (authUser?.role === 'nurse') {
      // RBAC: El enfermero únicamente puede actualizar peso y estatura autorizados (somatometría)
      safeProf = {
        ...oldProf,
        weight: prof.weight !== undefined ? prof.weight : oldProf.weight,
        height: prof.height !== undefined ? prof.height : oldProf.height,
      }

      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: 'nurse',
        userName: authUser.fullName,
        action: 'UPDATE_VITALS',
        entityType: 'patient',
        entityId: deviceId,
        details: `Actualización de somatometría autorizada: Peso: ${safeProf.weight}, Estatura: ${safeProf.height}`,
        changes: {
          weight: { oldVal: oldProf.weight, newVal: safeProf.weight },
          height: { oldVal: oldProf.height, newVal: safeProf.height },
        }
      }).catch(() => {})

    } else if (authUser?.role === 'doctor') {
      // RBAC: El Doctor puede consultar toda la información del paciente, pero NO puede modificar:
      // - Datos fisiológicos y personales: nombre, edad, género, peso, estatura, teléfono
      // - Contacto de emergencia: nombre y teléfono
      // - Ubicación: cuarto y piso
      // - Enfermero asignado
      // La ÚNICA información de la ficha que el doctor puede editar son las notas clínicas.
      safeProf = {
        ...oldProf,
        medicalNotes: prof.medicalNotes !== undefined ? prof.medicalNotes : oldProf.medicalNotes,
      }

      if (authUser) {
        logAuditEvent({
          userId: authUser.id,
          userEmail: authUser.email,
          userRole: 'doctor',
          userName: authUser.fullName,
          action: 'UPDATE_PROFILE',
          entityType: 'patient',
          entityId: deviceId,
          details: `Actualización médica de notas clínicas del paciente ${safeProf.name}`
        }).catch(() => {})
      }

    } else if (authUser?.role === 'admin') {
      // RBAC: El Administrador puede editar datos personales, de contacto y ubicación.
      // NO PUEDE modificar datos clínicos como peso y estatura.
      safeProf = {
        ...oldProf,
        ...prof,
        weight: oldProf.weight, // Protegido contra modificación por admin
        height: oldProf.height, // Protegido contra modificación por admin
      }

      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: 'admin',
        userName: authUser.fullName,
        action: 'UPDATE_PROFILE',
        entityType: 'patient',
        entityId: deviceId,
        details: `Actualización administrativa de paciente ${safeProf.name}`
      }).catch(() => {})

    } else {
      safeProf = {
        ...oldProf,
        ...prof,
      }
    }

    const updatedConfig = device.config || DEFAULT_CONFIG

    try {
      await patientsService.savePatient(deviceId, safeProf, updatedConfig)
    } catch (err) {
      console.error('[Store] Error guardando perfil en la BD:', err)
    }

    // Copia local de respaldo
    const settingsMap = loadSettingsMap()
    settingsMap[deviceId] = {
      profile: safeProf,
      config: updatedConfig
    }
    saveSettingsMap(settingsMap)

    // Actualizar en el estado de memoria
    set((state) => {
      const updatedDevices = { ...state.devices }
      if (updatedDevices[deviceId]) {
        updatedDevices[deviceId] = {
          ...updatedDevices[deviceId],
          patientName: safeProf.name,
          profile: safeProf
        }
      }
      return { devices: updatedDevices }
    })
  },

  updateDeviceConfig: async (deviceId, cfg) => {
    const { devices } = useDeviceStore.getState()
    const device = devices[deviceId]
    if (!device) return

    const authUser = getCurrentAuthUser()
    // RBAC: ÚNICAMENTE el Doctor puede calibrar o modificar los umbrales clínicos
    if (authUser && authUser.role !== 'doctor') {
      console.warn('[Store] Acceso denegado: Únicamente el médico especialista (Doctor) puede modificar los umbrales clínicos de alerta.')
      throw new Error('Solo el Doctor tiene autorización para modificar los umbrales clínicos de alerta.')
    }

    const updatedProfile = {
      ...(device.profile || createDefaultProfile(device.patientName || deviceId)),
      hasThresholdsConfigured: true,
    }
    const updatedConfig = { ...device.config!, ...cfg }

    try {
      await patientsService.savePatient(deviceId, updatedProfile, updatedConfig)
    } catch (err) {
      console.error('[Store] Error guardando configuración en la BD:', err)
    }

    if (authUser) {
      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: 'doctor',
        userName: authUser.fullName,
        action: 'UPDATE_THRESHOLDS',
        entityType: 'thresholds',
        entityId: deviceId,
        details: `Ajuste de umbrales clínicos: FC [${updatedConfig.hrMin} - ${updatedConfig.hrMax}] BPM, Temp máx ${updatedConfig.tempMax}°C, Notificaciones: ${updatedConfig.notificationsActive ? 'Activas' : 'Silenciadas'}`
      }).catch(() => {})
    }

    // Copia local de respaldo
    const settingsMap = loadSettingsMap()
    settingsMap[deviceId] = {
      profile: updatedProfile,
      config: updatedConfig
    }
    saveSettingsMap(settingsMap)

    // Actualizar en el estado de memoria y atender la alerta de calibración pendiente si existía
    set((state) => {
      const updatedDevices = { ...state.devices }
      if (updatedDevices[deviceId]) {
        updatedDevices[deviceId] = {
          ...updatedDevices[deviceId],
          config: updatedConfig,
          profile: updatedProfile,
        }
      }
      const updatedAlerts = state.alerts.map(a =>
        a.deviceId === deviceId && a.type === 'threshold_pending'
          ? { ...a, acknowledged: true, currentStatus: 'ATENDIDA' as const, status: 'attended' as const }
          : a
      )
      return { devices: updatedDevices, alerts: updatedAlerts }
    })
  },

  assignPatientToNurse: async (deviceId, nurseId, nurseName, roomNumber, floor) => {
    const { devices } = useDeviceStore.getState()
    const device = devices[deviceId]
    if (!device) return

    const authUser = getCurrentAuthUser()
    // RBAC: ÚNICAMENTE el Administrador puede gestionar habitaciones, pisos y asignación de enfermeros
    if (authUser && authUser.role !== 'admin') {
      console.warn('[Store] Acceso denegado: Solo el Administrador puede gestionar habitaciones y enfermeros responsables.')
      throw new Error('Solo el Administrador puede gestionar habitaciones, pisos y enfermeros responsables.')
    }

    const currentRoom = roomNumber !== undefined ? roomNumber.trim() : (device.profile?.roomNumber || 'Hab. 101')
    const currentFloor = floor !== undefined ? floor.trim() : (device.profile?.floor || 'Piso 1')

    const updatedProfile: UserProfile = {
      ...(device.profile || createDefaultProfile(device.patientName)),
      roomNumber: currentRoom,
      floor: currentFloor,
      assignedNurseId: nurseId || undefined,
      assignedNurseName: nurseName || undefined,
    }
    const updatedConfig = device.config || DEFAULT_CONFIG

    try {
      await patientsService.savePatient(deviceId, updatedProfile, updatedConfig)
    } catch (err) {
      console.error('[Store] Error guardando asignación en la BD:', err)
    }

    if (authUser) {
      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: 'admin',
        userName: authUser.fullName,
        action: 'ASSIGN_NURSE',
        entityType: 'patient',
        entityId: deviceId,
        details: `Asignación administrativa de paciente ${device.patientName} a ${nurseName || 'Sin asignar'} (${currentRoom}, ${currentFloor})`
      }).catch(() => {})
    }

    // Guardar en copia local de respaldo
    const settingsMap = loadSettingsMap()
    settingsMap[deviceId] = {
      profile: updatedProfile,
      config: updatedConfig,
    }
    saveSettingsMap(settingsMap)

    // Actualizar estado de memoria
    set((state) => {
      const updatedDevices = { ...state.devices }
      if (updatedDevices[deviceId]) {
        updatedDevices[deviceId] = {
          ...updatedDevices[deviceId],
          profile: updatedProfile,
        }
      }
      // Actualizar automáticamente el responsable en las alertas activas de este paciente (excepto botón de emergencia PBS-33B)
      const updatedAlerts = state.alerts.map(a =>
        a.deviceId === deviceId && !a.acknowledged && a.type !== 'emergency_button' && a.origin !== 'EMERGENCY_BUTTON'
          ? { ...a, assignedTo: nurseName || undefined }
          : a
      )
      return { devices: updatedDevices, alerts: updatedAlerts }
    })
  },

  registerPatient: async (deviceId, profile, config) => {
    const authUser = getCurrentAuthUser()
    // RBAC: ÚNICAMENTE el Administrador tiene autorización para registrar y dar de alta pacientes
    if (authUser && authUser.role !== 'admin') {
      console.warn('[Store] Acceso denegado: Solo el Administrador puede registrar nuevos pacientes.')
      throw new Error('Solo el Administrador tiene autorización para registrar y dar de alta a un paciente.')
    }

    // Si el identificador fue eliminado anteriormente, retirarlo de la lista negra
    removeDeletedDevice(deviceId)

    const patientName = profile.name?.trim() || 'Paciente Nuevo'
    const isAdmin = authUser?.role === 'admin'
    const hasSpecificNurse = Boolean(profile.assignedNurseId && profile.assignedNurseName)
    const effectiveNurseName = hasSpecificNurse ? profile.assignedNurseName : 'Enfermería General'

    const fullProfile: UserProfile = {
      id: `p-${Date.now()}`,
      name: patientName,
      age: profile.age?.trim() || '70',
      gender: profile.gender || 'Hombre',
      weight: profile.weight?.trim() || '—',
      height: profile.height?.trim() || '—',
      phone: profile.phone?.trim() || '',
      emergencyContactName: profile.emergencyContactName?.trim() || '',
      emergencyContactPhone: profile.emergencyContactPhone?.trim() || '',
      emergencyContact: profile.emergencyContactName 
        ? `${profile.emergencyContactName} (${profile.emergencyContactPhone || ''})`
        : '',
      roomNumber: profile.roomNumber?.trim() || 'Hab. 101',
      floor: profile.floor?.trim() || 'Piso 1',
      assignedNurseId: hasSpecificNurse ? profile.assignedNurseId : undefined,
      assignedNurseName: effectiveNurseName,
      medicalNotes: profile.medicalNotes?.trim() || '',
      isActive: true,
      isArchived: false,
      hasThresholdsConfigured: !isAdmin, // Si lo crea el admin, queda pendiente de calibración por el doctor
    }

    const fullConfig: AlertConfig = {
      ...DEFAULT_CONFIG,
      ...config,
    }

    // Alerta clínica si lo creó el admin: notificar al enfermero asignado o a Enfermería General
    const newAlerts: Alert[] = []
    if (isAdmin) {
      const alertMsg = hasSpecificNurse
        ? `Calibración pendiente: El Dr. debe configurar los umbrales clínicos de alerta para ${patientName}.`
        : `Calibración pendiente: El Dr. debe configurar los umbrales clínicos de alerta para ${patientName} (Sin enfermero individual asignado — Asignado a guardia de Enfermería General).`

      const pendingThresholdAlert: Alert = {
        id: `alert-thresh-${Date.now()}`,
        deviceId,
        patientId: fullProfile.id,
        type: 'threshold_pending',
        criticality: 'MEDIA',
        message: alertMsg,
        timestamp: Date.now(),
        acknowledged: false,
        status: 'pending',
        currentStatus: 'PENDIENTE',
        assignedTo: effectiveNurseName,
      }
      newAlerts.push(pendingThresholdAlert)
      patientsService.saveAlert(pendingThresholdAlert).catch(() => {})
    }

    try {
      await patientsService.savePatient(deviceId, fullProfile, fullConfig)
    } catch (err) {
      console.error('[Store] Error registrando paciente en la BD:', err)
    }

    if (authUser) {
      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: authUser.role,
        userName: authUser.fullName,
        action: 'REGISTER_PATIENT',
        entityType: 'patient',
        entityId: deviceId,
        details: `Alta y registro de nuevo paciente ${patientName} con brazalete ${deviceId} por ${authUser.fullName || authUser.email}`
      }).catch(() => {})
    }

    const settingsMap = loadSettingsMap()
    settingsMap[deviceId] = {
      profile: fullProfile,
      config: fullConfig,
    }
    saveSettingsMap(settingsMap)

    const newDevice: DeviceState = {
      deviceId,
      patientName,
      connected: false,
      lastSeen: Date.now(),
      latest: null,
      history: [],
      alerts: newAlerts,
      profile: fullProfile,
      config: fullConfig,
      isArchived: false,
      braceletStatus: 'ASIGNADO',
    }

    set((state) => ({
      devices: { ...state.devices, [deviceId]: newDevice },
      alerts: [...state.alerts, ...newAlerts],
    }))
  },

  archivePatient: async (deviceId, reason) => {
    const authUser = getCurrentAuthUser()
    if (authUser && authUser.role !== 'admin') {
      console.warn('[Store] Acceso denegado: Solo el Administrador puede archivar pacientes.')
      throw new Error('Solo el Administrador tiene autorización para archivar pacientes.')
    }

    const { devices } = useDeviceStore.getState()
    const device = devices[deviceId]
    if (!device) return

    const updatedProfile: UserProfile = {
      ...(device.profile || createDefaultProfile(device.patientName)),
      isArchived: true,
      isActive: false,
      archivedAt: Date.now(),
      archivedBy: authUser?.fullName || 'Administrador',
      archivedByUserId: authUser?.id || '',
      archivedReason: reason || 'Baja asistencial / Archivo por administración',
    }

    try {
      await patientsService.archivePatient(deviceId, reason, authUser?.fullName || 'Administrador')
      await patientsService.savePatient(deviceId, updatedProfile, device.config || DEFAULT_CONFIG)
    } catch (err) {
      console.error('[Store] Error archivando paciente en la BD:', err)
    }

    if (authUser) {
      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: 'admin',
        userName: authUser.fullName,
        action: 'ARCHIVE_PATIENT',
        entityType: 'patient',
        entityId: deviceId,
        details: `Paciente ${device.patientName} archivado por administrador. El brazalete ${deviceId} queda registrado como NO EN USO (disponible). Motivo: ${reason || 'Baja asistencial'}`
      }).catch(() => {})
    }

    const settingsMap = loadSettingsMap()
    settingsMap[deviceId] = {
      profile: updatedProfile,
      config: device.config || DEFAULT_CONFIG,
    }
    saveSettingsMap(settingsMap)

    // Paciente archivado: apagar simulación del sensor para que no siga generando telemetría
    try {
      simulatorService.stopDevice(deviceId)
    } catch (e) {
      console.warn('[Store] Error al detener simulador de dispositivo archivado:', e)
    }

    set((state) => {
      const updatedDevices = { ...state.devices }
      if (updatedDevices[deviceId]) {
        updatedDevices[deviceId] = {
          ...updatedDevices[deviceId],
          isArchived: true,
          connected: false,
          braceletStatus: 'NO_EN_USO',
          profile: updatedProfile,
        }
      }
      return { devices: updatedDevices }
    })
  },

  unarchivePatient: async (deviceId) => {
    const authUser = getCurrentAuthUser()
    if (authUser && authUser.role !== 'admin') {
      throw new Error('Solo el Administrador tiene autorización para reactivar pacientes.')
    }

    const { devices } = useDeviceStore.getState()
    const device = devices[deviceId]
    if (!device) return

    const updatedProfile: UserProfile = {
      ...(device.profile || createDefaultProfile(device.patientName)),
      isArchived: false,
      isActive: true,
    }

    try {
      await patientsService.unarchivePatient(deviceId)
      await patientsService.savePatient(deviceId, updatedProfile, device.config || DEFAULT_CONFIG)
    } catch (err) {
      console.error('[Store] Error reactivando paciente en la BD:', err)
    }

    if (authUser) {
      logAuditEvent({
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: 'admin',
        userName: authUser.fullName,
        action: 'UNARCHIVE_PATIENT',
        entityType: 'patient',
        entityId: deviceId,
        details: `Paciente ${device.patientName} reactivado por administrador. El brazalete ${deviceId} vuelve a estar en uso activo.`
      }).catch(() => {})
    }

    const settingsMap = loadSettingsMap()
    settingsMap[deviceId] = {
      profile: updatedProfile,
      config: device.config || DEFAULT_CONFIG,
    }
    saveSettingsMap(settingsMap)

    set((state) => {
      const updatedDevices = { ...state.devices }
      if (updatedDevices[deviceId]) {
        updatedDevices[deviceId] = {
          ...updatedDevices[deviceId],
          isArchived: false,
          braceletStatus: 'ASIGNADO',
          profile: updatedProfile,
        }
      }
      return { devices: updatedDevices }
    })
  },

  setGlobalTheme: (theme) => {
    set(() => {
      try {
        localStorage.setItem('healthnet_global_theme', theme)
      } catch (e) {
        console.error(e)
      }
      return { theme }
    })
  },

  toggleSidebarCollapse: () => {
    set((state) => {
      const next = !state.sidebarCollapsed
      try {
        localStorage.setItem('healthnet_sidebar_collapsed', String(next))
      } catch (e) {
        console.error(e)
      }
      return { sidebarCollapsed: next }
    })
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    try {
      localStorage.setItem('healthnet_sidebar_collapsed', String(collapsed))
    } catch (e) {
      console.error(e)
    }
    set({ sidebarCollapsed: collapsed })
  },

  toggleSidebar: () => {
    set((state) => {
      const next = !state.sidebarVisible
      try {
        localStorage.setItem('healthnet_sidebar_visible', String(next))
      } catch (e) {
        console.error(e)
      }
      return { sidebarVisible: next }
    })
  },

  setSidebarVisible: (visible: boolean) => {
    try {
      localStorage.setItem('healthnet_sidebar_visible', String(visible))
    } catch (e) {
      console.error(e)
    }
    set({ sidebarVisible: visible })
  }
}))

setDeviceStoreRef(() => useDeviceStore.getState())
if (typeof window !== 'undefined') {
  (window as any).__deviceStore = useDeviceStore
}
