import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Heart, Thermometer, AlertTriangle,
  Users, Wifi, WifiOff, BellOff, ArrowLeft, Stethoscope, Ticket
} from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { useAuth } from '../hooks/useAuth'
import DeviceCard from '../components/DeviceCard'
import { THRESHOLDS } from '../types'

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'hn',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  const colors: Record<string, string> = {
    hn:      'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950',
    green:   'bg-emerald-500 text-white dark:text-slate-950',
    red:     'bg-red-500 text-white dark:text-slate-950',
    amber:   'bg-amber-500 text-white dark:text-slate-950',
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex items-center gap-4 transition-colors">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{value}</p>
        {sub && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const rawDevices    = useDeviceStore(s => Object.values(s.devices))
  const rawAlerts     = useDeviceStore(s => s.alerts)

  // Acceso general: Todos los enfermeros pueden consultar la información de todos los pacientes en Dashboard
  const isNurse = user?.role === 'nurse'
  const nonArchivedDevices = rawDevices.filter(d => !d.isArchived && d.profile?.isArchived !== true)
  const devices = nonArchivedDevices

  // Todas las alertas generadas son visibles independientemente del rol para máxima seguridad
  const alerts = rawAlerts

  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null)

  // Reset expanded view if the device is removed
  useEffect(() => {
    if (expandedDeviceId && !devices.some(d => d.deviceId === expandedDeviceId)) {
      setExpandedDeviceId(null)
    }
  }, [devices, expandedDeviceId])

  const totalDevices  = devices.length
  const activeDevices = devices.filter(d => d.connected).length
  const unreadAlerts  = alerts.filter(a => !a.acknowledged).length
  const fallAlerts    = alerts.filter(a => a.type === 'fall' && !a.acknowledged).length

  // Avg vitals
  const activeWithData = devices.filter(d => d.latest)
  const avgHR   = activeWithData.length
    ? Math.round(activeWithData.reduce((s, d) => s + (d.latest?.heartRate ?? 0), 0) / activeWithData.length)
    : 0
  const avgTemp = activeWithData.length
    ? (activeWithData.reduce((s, d) => s + (d.latest?.temperature ?? 0), 0) / activeWithData.length).toFixed(1)
    : '0.0'

  const abnormalHR = activeWithData.filter(d => {
    if (!d.latest) return false
    const hrMax = d.config?.hrMax ?? THRESHOLDS.HR_MAX
    const hrMin = d.config?.hrMin ?? THRESHOLDS.HR_MIN
    return d.latest.heartRate > hrMax || d.latest.heartRate < hrMin
  }).length

  return (
    <div className="space-y-6">
      {/* Banner de Turno para Enfermeros */}
      {isNurse && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black shadow-sm flex-shrink-0">
              <Stethoscope size={20} />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                Turno de Enfermería Activo · {user?.fullName || 'Personal Asistencial'}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                Consulta general de pacientes ({devices.length}) y alertas clínicas del centro asistencial en tiempo real.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300 self-start sm:self-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Supervisión General Activa
          </span>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-white">
            Dashboard General
          </h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-wide">
            Monitoreo en tiempo real · AWS IoT Core
          </p>
        </div>
        {unreadAlerts > 0 && (
          <button
            onClick={() => navigate('/tickets')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-850 transition-all active:scale-95 shadow-sm cursor-pointer"
          >
            <Ticket size={14} className="text-amber-500" />
            Gestionar tickets ({unreadAlerts})
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Dispositivos activos"
          value={`${activeDevices}/${totalDevices}`}
          sub={totalDevices === 0 ? 'Sin dispositivos' : 'conectados'}
          color={activeDevices > 0 ? 'hn' : 'amber'}
        />
        <StatCard
          icon={Heart}
          label="Prom. ritmo cardíaco"
          value={avgHR > 0 ? `${avgHR} bpm` : '—'}
          sub={abnormalHR > 0 ? `${abnormalHR} fuera de rango` : 'Todos normales'}
          color={abnormalHR > 0 ? 'amber' : 'green'}
        />
        <StatCard
          icon={Thermometer}
          label="Prom. temperatura"
          value={avgTemp !== '0.0' ? `${avgTemp}°C` : '—'}
          sub="Promedio en tiempo real"
          color="hn"
        />
        <StatCard
          icon={AlertTriangle}
          label="Alertas activas"
          value={unreadAlerts}
          sub={fallAlerts > 0 ? `${fallAlerts} caída(s) detectada(s)` : 'Sin caídas'}
          color={fallAlerts > 0 ? 'red' : unreadAlerts > 0 ? 'amber' : 'green'}
        />
      </div>

      {/* Unread alert bar */}
      {fallAlerts > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-300 dark:bg-red-500/10 dark:border-red-500/20 rounded-2xl px-5 py-3.5">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 animate-pulse" />
          <p className="text-red-700 dark:text-red-400 font-bold text-xs flex-1">
            {fallAlerts} caída(s) detectada(s) — revisa las tarjetas resaltadas
          </p>
          <button
            onClick={() => navigate('/tickets')}
            className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 font-bold underline cursor-pointer"
          >
            Atender en Tickets
          </button>
        </div>
      )}

      {/* Devices grid or focused card */}
      {totalDevices === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Activity size={28} className="text-slate-400" />
          </div>
          <h2 className="text-slate-800 dark:text-slate-200 font-bold text-base mb-1">
            Sin dispositivos conectados
          </h2>
          <p className="text-slate-400 text-xs max-w-xs leading-normal">
            {isNurse
              ? 'No hay dispositivos activos conectados para monitorear actualmente.'
              : 'Ve al Simulador para lanzar dispositivos virtuales, o conecta tu ESP32 configurado con las credenciales AWS.'}
          </p>
          {!isNurse && (
            <div className="mt-6 flex items-center gap-2 text-slate-400 text-xs">
              <WifiOff size={14} className="animate-pulse" />
              <span>Esperando telemetría MQTT…</span>
            </div>
          )}
        </div>
      ) : expandedDeviceId ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setExpandedDeviceId(null)}
              className="p-2.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl shadow-sm transition-all flex items-center justify-center active:scale-95 cursor-pointer"
              title="Volver"
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
          <div className="w-full">
            {devices
              .filter(d => d.deviceId === expandedDeviceId)
              .map(device => (
                <DeviceCard
                  key={device.deviceId}
                  device={device}
                  expanded={true}
                  onToggleExpanded={() => setExpandedDeviceId(null)}
                />
              ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map(device => (
            <DeviceCard
              key={device.deviceId}
              device={device}
              expanded={false}
              onToggleExpanded={() => setExpandedDeviceId(device.deviceId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
