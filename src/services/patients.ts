import { AWS_CONFIG, isApiConfigured } from '../config/aws'
import type { UserProfile, AlertConfig, Alert } from '../types'

export interface ApiPatient {
  id?: string
  device_id: string
  name: string
  full_name?: string
  age?: string
  gender?: string
  weight?: string
  height?: string
  phone?: string
  contact_name?: string
  contact_phone?: string
  emergency_contact?: string
  room_number?: string
  floor?: string
  bed_number?: string
  bedNumber?: string
  assigned_nurse_id?: string
  assigned_nurse_name?: string
  medical_notes?: string
  hr_min: number
  hr_max: number
  temp_max: string | number
  notifications_active: boolean
  watch_theme: 'light' | 'dark'
  bracelet_status?: 'DISPONIBLE' | 'ASIGNADO' | 'MANTENIMIENTO' | 'NO_EN_USO'
  is_active?: boolean
  is_archived?: boolean
  archived_at?: string | number
  archived_by?: string
  archived_reason?: string
}

export interface PatientData {
  deviceId: string
  patientId?: string
  patientName: string
  profile: UserProfile
  config: AlertConfig
}

/**
 * Convierte un registro de la base de datos (API) al formato interno del frontend
 */
export function mapDbPatientToState(dbPatient: ApiPatient): PatientData {
  const patientName = dbPatient.full_name || dbPatient.name || 'Paciente'
  const contactName = dbPatient.contact_name || dbPatient.emergency_contact || 'Familiar Responsable'
  const contactPhone = dbPatient.contact_phone || dbPatient.phone || '—'
  const isArchived = Boolean(dbPatient.is_archived || dbPatient.is_active === false)
  const archivedAt = dbPatient.archived_at ? (typeof dbPatient.archived_at === 'number' ? dbPatient.archived_at : new Date(dbPatient.archived_at).getTime()) : undefined

  return {
    deviceId: dbPatient.device_id,
    patientId: dbPatient.id,
    patientName,
    profile: {
      id: dbPatient.id,
      name: patientName,
      age: dbPatient.age || '65',
      gender: dbPatient.gender === 'Mujer' ? 'Mujer' : 'Hombre',
      weight: dbPatient.weight || '',
      height: dbPatient.height || '',
      phone: dbPatient.phone || '',
      emergencyContactName: contactName,
      emergencyContactPhone: contactPhone,
      emergencyContact: `${contactName} (${contactPhone})`,
      roomNumber: dbPatient.room_number || 'Hab. 101',
      floor: dbPatient.floor || 'Piso 1',
      bedNumber: dbPatient.bed_number || dbPatient.bedNumber || 'Cama 1',
      assignedNurseId: dbPatient.assigned_nurse_id,
      assignedNurseName: dbPatient.assigned_nurse_name,
      medicalNotes: dbPatient.medical_notes || '',
      isActive: !isArchived,
      isArchived,
      archivedAt,
      archivedBy: dbPatient.archived_by,
      archivedReason: dbPatient.archived_reason,
    },
    config: {
      hrMin: dbPatient.hr_min || 50,
      hrMax: dbPatient.hr_max || 110,
      tempMax: typeof dbPatient.temp_max === 'string' ? parseFloat(dbPatient.temp_max) : (dbPatient.temp_max || 38.0),
      notificationsActive: dbPatient.notifications_active !== undefined ? dbPatient.notifications_active : true,
      theme: 'light',
      watchTheme: dbPatient.watch_theme || 'dark',
    }
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  try {
    const raw = localStorage.getItem('healthnet_current_user')
    if (raw) {
      const user = JSON.parse(raw)
      if (user.role) headers['X-User-Role'] = user.role
      if (user.id) headers['X-User-Id'] = user.id
      if (user.email) headers['X-User-Email'] = user.email
    }
  } catch {}
  return headers
}

class PatientsService {
  /**
   * Obtiene la lista de todos los pacientes guardados en la BD
   */
  async getPatients(): Promise<PatientData[]> {
    if (!isApiConfigured()) {
      return [] // En modo demo/local no intentamos descargar
    }

    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/patients`, {
        method: 'GET',
        headers: getAuthHeaders()
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: ApiPatient[] = await response.json()
      return data.map(mapDbPatientToState)
    } catch (err) {
      console.error('[PatientsService] Error obteniendo pacientes de la base de datos:', err)
      throw err
    }
  }

  /**
   * Guarda o actualiza un paciente (perfil y configuración) en la BD
   */
  async savePatient(
    deviceId: string,
    profile: UserProfile,
    config: AlertConfig
  ): Promise<PatientData> {
    if (!isApiConfigured()) {
      return { deviceId, patientName: profile.name, profile, config }
    }

    try {
      const payload = {
        deviceId,
        id: profile.id,
        name: profile.name,
        full_name: profile.name,
        age: profile.age,
        gender: profile.gender === 'Mujer' ? 'Mujer' : 'Hombre',
        weight: profile.weight,
        height: profile.height,
        phone: profile.phone,
        contact_name: profile.emergencyContactName || profile.emergencyContact,
        contact_phone: profile.emergencyContactPhone,
        emergencyContact: profile.emergencyContactName ? `${profile.emergencyContactName} (${profile.emergencyContactPhone || ''})` : profile.emergencyContact,
        roomNumber: profile.roomNumber,
        room_number: profile.roomNumber,
        floor: profile.floor,
        bedNumber: profile.bedNumber,
        bed_number: profile.bedNumber,
        assigned_nurse_id: profile.assignedNurseId,
        assigned_nurse_name: profile.assignedNurseName,
        medicalNotes: profile.medicalNotes,
        isArchived: profile.isArchived ?? false,
        is_archived: profile.isArchived ?? false,
        isActive: profile.isArchived ? false : (profile.isActive ?? true),
        is_active: profile.isArchived ? false : (profile.isActive ?? true),
        archivedAt: profile.archivedAt ? new Date(profile.archivedAt).toISOString() : null,
        archived_at: profile.archivedAt ? new Date(profile.archivedAt).toISOString() : null,
        archivedBy: profile.archivedBy || null,
        archived_by: profile.archivedBy || null,
        archivedReason: profile.archivedReason || null,
        archived_reason: profile.archivedReason || null,
        hrMin: config.hrMin,
        hrMax: config.hrMax,
        tempMax: config.tempMax,
        notificationsActive: config.notificationsActive,
        watchTheme: config.watchTheme
      }

      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/patients`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }

      const data: ApiPatient = await response.json()
      return mapDbPatientToState(data)
    } catch (err) {
      console.error(`[PatientsService] Error guardando paciente para ${deviceId}:`, err)
      throw err
    }
  }

  /**
   * Elimina un paciente de la base de datos
   */
  async deletePatient(deviceId: string): Promise<void> {
    if (!isApiConfigured()) return

    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/patients/${deviceId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }
    } catch (err) {
      console.error(`[PatientsService] Error eliminando paciente ${deviceId}:`, err)
      throw err
    }
  }

  /**
   * Obtiene alertas almacenadas en la BD
   */
  async getAlerts(): Promise<Alert[]> {
    if (!isApiConfigured()) return []

    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/alerts`, {
        method: 'GET',
        headers: getAuthHeaders()
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data.map((a: any) => ({
        id: a.id,
        folio: a.folio || `TCK-${new Date(a.created_at || Date.now()).getFullYear()}-${String(a.id).slice(-4)}`,
        deviceId: a.device_id,
        patientId: a.patient_id,
        patientName: a.patient_name,
        roomNumber: a.room_number,
        floor: a.floor,
        type: a.type,
        title: a.title || a.message,
        description: a.description || a.message,
        criticality: a.criticality || (a.type === 'fall' ? 'CRITICA' : 'MEDIA'),
        clinicalValue: a.clinical_value,
        message: a.message,
        timestamp: Number(a.timestamp || (a.created_at ? new Date(a.created_at).getTime() : Date.now())),
        acknowledged: Boolean(a.acknowledged),
        status: a.status || (a.acknowledged ? 'completado' : 'recibido'),
        currentStatus: a.current_status || (a.acknowledged ? 'completado' : 'recibido'),
        assignedTo: a.assigned_to || a.assigned_nurse_name,
        assignedNurseName: a.assigned_nurse_name || a.assigned_to,
        nurseId: a.assigned_nurse_id || a.nurse_id,
        isUnassigned: Boolean(a.is_unassigned || (!a.assigned_to && !a.assigned_nurse_name)),
        originalNurseId: a.original_nurse_id,
        originalNurseName: a.original_nurse_name,
        shiftType: a.shift_type || 'matutino',
        notes: a.notes || [],
        transfers: a.transfers || [],
        activityLog: a.activity_log || [],
        resolutionNotes: a.resolution_notes,
      }))
    } catch (err) {
      console.error('[PatientsService] Error obteniendo alertas:', err)
      return []
    }
  }

  async saveAlert(alert: Alert): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const payload = {
        id: alert.id,
        deviceId: alert.deviceId,
        patientId: alert.patientId,
        type: alert.type,
        criticality: alert.criticality,
        message: alert.message,
        timestamp: alert.timestamp,
        acknowledged: alert.acknowledged,
        currentStatus: alert.currentStatus
      }
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    } catch (err) {
      console.error('[PatientsService] Error guardando alerta:', err)
    }
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders()
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    } catch (err) {
      console.error(`[PatientsService] Error reconociendo alerta ${alertId}:`, err)
    }
  }

  async addTicketNote(ticketId: string, noteText: string, noteType: string = 'general'): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/tickets/${ticketId}/notes`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ text: noteText, type: noteType })
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    } catch (err) {
      console.error('[PatientsService] Error agregando nota al ticket:', err)
    }
  }

  async updateTicketStatus(ticketId: string, status: string, resolutionNotes?: string): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, resolutionNotes })
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    } catch (err) {
      console.error('[PatientsService] Error actualizando estado de ticket:', err)
    }
  }

  async transferTicket(ticketId: string, payload: { toNurseId: string; toNurseName: string; toShiftType: string; reason: string }): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/tickets/${ticketId}/transfer`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    } catch (err) {
      console.error('[PatientsService] Error transfiriendo ticket:', err)
    }
  }

  async clearAlerts(deviceId?: string): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const url = deviceId 
        ? `${AWS_CONFIG.apiEndpoint}/alerts/${deviceId}`
        : `${AWS_CONFIG.apiEndpoint}/alerts`
        
      const response = await fetch(url, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    } catch (err) {
      console.error('[PatientsService] Error borrando alertas:', err)
    }
  }

  /**
   * Archiva un paciente en el backend cloud preservando su expediente
   */
  async archivePatient(deviceId: string, reason?: string, archivedBy?: string): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/patients/${deviceId}/archive`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason, archivedBy })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }
    } catch (err) {
      console.error(`[PatientsService] Error archivando paciente ${deviceId}:`, err)
      throw err
    }
  }

  /**
   * Reactiva un paciente archivado en el backend cloud
   */
  async unarchivePatient(deviceId: string): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/patients/${deviceId}/unarchive`, {
        method: 'PUT',
        headers: getAuthHeaders()
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }
    } catch (err) {
      console.error(`[PatientsService] Error reactivando paciente ${deviceId}:`, err)
      throw err
    }
  }

  /**
   * Actualiza el estado de una cuenta de usuario (suspensión / reactivación)
   */
  async updateUserStatus(userId: string, isActive: boolean, reason?: string, suspendedBy?: string): Promise<void> {
    if (!isApiConfigured()) return
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          is_active: isActive,
          suspended_reason: reason,
          suspended_by: suspendedBy
        })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
      }
    } catch (err) {
      console.error(`[PatientsService] Error actualizando estado de usuario ${userId}:`, err)
      throw err
    }
  }
}

export const patientsService = new PatientsService()
