import { useState, useEffect, useCallback } from 'react'
import {
  PlusCircle, Play, Square, Zap, Trash2,
  Cpu, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Radio,
} from 'lucide-react'
import { simulatorService } from '../services/simulator'
import { useDeviceStore } from '../store/deviceStore'
import { useAuth } from '../hooks/useAuth'
import type { SimulatedDevice } from '../types'

const PATIENT_NAMES = [
  'Ana García', 'Carlos López', 'María Martínez', 'José Rodríguez',
  'Laura Hernández', 'Miguel González', 'Carmen Sánchez', 'Luis Torres',
  'Rosa Flores', 'Pedro Ramírez',
]

const DEFAULT_INTERVAL = 3000

function nextDeviceId(): string {
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `ESP32-${rand}`
}

interface DeviceRow {
  config: SimulatedDevice
  running: boolean
  packetsSent: number
}

export default function SimulatorPage() {
  const { user } = useAuth()
  const canDelete = user?.role === 'admin'
  const storeDevices = useDeviceStore(s => Object.values(s.devices))
  const removeDevice = useDeviceStore(s => s.removeDevice)

  const [rows, setRows]               = useState<DeviceRow[]>([])
  const [newName, setNewName]         = useState('')
  const [newInterval, setNewInterval] = useState(DEFAULT_INTERVAL)
  const [showConfig, setShowConfig]   = useState(false)
  const [ticker, setTicker]           = useState(0)
  const [feedback, setFeedback]       = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Sync running state every second
  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const syncRows = useCallback(() => {
    const svcDevices = simulatorService.getDevices()
    setRows(prev => {
      const packetsMap = new Map(prev.map(r => [r.config.deviceId, r.packetsSent]))
      return svcDevices.map(d => ({
        config: d,
        running: d.running,
        packetsSent: (packetsMap.get(d.deviceId) || 0) + (d.running ? 1 : 0)
      }))
    })
  }, [])

  // Sync database patients to simulator on mount/update (excluyendo archivados y eliminados)
  useEffect(() => {
    let changed = false
    const activeNonArchived = storeDevices.filter(d => !d.isArchived && d.profile?.isArchived !== true)

    // Detener y remover dispositivos que hayan sido archivados o dados de baja
    const currentSimDevices = simulatorService.getDevices()
    currentSimDevices.forEach(sd => {
      const isStillActive = activeNonArchived.some(d => d.deviceId === sd.deviceId)
      if (!isStillActive) {
        simulatorService.stopDevice(sd.deviceId)
        simulatorService.removeDevice(sd.deviceId)
        changed = true
      }
    })

    activeNonArchived.forEach(d => {
      if (!simulatorService.getDevices().some(sd => sd.deviceId === d.deviceId)) {
        simulatorService.addDevice({
          deviceId: d.deviceId,
          patientName: d.patientName,
          intervalMs: DEFAULT_INTERVAL,
          running: false
        })
        changed = true
      }
    })
    if (changed || ticker === 0) {
      syncRows()
    }
  }, [storeDevices, ticker, syncRows])

  useEffect(() => {
    if (ticker > 0) {
      syncRows()
    }
  }, [ticker, syncRows])

  const addDevice = () => {
    const name = newName.trim() || PATIENT_NAMES[rows.length % PATIENT_NAMES.length]
    const config: SimulatedDevice = {
      deviceId:    nextDeviceId(),
      patientName: name,
      intervalMs:  newInterval,
      running:     false,
    }
    simulatorService.addDevice(config)
    syncRows()
    setNewName('')
  }

  const addBatch = (n: number) => {
    for (let i = 0; i < n; i++) addDevice()
  }

  const toggleDevice = (deviceId: string, running: boolean) => {
    if (running) simulatorService.stopDevice(deviceId)
    else         simulatorService.startDevice(deviceId)
    setRows(prev => prev.map(r =>
      r.config.deviceId === deviceId ? { ...r, running: !running } : r
    ))
  }

  const deleteDevice = (deviceId: string) => {
    simulatorService.removeDevice(deviceId)
    removeDevice(deviceId)
    syncRows()
  }

  const triggerFall = (deviceId: string) => {
    simulatorService.triggerFall(deviceId)
  }

  const triggerEmergencyButton = async (deviceId: string) => {
    try {
      const res = await simulatorService.triggerEmergencyButton(deviceId)
      const nurseText = res?.assignedNurseName
        ? `Asignado: ${res.assignedNurseName} (${res.shiftType || 'Turno actual'}).`
        : `⚠️ Sin enfermero en turno (${res?.shiftType || 'actual'}) — Aviso prioritario a Supervisión emitido.`

      setFeedback({
        type: 'success',
        text: `¡Alerta de emergencia generada con éxito para ${deviceId}! (Folio: ${res?.folio || 'OK'}). ${nurseText}`
      })
      setTimeout(() => setFeedback(null), 6000)
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Error de Validación: ${err.message || 'No se pudo procesar el evento de emergencia.'}`
      })
      setTimeout(() => setFeedback(null), 8000)
    }
  }

  const startAll = () => {
    simulatorService.startAll()
    setRows(prev => prev.map(r => ({ ...r, running: true })))
  }

  const stopAll = () => {
    simulatorService.stopAll()
    setRows(prev => prev.map(r => ({ ...r, running: false })))
  }

  const runningCount = rows.filter(r => simulatorService.isRunning(r.config.deviceId)).length

  return (
    <div className="space-y-6 max-w-screen-lg mx-auto">
      {/* Notificación de retroalimentación de emergencias */}
      {feedback && (
        <div className={`mb-4 p-4 rounded-2xl flex items-center justify-between text-xs font-bold border transition-all ${
          feedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 shadow-sm shadow-emerald-500/10'
            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 shadow-sm shadow-rose-500/10'
        }`}>
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-black underline ml-3 opacity-70 hover:opacity-100 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-hn-800 dark:text-white">Simulador de Dispositivos</h1>
          <p className="text-sm text-hn-500 dark:text-slate-400 mt-0.5">
            Emula ESP32s enviando telemetría vía AWS IoT Core MQTT
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <>
              <button
                onClick={stopAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-hn-300 dark:border-slate-800 text-hn-700 dark:text-slate-200 text-sm hover:bg-hn-50 dark:hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
              >
                <Square size={13} />
                Detener todo
              </button>
              <button
                onClick={startAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-hn-800 hover:bg-hn-900 dark:bg-sky-600 dark:hover:bg-sky-500 text-white text-sm transition-colors shadow-sm cursor-pointer"
              >
                <Play size={13} />
                Iniciar todo
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-hn-200 dark:border-slate-800 px-4 py-3 text-center transition-colors">
          <p className="text-2xl font-extrabold text-hn-800 dark:text-white">{rows.length}</p>
          <p className="text-xs text-hn-500 dark:text-slate-400">Dispositivos creados</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-hn-200 dark:border-slate-800 px-4 py-3 text-center transition-colors">
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{runningCount}</p>
          <p className="text-xs text-hn-500 dark:text-slate-400">Enviando datos</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-hn-200 dark:border-slate-800 px-4 py-3 text-center transition-colors">
          <p className="text-2xl font-extrabold text-hn-700 dark:text-slate-300">{rows.length - runningCount}</p>
          <p className="text-xs text-hn-500 dark:text-slate-400">Detenidos</p>
        </div>
      </div>

      {/* Add device panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hn-200 dark:border-slate-800 shadow-sm mb-5 transition-colors">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-hn-50 dark:hover:bg-slate-800/60 rounded-2xl transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 text-hn-800 dark:text-white font-semibold">
            <PlusCircle size={18} className="text-hn-700 dark:text-sky-400" />
            Agregar dispositivo
          </div>
          {showConfig ? <ChevronUp size={16} className="text-hn-400 dark:text-slate-500" /> : <ChevronDown size={16} className="text-hn-400 dark:text-slate-500" />}
        </button>

        {showConfig && (
          <div className="px-5 pb-5 border-t border-hn-100 dark:border-slate-800 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-hn-600 dark:text-slate-300 mb-1">Nombre del paciente</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={`Ej: ${PATIENT_NAMES[rows.length % PATIENT_NAMES.length]}`}
                  className="w-full px-3 py-2.5 rounded-xl border border-hn-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-hn-800 dark:text-slate-100 placeholder:text-hn-300 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-hn-500 dark:focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-hn-600 dark:text-slate-300 mb-1">
                  Intervalo (ms)
                </label>
                <input
                  type="number"
                  value={newInterval}
                  onChange={e => setNewInterval(Math.max(500, Number(e.target.value)))}
                  min={500}
                  step={500}
                  className="w-full px-3 py-2.5 rounded-xl border border-hn-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-hn-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500 dark:focus:ring-sky-500"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={addDevice}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-hn-800 hover:bg-hn-900 dark:bg-sky-600 dark:hover:bg-sky-500 text-white text-sm font-semibold transition-colors shadow-sm cursor-pointer"
              >
                <Cpu size={15} />
                Agregar 1 dispositivo
              </button>
              {[3, 5, 10].map(n => (
                <button
                  key={n}
                  onClick={() => addBatch(n)}
                  className="px-4 py-2.5 rounded-xl bg-hn-100 dark:bg-slate-800 text-hn-800 dark:text-slate-200 hover:bg-hn-200 dark:hover:bg-slate-700 text-sm font-medium border border-transparent dark:border-slate-700 transition-colors cursor-pointer"
                >
                  + {n} a la vez
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Device rows */}
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hn-200 dark:border-slate-800 py-16 flex flex-col items-center gap-3 transition-colors">
          <Cpu size={40} className="text-hn-300 dark:text-slate-600" />
          <p className="text-hn-600 dark:text-slate-300 font-semibold">Sin dispositivos</p>
          <p className="text-hn-400 dark:text-slate-500 text-sm text-center max-w-xs">
            Usa el panel de arriba para agregar uno o varios dispositivos virtuales ESP32.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ config, running: _running }) => {
            const isRunning = simulatorService.isRunning(config.deviceId)
            return (
              <div
                key={config.deviceId}
                className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm px-5 py-4 flex items-center gap-4 transition-colors ${
                  isRunning ? 'border-emerald-300 dark:border-emerald-600/60' : 'border-hn-200 dark:border-slate-800'
                }`}
              >
                {/* Status dot */}
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-hn-300 dark:bg-slate-700'}`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-hn-800 dark:text-slate-100 text-sm truncate">{config.patientName}</p>
                  <p className="text-xs text-hn-400 dark:text-slate-500">{config.deviceId} · {config.intervalMs}ms</p>
                </div>

                {/* Status badge */}
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium hidden sm:inline-block ${
                  isRunning
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-hn-100 dark:bg-slate-800 text-hn-600 dark:text-slate-400 border border-hn-200 dark:border-slate-700'
                }`}>
                  {isRunning ? 'Enviando' : 'Detenido'}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Botón Físico Emulado PBS-33B */}
                  <button
                    onClick={() => triggerEmergencyButton(config.deviceId)}
                    title="Pulsar Botón de Emergencia PBS-33B (Solicitud de auxilio)"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-black shadow-sm shadow-red-500/30 transition-all border border-red-500 cursor-pointer"
                  >
                    <Radio size={13} className="animate-pulse" />
                    <span className="hidden sm:inline">Botón PBS-33B</span>
                  </button>

                  {/* Force fall */}
                  <button
                    onClick={() => triggerFall(config.deviceId)}
                    title="Simular caída"
                    className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-500 hover:text-amber-600 dark:text-amber-400 transition-colors cursor-pointer"
                  >
                    <AlertTriangle size={15} />
                  </button>

                  {/* Start/Stop */}
                  <button
                    onClick={() => toggleDevice(config.deviceId, isRunning)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      isRunning
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-900/50'
                        : 'bg-hn-800 hover:bg-hn-900 dark:bg-sky-600 dark:hover:bg-sky-500 text-white'
                    }`}
                  >
                    {isRunning ? <><Square size={12} /> Detener</> : <><Play size={12} /> Iniciar</>}
                  </button>

                  {/* Delete (solo Administrador) */}
                  {canDelete && (
                    <button
                      onClick={() => deleteDevice(config.deviceId)}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-hn-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                      title="Eliminar dispositivo y paciente"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* JSON preview */}
      {rows.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 dark:bg-slate-950 rounded-2xl p-5 border border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw size={13} className="text-slate-300 dark:text-sky-400" />
              <p className="text-slate-300 dark:text-slate-200 text-xs font-semibold uppercase tracking-widest">
                1. Telemetría Periódica (Cada 4s)
              </p>
            </div>
            <pre className="text-slate-100 text-[11px] leading-relaxed overflow-x-auto font-mono">
{`{
  "deviceId": "ESP32-001",
  "patientName": "Ana García",
  "timestamp": ${Date.now()},
  "heartRate": 72,
  "temperature": 36.5,
  "fallDetected": false,
  "batteryLevel": 85,
  "accelerometer": { "x": 0.02, "y": -0.01, "z": 9.81 },
  "emergencyButton": { "pressed": false }
}

Topic: healthnet/devices/{deviceId}/telemetry`}
            </pre>
          </div>

          <div className="bg-red-950/80 rounded-2xl p-5 border border-red-900/60 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={13} className="text-red-400 animate-pulse" />
              <p className="text-red-300 text-xs font-semibold uppercase tracking-widest">
                2. Evento Inmediato PBS-33B (Cero Latencia)
              </p>
            </div>
            <pre className="text-red-100 text-[11px] leading-relaxed overflow-x-auto font-mono">
{`{
  "deviceId": "ESP32-001",
  "eventType": "EMERGENCY_BUTTON",
  "eventId": "a4f89d31-29bd-49be-a012-78d104523fc8",
  "timestamp": ${Date.now()},
  "pressed": true,
  "batteryLevel": 100
}

Topic: healthnet/devices/{deviceId}/emergency
* Nota: El paciente se identifica exclusivamente por deviceId en la BD (cero confianza en datos externos).`}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
