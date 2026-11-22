/**
 * simulatorService — gestiona N dispositivos ESP32 virtuales.
 * Cada dispositivo genera telemetría aleatoria y la publica via iotService
 * (en modo demo va directo al store; con AWS va por MQTT real).
 */
import { iotService } from './iot'
import { patientsService } from './patients'
import { useDeviceStore } from '../store/deviceStore'
import type { SimulatedDevice, DeviceTelemetry } from '../types'

// ── Generadores de datos aleatorios ──────────────────────────────────
function randomBetween(min: number, max: number, decimals = 0): number {
  const val = Math.random() * (max - min) + min
  return parseFloat(val.toFixed(decimals))
}

function generateTelemetry(device: SimulatedDevice, forceFall = false): DeviceTelemetry {
  const fallRoll = Math.random()
  const fallDetected = forceFall || fallRoll < 0.02 // 2% de probabilidad

  // Simulamos ligera variación continua
  const hr   = randomBetween(52, 115)
  const temp = randomBetween(35.5, 39.2, 1)
  const az   = fallDetected ? randomBetween(15, 25, 2) : randomBetween(9.5, 10.1, 2)

  return {
    deviceId:     device.deviceId,
    patientName:  device.patientName,
    timestamp:    Date.now(),
    heartRate:    hr,
    temperature:  temp,
    fallDetected,
    batteryLevel: randomBetween(20, 100),
    accelerometer: {
      x: randomBetween(-2, 2, 2),
      y: randomBetween(-2, 2, 2),
      z: az,
    },
  }
}

// ── Clase principal ────────────────────────────────────────────────────
class SimulatorService {
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map()
  private devices: Map<string, SimulatedDevice> = new Map()

  addDevice(device: SimulatedDevice) {
    this.devices.set(device.deviceId, { ...device, running: false })
  }

  removeDevice(deviceId: string) {
    this.stopDevice(deviceId)
    this.devices.delete(deviceId)
  }

  startDevice(deviceId: string) {
    const device = this.devices.get(deviceId)
    if (!device || this.intervals.has(deviceId)) return

    device.running = true
    this.devices.set(deviceId, device)

    // Publica inmediatamente y luego en intervalo
    const publish = () => {
      const telemetry = generateTelemetry(device)
      iotService.publish(device.deviceId, telemetry)
    }
    publish()
    const id = setInterval(publish, device.intervalMs)
    this.intervals.set(deviceId, id)
  }

  stopDevice(deviceId: string) {
    const timer = this.intervals.get(deviceId)
    if (timer !== undefined) {
      clearInterval(timer)
      this.intervals.delete(deviceId)
    }
    const device = this.devices.get(deviceId)
    if (device) {
      device.running = false
      this.devices.set(deviceId, device)
    }
  }

  startAll() {
    this.devices.forEach((_, id) => this.startDevice(id))
  }

  stopAll() {
    this.devices.forEach((_, id) => this.stopDevice(id))
  }

  /** Envía una caída forzada a un dispositivo específico */
  triggerFall(deviceId: string) {
    const device = this.devices.get(deviceId)
    if (!device) return
    iotService.publish(device.deviceId, generateTelemetry(device, true))
  }

  /**
   * Dispara el evento del pulsador de emergencia físico/simulado PBS-33B.
   * Utiliza el mismo flujo de procesamiento del dispositivo físico:
   * 1. Publica en el tópico independiente 'healthnet/devices/{deviceId}/emergency' (solo deviceId y metadatos del evento).
   * 2. Envía el evento al backend para validación estricta de brazalete, paciente y asignación de enfermero.
   * 3. Si el brazalete no está registrado o no tiene paciente asociado, propaga el error clínico.
   */
  async triggerEmergencyButton(deviceId: string): Promise<any> {
    const eventId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ev-${Date.now()}`

    // 1. Publicación MQTT idéntica al firmware físico del ESP32 (sin datos arbitrarios del paciente)
    iotService.publishEmergency(deviceId, {
      deviceId,
      timestamp: Date.now(),
      emergencyButtonPressed: true,
      emergencyButton: {
        pressed: true,
        eventId,
      },
      eventId,
      eventType: 'EMERGENCY_BUTTON',
      batteryLevel: 100,
    })

    // 2. Procesamiento centralizado en backend
    try {
      const backendResult = await patientsService.triggerEmergency(deviceId, eventId)
      
      // Sincronizar alerta confirmada con el store de forma inmediata
      if (backendResult?.alert) {
        useDeviceStore.getState().addAlert(backendResult.alert)
      }

      // Sincronización en segundo plano con BD protegida contra fallos de red
      try {
        await useDeviceStore.getState().loadPatientsFromDb()
      } catch (syncErr) {
        console.warn('[SimulatorService] Sincronización en segundo plano con BD no disponible:', syncErr)
      }
      
      return backendResult
    } catch (err) {
      console.error(`[SimulatorService] Error al disparar emergencia para ${deviceId}:`, err)
      throw err
    }
  }

  getDevices(): SimulatedDevice[] {
    return Array.from(this.devices.values()).map(d => ({
      ...d,
      running: this.intervals.has(d.deviceId),
    }))
  }

  isRunning(deviceId: string): boolean {
    return this.intervals.has(deviceId)
  }
}

export const simulatorService = new SimulatorService()
