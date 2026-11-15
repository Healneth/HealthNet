import type { AuditLogEntry, UserRole } from '../types'
import { AWS_CONFIG, isApiConfigured } from '../config/aws'

const LOCAL_AUDIT_KEY = 'healthnet_audit_logs'

export function getAuditLogs(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY)
    if (raw) return JSON.parse(raw)
  } catch (err) {
    console.error('[AuditLogger] Error al leer logs de auditoría:', err)
  }
  return []
}

export async function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
  const fullEntry: AuditLogEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  }

  // 1. Guardar en almacenamiento local
  try {
    const existing = getAuditLogs()
    const updated = [fullEntry, ...existing].slice(0, 500) // Guardar las últimas 500 acciones
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('[AuditLogger] Error guardando log en localStorage:', err)
  }

  // 2. Enviar a la API si está configurada
  if (isApiConfigured()) {
    try {
      await fetch(`${AWS_CONFIG.apiEndpoint}/audit-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': entry.userRole,
          'X-User-Id': entry.userId,
        },
        body: JSON.stringify(fullEntry),
      })
    } catch (err) {
      // No bloquear la interfaz si la llamada remota falla
      console.warn('[AuditLogger] Advertencia enviando log a la API:', err)
    }
  }

  return fullEntry
}

