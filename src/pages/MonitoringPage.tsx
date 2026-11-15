import { useState, useMemo } from 'react'
import { useDeviceStore } from '../store/deviceStore'
import { useAuth } from '../hooks/useAuth'
import { getSystemUsers } from '../services/auth'
import type { UserProfile } from '../types'
import {
  Heart, Thermometer, AlertTriangle, Activity, User, TrendingUp, Calendar,
  Search, Bed, Layers, CheckCircle2, Wifi, Battery, Clock, Phone, Mail,
  HeartHandshake, ChevronRight, ShieldAlert, Check, ArrowLeft, Users, Sliders,
  Stethoscope, FileDown, FileText, Loader2, ArrowLeftRight, History, RotateCcw, X
} from 'lucide-react'
import HeartRateChart from '../components/charts/HeartRateChart'
import TempChart from '../components/charts/TempChart'
import DeviceReportTemplate from '../components/DeviceReportTemplate'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend
} from 'recharts'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface HistoricalData {
  time: string
  bpm: number
  temp: number
}

export default function MonitoringPage() {
  const { user } = useAuth()
  const rawDevices = useDeviceStore(s => Object.values(s.devices))
  const allAlerts = useDeviceStore(s => s.alerts)
  const isNurse = user?.role === 'nurse'

  // Lista de usuarios para resolver datos de contacto del enfermero
  const systemUsers = useMemo(() => getSystemUsers(), [])

  // Acceso general: Todos los enfermeros pueden consultar la información de todos los pacientes en Monitoreo
  const devices = useMemo(() => {
    return rawDevices.filter(d => !d.isArchived && d.profile?.isArchived !== true)
  }, [rawDevices])

  // Modos de vista: 'list' (directorio institucional) o 'detail' (métricas clínicas e historial)
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGender, setSelectedGender] = useState<'all' | 'Hombre' | 'Mujer'>('all')
  const [selectedFloor, setSelectedFloor] = useState<string>('all')
  const [selectedRoom, setSelectedRoom] = useState<string>('all')
  const [filterAlertsOnly, setFilterAlertsOnly] = useState<boolean>(false)
  const [selectedId, setSelectedId] = useState<string>(devices[0]?.deviceId || '')

  // Modos de sub-vista dentro del detalle: 'all' (vista completa) | 'history' (solo historial) | 'live' (solo en vivo)
  const [detailSubView, setDetailSubView] = useState<'all' | 'history' | 'live'>('all')

  // Rango de consulta para Historial Clínico: 'hoy' (24 horas) | 'semana' (7 días) | 'mes' (30 días)
  const [historyRange, setHistoryRange] = useState<'hoy' | 'semana' | 'mes'>('hoy')

  // Estado para generación de PDF
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Lista dinámica de pisos disponibles en los pacientes activos
  const availableFloors = useMemo(() => {
    const floors = new Set<string>()
    devices.forEach(d => {
      if (d.profile?.floor) floors.add(d.profile.floor.trim())
    })
    return Array.from(floors).sort()
  }, [devices])

  // Lista dinámica de cuartos/habitaciones disponibles en los pacientes activos
  const availableRooms = useMemo(() => {
    const rooms = new Set<string>()
    devices.forEach(d => {
      if (d.profile?.roomNumber) rooms.add(d.profile.roomNumber.trim())
    })
    return Array.from(rooms).sort()
  }, [devices])

  const hasActiveFilters = searchQuery !== '' || selectedGender !== 'all' || selectedFloor !== 'all' || selectedRoom !== 'all' || filterAlertsOnly

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedGender('all')
    setSelectedFloor('all')
    setSelectedRoom('all')
    setFilterAlertsOnly(false)
  }

  // Filtrado de pacientes en la tabla (soporta filtros independientes o combinados)
  const filteredPatients = useMemo(() => {
    return devices.filter(d => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        d.patientName.toLowerCase().includes(q) ||
        d.deviceId.toLowerCase().includes(q) ||
        (d.profile?.roomNumber && d.profile.roomNumber.toLowerCase().includes(q)) ||
        (d.profile?.assignedNurseName && d.profile.assignedNurseName.toLowerCase().includes(q))

      const matchesGender = selectedGender === 'all' || d.profile?.gender === selectedGender
      const matchesFloor = selectedFloor === 'all' || (d.profile?.floor && d.profile.floor.trim() === selectedFloor)
      const matchesRoom = selectedRoom === 'all' || (d.profile?.roomNumber && d.profile.roomNumber.trim() === selectedRoom)

      let matchesAlerts = true
      if (filterAlertsOnly) {
        const hasUnacknowledgedAlert = d.alerts.some(a => !a.acknowledged)
        const hr = d.latest?.heartRate
        const temp = d.latest?.temperature
        const hasVitalsAlert = (hr && (hr < 60 || hr > 100)) || (temp && temp > 37.8)
        matchesAlerts = Boolean(hasUnacknowledgedAlert || hasVitalsAlert)
      }

      return matchesSearch && matchesGender && matchesFloor && matchesRoom && matchesAlerts
    })
  }, [devices, searchQuery, selectedGender, selectedFloor, selectedRoom, filterAlertsOnly])

  // Paciente actualmente seleccionado para la vista de métricas
  const currentDevice = devices.find(d => d.deviceId === selectedId) || devices[0]

  // Enfermero asociado al paciente seleccionado
  const associatedNurseUser = useMemo(() => {
    if (!currentDevice?.profile?.assignedNurseId) return null
    return systemUsers.find(u => u.id === currentDevice.profile?.assignedNurseId) || null
  }, [currentDevice, systemUsers])

  // Selección de paciente desde la lista
  const handleSelectPatient = (deviceId: string) => {
    setSelectedId(deviceId)
    setViewMode('detail')
  }

  // Generación de registros históricos de pulso y temperatura para el paciente seleccionado
  const mockTrendData = useMemo((): HistoricalData[] => {
    if (!currentDevice) return []

    // Semilla determinista basada en el ID y nombre del paciente
    const seed = currentDevice.patientName.length + currentDevice.deviceId.length
    const pointsCount = historyRange === 'hoy' ? 24 : historyRange === 'semana' ? 7 : 30
    const list: HistoricalData[] = []

    const baseHR = currentDevice.latest?.heartRate ?? (70 + (seed % 10))
    const baseTemp = currentDevice.latest?.temperature ?? (36.5 + ((seed % 5) * 0.1))

    for (let i = pointsCount - 1; i >= 0; i--) {
      let label = ''
      const now = new Date()
      if (historyRange === 'hoy') {
        const hr = new Date(now.getTime() - i * 60 * 60 * 1000)
        label = `${String(hr.getHours()).padStart(2, '0')}:00`
      } else if (historyRange === 'semana') {
        const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        label = day.toLocaleDateString('es-ES', { weekday: 'short' })
      } else {
        const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        label = `${day.getDate()}/${day.getMonth() + 1}`
      }

      // El punto más reciente (i === 0) refleja los valores actuales en vivo si están disponibles
      if (i === 0 && currentDevice.latest) {
        list.push({
          time: historyRange === 'hoy' ? 'Ahora' : label,
          bpm: Math.round(currentDevice.latest.heartRate),
          temp: parseFloat(currentDevice.latest.temperature.toFixed(1)),
        })
        continue
      }

      const flucHR = Math.sin((i + seed) * 0.5) * 6 + Math.sin(i * 1.7) * 3
      const flucTemp = Math.cos((i + seed) * 0.3) * 0.3 + Math.sin(i * 1.1) * 0.15

      list.push({
        time: label,
        bpm: Math.round(baseHR + flucHR),
        temp: parseFloat((baseTemp + flucTemp).toFixed(1)),
      })
    }

    return list
  }, [currentDevice, historyRange])

  // Exportar registros a formato CSV correspondientes al paciente seleccionado
  const handleExportCSV = () => {
    if (!currentDevice || mockTrendData.length === 0) return

    let csvContent = 'data:text/csv;charset=utf-8,'
    csvContent += 'Paciente,Brazalete,Habitacion,Piso,Periodo,Fecha/Hora,Ritmo Cardiaco (BPM),Temperatura (C)\n'

    mockTrendData.forEach(d => {
      csvContent += `"${currentDevice.patientName}","${currentDevice.deviceId}","${currentDevice.profile?.roomNumber || 'Hab. 101'}","${currentDevice.profile?.floor || 'Piso 1'}","${historyRange}","${d.time}",${d.bpm},${d.temp}\n`
    })

    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const timestampStr = `${day}-${month}-${year}_${hours}-${minutes}`

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Historial_${currentDevice.patientName.replace(/\s+/g, '_')}_${historyRange}_${timestampStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Exportar informe clínico completo a formato PDF correspondiente al paciente seleccionado
  const handleExportPDF = async () => {
    if (!currentDevice) return
    setGeneratingPdf(true)
    await new Promise(resolve => setTimeout(resolve, 350))

    const element = document.getElementById(`report-template-${currentDevice.deviceId}`)
    if (!element) {
      setGeneratingPdf(false)
      return
    }

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      })

      const imgWidth = 210
      const pageHeight = 297
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      const safeName = currentDevice.patientName.replace(/\s+/g, '_')
      pdf.save(`Historial_Clinico_${safeName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
    } catch (err) {
      console.error('Error generando PDF:', err)
    } finally {
      setGeneratingPdf(false)
    }
  }

  // Si no hay dispositivos
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-hn-100 dark:bg-hn-500/10 flex items-center justify-center mb-4">
          <Activity size={28} className="text-hn-600 dark:text-hn-400 animate-pulse" />
        </div>
        <h2 className="font-bold text-lg text-slate-800 dark:text-slate-200">
          Sin datos de monitoreo
        </h2>
        <p className="text-sm text-slate-400 max-w-xs mt-1">
          {isNurse
            ? 'No hay pacientes activos conectados para monitorear en este momento.'
            : 'Inicia la simulación en el Simulador IoT o conecta un dispositivo real para ver el monitoreo en tiempo real.'}
        </p>
      </div>
    )
  }

  const latest = currentDevice?.latest
  const history = currentDevice?.history || []
  const alerts = currentDevice?.alerts || []
  const fallsList = alerts.filter(a => a.type === 'fall')
  const patientAlerts = useMemo(() => {
    return allAlerts.filter(a => a.deviceId === currentDevice?.deviceId)
  }, [allAlerts, currentDevice?.deviceId])

  // Cálculos estadísticos
  const avgHR = history.length
    ? Math.round(history.reduce((s, h) => s + h.heartRate, 0) / history.length)
    : latest?.heartRate ?? 0

  const avgTemp = history.length
    ? (history.reduce((s, h) => s + h.temperature, 0) / history.length).toFixed(1)
    : (latest?.temperature !== undefined && latest?.temperature !== null ? latest.temperature.toFixed(1) : '0.0')

  return (
    <div className="space-y-6">

      {/* ──────────────────────────────────────────────────────── */}
      {/* VISTA 1: LISTADO INSTITUCIONAL DE MONITOREO CLÍNICO      */}
      {/* (Estilo visual y funcional como "Pacientes y Brazaletes") */}
      {/* ──────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Header Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-hn-50 dark:bg-slate-800 border border-hn-100 dark:border-slate-700 text-hn-800 dark:text-sky-300 text-[10px] font-black uppercase tracking-wider mb-2">
                <Activity size={12} className="animate-pulse" />
                Monitoreo Clínico Continuo · Directorio de Pacientes
              </div>
              <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
                Monitoreo Clínico de Pacientes
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Supervisión médica de signos vitales en tiempo real, estado de conectividad IoT y consulta del enfermero a cargo. Selecciona un paciente para ver sus métricas detalladas e historial clínico.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                {devices.length} {devices.length === 1 ? 'Paciente en monitoreo' : 'Pacientes en monitoreo'}
              </span>
            </div>
          </div>

          {/* Tarjetas de Métricas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total en Monitoreo */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-hn-100 dark:bg-slate-800 text-hn-700 dark:text-sky-300 flex items-center justify-center font-black">
                <Users size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Total en Monitoreo
                </p>
                <p className="text-xl font-black text-slate-800 dark:text-white">
                  {devices.length}
                </p>
              </div>
            </div>

            {/* Brazaletes en Vivo */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
                <Wifi size={20} className="animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Brazaletes en Vivo
                </p>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {devices.filter(d => d.connected).length}
                </p>
              </div>
            </div>

            {/* Con Enfermero Asignado */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                <HeartHandshake size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Con Enfermero
                </p>
                <p className="text-xl font-black text-purple-600 dark:text-purple-400">
                  {devices.filter(d => d.profile?.assignedNurseName).length}
                </p>
              </div>
            </div>

            {/* Alertas Críticas */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-black">
                <AlertTriangle size={20} className="animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Alertas y Caídas
                </p>
                <p className="text-xl font-black text-rose-600 dark:text-rose-400">
                  {devices.reduce((acc, d) => acc + d.alerts.filter(a => !a.acknowledged).length, 0)}
                </p>
              </div>
            </div>

          </div>

          {/* BUSCADOR Y FILTROS COMBINADOS: GÉNERO, UBICACIÓN (CUARTO), PISO */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Buscador de texto */}
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, brazalete, habitación o enfermero..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-bold"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Botón rápido con alertas y limpiar filtros */}
              <div className="flex items-center gap-2 self-start lg:self-auto">
                <button
                  onClick={() => setFilterAlertsOnly(!filterAlertsOnly)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterAlertsOnly
                      ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-500/20'
                      : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 border border-rose-200 dark:border-rose-900/40'
                  }`}
                >
                  <AlertTriangle size={13} />
                  <span>Con Alertas</span>
                </button>

                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="px-3 py-2 rounded-xl text-xs font-bold transition-all text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                    title="Restablecer todos los filtros"
                  >
                    <RotateCcw size={13} />
                    <span>Limpiar</span>
                  </button>
                )}
              </div>
            </div>

            {/* Fila de Filtros Específicos: Género, Ubicación (Cuarto) y Piso */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
              {/* 1. Filtro Género */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                  <User size={13} className="text-hn-600 dark:text-sky-400" />
                  <span>Género:</span>
                </span>
                <div className="flex items-center gap-1 w-full bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  {(['all', 'Mujer', 'Hombre'] as const).map(g => (
                    <button
                      key={g}
                      onClick={() => setSelectedGender(g)}
                      className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                        selectedGender === g
                          ? 'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      {g === 'all' ? 'Todos' : g === 'Mujer' ? 'Mujeres' : 'Hombres'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Filtro Piso */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                  <Layers size={13} className="text-hn-600 dark:text-sky-400" />
                  <span>Piso:</span>
                </span>
                <select
                  value={selectedFloor}
                  onChange={e => setSelectedFloor(e.target.value)}
                  className="w-full py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 cursor-pointer"
                >
                  <option value="all">Todos los pisos ({devices.length})</option>
                  {availableFloors.map(floor => (
                    <option key={floor} value={floor}>
                      {floor} ({devices.filter(d => d.profile?.floor?.trim() === floor).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Filtro Ubicación / Cuarto */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                  <Bed size={13} className="text-hn-600 dark:text-sky-400" />
                  <span>Ubicación:</span>
                </span>
                <select
                  value={selectedRoom}
                  onChange={e => setSelectedRoom(e.target.value)}
                  className="w-full py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 cursor-pointer"
                >
                  <option value="all">Todas las habitaciones</option>
                  {availableRooms.map(room => (
                    <option key={room} value={room}>
                      {room}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* TABLA PRINCIPAL DE PACIENTES */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-800/20">
                    <th className="py-4 px-5">Paciente y Edad</th>
                    <th className="py-4 px-4">Brazalete IoT</th>
                    <th className="py-4 px-4">Ubicación / Cama</th>
                    <th className="py-4 px-4">Enfermero a Cargo</th>
                    <th className="py-4 px-4">Pulso Cardíaco</th>
                    <th className="py-4 px-4">Temperatura</th>
                    <th className="py-4 px-4">Estado Clínico</th>
                    <th className="py-4 px-5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No se encontraron pacientes con los criterios de búsqueda seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredPatients.map(patient => {
                      const profile: Partial<UserProfile> = patient.profile || {}
                      const devLatest = patient.latest
                      const hasActiveAlert = patient.alerts.some(a => !a.acknowledged)
                      const isHRAlert = devLatest && (devLatest.heartRate < 60 || devLatest.heartRate > 100)
                      const isTempAlert = devLatest && devLatest.temperature > 37.8

                      return (
                        <tr
                          key={patient.deviceId}
                          onClick={() => handleSelectPatient(patient.deviceId)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                        >
                          {/* 1. Nombre y Edad */}
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-hn-100 dark:bg-slate-800 text-hn-800 dark:text-sky-300 flex items-center justify-center font-bold text-xs flex-shrink-0 group-hover:bg-hn-800 group-hover:text-white transition-colors">
                                <User size={16} />
                              </div>
                              <div>
                                <p className="font-black text-slate-900 dark:text-white leading-tight">
                                  {patient.patientName}
                                </p>
                                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                  {profile.age ? `${profile.age} años` : 'Edad no reg.'} · {profile.gender || 'Hombre'}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* 2. Brazalete IoT */}
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${patient.connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`} />
                              {patient.deviceId}
                            </span>
                          </td>

                          {/* 3. Ubicación / Habitación */}
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                              <Bed size={13} className="text-slate-400" />
                              {profile.roomNumber || 'Hab. 101'}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {profile.floor || 'Piso 1'} {profile.bedNumber ? `· Cama ${profile.bedNumber}` : ''}
                            </span>
                          </td>

                          {/* 4. Enfermero a Cargo */}
                          <td className="py-3.5 px-4">
                            {profile.assignedNurseName ? (
                              <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                                <HeartHandshake size={12} className="text-emerald-600 dark:text-emerald-400" />
                                {profile.assignedNurseName}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                <ShieldAlert size={12} />
                                Sin asignar
                              </span>
                            )}
                          </td>

                          {/* 5. Pulso Cardíaco */}
                          <td className="py-3.5 px-4">
                            {devLatest ? (
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 text-xs font-black ${
                                  isHRAlert ? 'text-rose-600 animate-pulse' : 'text-slate-800 dark:text-slate-200'
                                }`}>
                                  <Heart size={13} className={isHRAlert ? 'text-rose-500 fill-rose-500 animate-bounce' : 'text-rose-500 fill-rose-500'} />
                                  {devLatest.heartRate} <span className="text-[10px] text-slate-400 font-bold">BPM</span>
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">--</span>
                            )}
                          </td>

                          {/* 6. Temperatura */}
                          <td className="py-3.5 px-4">
                            {devLatest && devLatest.temperature !== undefined ? (
                              <span className={`inline-flex items-center gap-1 text-xs font-black ${
                                isTempAlert ? 'text-amber-600 font-black' : 'text-slate-800 dark:text-slate-200'
                              }`}>
                                <Thermometer size={13} className={isTempAlert ? 'text-amber-500' : 'text-sky-500'} />
                                {devLatest.temperature.toFixed(1)} <span className="text-[10px] text-slate-400 font-bold">°C</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">--</span>
                            )}
                          </td>

                          {/* 7. Estado Clínico / Alertas */}
                          <td className="py-3.5 px-4">
                            {hasActiveAlert ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 text-[10px] font-black uppercase tracking-wider animate-pulse">
                                <AlertTriangle size={11} />
                                ¡Alerta Activa!
                              </span>
                            ) : isHRAlert || isTempAlert ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 text-[10px] font-black uppercase tracking-wider">
                                Fuera de rango
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 text-[10px] font-black uppercase tracking-wider">
                                <Check size={11} strokeWidth={3} />
                                Estable
                              </span>
                            )}
                          </td>

                          {/* 8. Acción: Ver Métricas y Cuidador */}
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSelectPatient(patient.deviceId)
                              }}
                              className="px-3.5 py-1.5 rounded-xl bg-hn-50 text-hn-800 hover:bg-hn-800 hover:text-white dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-hn-600 dark:hover:text-white text-xs font-bold transition-all shadow-sm inline-flex items-center gap-1.5 cursor-pointer group-hover:scale-102"
                            >
                              <Activity size={13} />
                              <span>Ver Métricas y Cuidador</span>
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* VISTA 2: MÉTRICAS CLÍNICAS Y ENFERMERO ASOCIADO          */}
      {/* (Se despliega al seleccionar al paciente en la lista)    */}
      {/* ──────────────────────────────────────────────────────── */}
      {viewMode === 'detail' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Plantilla oculta para generación de Reporte PDF */}
          {currentDevice && (
            <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
              <DeviceReportTemplate device={currentDevice} />
            </div>
          )}

          {/* BARRA DE NAVEGACIÓN SUPERIOR: Volver a la Lista y Modos de Visualización */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode('list')}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
                title="Volver a la lista de pacientes"
                aria-label="Volver"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-800 dark:text-white leading-tight">
                    Métricas Clínicas e Historial de {currentDevice?.patientName}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    En Vivo
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {currentDevice?.deviceId} · {currentDevice?.profile?.roomNumber || 'Habitación 101'} ({currentDevice?.profile?.floor || 'Piso 1'})
                </p>
              </div>
            </div>

            {/* Selector de sub-vistas y acciones rápidas */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setDetailSubView('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    detailSubView === 'all'
                      ? 'bg-white dark:bg-slate-900 text-hn-800 dark:text-sky-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Vista Completa
                </button>
                <button
                  type="button"
                  onClick={() => setDetailSubView('history')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailSubView === 'history'
                      ? 'bg-white dark:bg-slate-900 text-hn-800 dark:text-sky-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <History size={13} className="text-hn-600 dark:text-sky-400" />
                  <span>Historial Clínico</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailSubView('live')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailSubView === 'live'
                      ? 'bg-white dark:bg-slate-900 text-hn-800 dark:text-sky-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Activity size={13} className="text-emerald-500" />
                  <span>Métricas en Vivo</span>
                </button>
              </div>

              {/* Botón rápido CSV */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                title="Descargar historial de este paciente en CSV"
              >
                <FileDown size={13} className="text-emerald-600" />
                <span>CSV</span>
              </button>

              {/* Botón rápido PDF */}
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={generatingPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-hn-800 hover:bg-hn-900 text-white dark:bg-sky-600 dark:hover:bg-sky-700 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-60 active:scale-95"
                title="Descargar informe médico completo en PDF"
              >
                {generatingPdf ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>PDF...</span>
                  </>
                ) : (
                  <>
                    <FileText size={13} />
                    <span>PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {currentDevice && latest ? (
            <div className="space-y-6">

              {/* TARJETA PRINCIPAL: DATOS DEL PACIENTE Y ENFERMERO ASOCIADO */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  
                  {/* Lado A: Datos Generales del Paciente Seleccionado */}
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-hn-100 dark:bg-slate-800 text-hn-800 dark:text-sky-300 flex items-center justify-center font-bold flex-shrink-0 shadow-sm">
                      <User size={26} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">
                          {currentDevice.patientName}
                        </h2>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold mt-1.5">
                        <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-700 dark:text-slate-300">
                          {currentDevice.deviceId}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          <Bed size={13} className="text-hn-600 dark:text-hn-400" />
                          {currentDevice.profile?.roomNumber || 'Habitación'} ({currentDevice.profile?.floor || 'Piso 1'})
                        </span>
                        <span>•</span>
                        <span>{currentDevice.profile?.age ? `${currentDevice.profile.age} años` : ''} · {currentDevice.profile?.gender || 'Hombre'}</span>
                      </div>

                      {/* Contacto de Emergencia */}
                      {currentDevice.profile?.emergencyContactName && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-2 flex items-center gap-1.5">
                          <Phone size={11} className="text-hn-600 flex-shrink-0" />
                          <span>Contacto de Emergencia:</span>
                          <strong className="text-slate-800 dark:text-slate-200 font-bold">
                            {currentDevice.profile.emergencyContactName} ({currentDevice.profile.emergencyContactPhone || '—'})
                          </strong>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Lado B: ENFERMERO ASOCIADO A CARGO (PROMINENTE) */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/90 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/10 border border-emerald-200/80 dark:border-emerald-800/40 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        <HeartHandshake size={14} className="text-emerald-600 dark:text-emerald-400" />
                        Enfermero Asociado a Cargo
                      </span>
                      {currentDevice.profile?.assignedNurseName ? (
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-200/60 dark:bg-emerald-800/40 text-emerald-900 dark:text-emerald-200">
                          Asignación Activa
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          Sin Asignar
                        </span>
                      )}
                    </div>

                    {currentDevice.profile?.assignedNurseName ? (
                      <div className="flex items-center gap-3 mt-2">
                        <div className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold shadow-sm flex-shrink-0">
                          <Stethoscope size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                            {currentDevice.profile.assignedNurseName}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 flex items-center gap-1 font-medium truncate">
                            <Mail size={11} className="text-emerald-600 flex-shrink-0" />
                            <span className="truncate">{associatedNurseUser?.email || 'enfermeria@healthnet.com'}</span>
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1 font-mono font-bold">
                            <Phone size={11} className="text-emerald-600 flex-shrink-0" />
                            <span>{associatedNurseUser?.phoneNumber || '+52 664 345 6789'}</span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 text-xs text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-2">
                        <ShieldAlert size={16} className="flex-shrink-0" />
                        <span>Este paciente no tiene enfermero asignado actualmente. Ve a "Gestión de Usuarios" para asociarle un cuidador.</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Sub-barra de telemetría y conexión */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-4 text-slate-500 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Wifi size={13} className={currentDevice.connected ? 'text-emerald-500 animate-pulse' : 'text-slate-400'} />
                      <span>{currentDevice.connected ? 'Conexión MQTT Activa' : 'Desconectado'}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} className="text-slate-400" />
                      <span>Último reporte: {format(latest.timestamp, 'HH:mm:ss')}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-bold">Batería del Brazalete:</span>
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                      <Battery size={13} />
                      {latest.batteryLevel ?? 95}%
                    </span>
                  </div>
                </div>
              </div>

              {/* ──────────────────────────────────────────────────────── */}
              {/* MÉTRICAS CLÍNICAS EN VIVO Y REGISTRO DE CAÍDAS           */}
              {/* ──────────────────────────────────────────────────────── */}
              {(detailSubView === 'all' || detailSubView === 'live') && (
                <div className="space-y-6">
                  {/* Grid 2 Columnas: Ritmo Cardíaco y Temperatura Corporal */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* 1. Métrica: Ritmo Cardíaco */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 transition-colors shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                            <Heart size={18} className="text-red-500" fill="currentColor" />
                            Frecuencia Cardíaca (Pulso)
                          </span>
                          <span className="bg-red-50 dark:bg-red-500/10 text-red-500 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                            BPM
                          </span>
                        </div>

                        <div className="flex items-baseline gap-2 mb-4">
                          <span className="text-5xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                            {latest.heartRate}
                          </span>
                          <span className="text-sm font-bold text-slate-400">BPM actual</span>
                        </div>

                        {/* Gráfica histórica en vivo */}
                        <div className="w-full mb-4">
                          <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                            <TrendingUp size={12} /> Curva de Pulsaciones en Tiempo Real (Minutos)
                          </p>
                          <div className="h-44 w-full">
                            <HeartRateChart history={history} />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950/40 rounded-2xl p-3.5 flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-500 uppercase">Promedio en Turno:</span>
                        <span className="text-slate-800 dark:text-white font-black text-sm">{avgHR} BPM</span>
                      </div>
                    </div>

                    {/* 2. Métrica: Temperatura Corporal */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 transition-colors shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                            <Thermometer size={18} className="text-blue-500" />
                            Temperatura Corporal
                          </span>
                          <span className="bg-blue-50 dark:bg-blue-500/10 text-blue-500 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                            °C
                          </span>
                        </div>

                        <div className="flex items-baseline gap-2 mb-4">
                          <span className="text-5xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                            {latest.temperature !== undefined && latest.temperature !== null ? latest.temperature.toFixed(1) : '--'}
                          </span>
                          <span className="text-sm font-bold text-slate-400">°C actual</span>
                        </div>

                        {/* Gráfica histórica en vivo */}
                        <div className="w-full mb-4">
                          <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                            <TrendingUp size={12} /> Curva Térmica en Tiempo Real (Minutos)
                          </p>
                          <div className="h-44 w-full">
                            <TempChart history={history} />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950/40 rounded-2xl p-3.5 flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-500 uppercase">Promedio en Turno:</span>
                        <span className="text-slate-800 dark:text-white font-black text-sm">{avgTemp}°C</span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Métrica: Detección de Caídas y Alertas Críticas */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 transition-colors shadow-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-500 animate-pulse" />
                        <h3 className="text-sm font-black text-slate-800 dark:text-white">
                          Registro de Caídas y Alertas del Paciente
                        </h3>
                      </div>
                      <span className="bg-red-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                        {fallsList.length} caídas reportadas
                      </span>
                    </div>

                    <div className="space-y-3">
                      {fallsList.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center">
                          <CheckCircle2 size={36} className="text-emerald-500 mb-2" />
                          <p className="text-xs font-black text-slate-700 dark:text-slate-300">Sin caídas reportadas</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">El paciente no registra incidentes de impacto o llamados de emergencia.</p>
                        </div>
                      ) : (
                        [...fallsList].reverse().map(fall => (
                          <div
                            key={fall.id}
                            className="p-3.5 bg-red-50/60 dark:bg-red-500/5 border border-red-200 dark:border-red-500/10 rounded-2xl flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center font-bold">
                                <AlertTriangle size={18} />
                              </div>
                              <div>
                                <p className="text-xs font-black text-red-700 dark:text-red-400">
                                  ¡Caída Detectada en {currentDevice.profile?.roomNumber || 'Habitación'}!
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                  {format(fall.timestamp, 'dd MMMM yyyy, HH:mm:ss', { locale: es })}
                                </p>
                              </div>
                            </div>

                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                              fall.acknowledged
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 animate-pulse'
                            }`}>
                              {fall.acknowledged ? 'Atendida' : 'Pendiente de Atención'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────── */}
              {/* SECCIÓN 4: HISTORIAL CLÍNICO Y ANÁLISIS DE TENDENCIAS      */}
              {/* ──────────────────────────────────────────────────────── */}
              {(detailSubView === 'all' || detailSubView === 'history') && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6 animate-in fade-in duration-200">
                  {/* Encabezado con selector de periodo y exportación */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-hn-50 dark:bg-slate-800 border border-hn-100 dark:border-slate-700 text-hn-800 dark:text-sky-300 text-[10px] font-black uppercase tracking-wider mb-1.5">
                        <History size={12} />
                        <span>Historial Clínico del Paciente</span>
                      </div>
                      <h3 className="text-base font-black text-slate-800 dark:text-white leading-tight">
                        Evolución Histórica y Tendencias de Signos Vitales
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Registros consolidados de ritmo cardíaco (BPM) y temperatura (°C) correspondientes únicamente a <strong className="text-slate-700 dark:text-slate-200">{currentDevice.patientName}</strong>.
                      </p>
                    </div>

                    {/* Selector de Rango Temporal y Botones de Exportación */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded-xl">
                        {(['hoy', 'semana', 'mes'] as const).map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setHistoryRange(r)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              historyRange === r
                                ? 'bg-hn-800 text-white dark:bg-sky-500 dark:text-slate-950 shadow-sm'
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                          >
                            {r === 'hoy' ? 'Hoy (24 Horas)' : r === 'semana' ? 'Semana (7 Días)' : 'Mes (30 Días)'}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleExportCSV}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200 dark:border-slate-700 active:scale-95 shadow-sm"
                        title="Descargar datos históricos en archivo CSV"
                      >
                        <FileDown size={14} className="text-emerald-600" />
                        <span>Exportar CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportPDF}
                        disabled={generatingPdf}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-hn-800 text-white hover:bg-hn-900 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-600 rounded-xl text-xs font-bold transition-all shadow-md shadow-hn-950/10 cursor-pointer disabled:opacity-60 active:scale-95"
                        title="Descargar informe médico completo en PDF"
                      >
                        {generatingPdf ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Exportando PDF...</span>
                          </>
                        ) : (
                          <>
                            <FileText size={14} />
                            <span>Exportar PDF</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Cuadrícula de Gráfica de Tendencia y Tabla de Registros Almacenados */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Gráfica de Líneas Multieje (2 Columnas) */}
                    <div className="lg:col-span-2 bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <TrendingUp size={15} className="text-hn-600 dark:text-sky-400" />
                          <span>Tendencia de Signos Vitales ({historyRange === 'hoy' ? '24 Horas' : historyRange === 'semana' ? 'Últimos 7 Días' : 'Últimos 30 Días'})</span>
                        </h4>
                        <div className="flex items-center gap-3 text-[11px] font-bold">
                          <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                            <span>Ritmo Cardíaco (BPM)</span>
                          </span>
                          <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                            <span>Temperatura (°C)</span>
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={mockTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:hidden" />
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" className="hidden dark:block" />
                            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
                            <YAxis yAxisId="left" domain={[50, 130]} tick={{ fontSize: 10, fill: '#ef4444' }} />
                            <YAxis yAxisId="right" orientation="right" domain={[35, 41]} tick={{ fontSize: 10, fill: '#3b82f6' }} />
                            <Tooltip
                              contentStyle={{
                                background: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid #cbd5e1',
                                borderRadius: 12,
                                fontSize: 12,
                                color: '#0f172a'
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 'bold' }} />
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="bpm"
                              name="Ritmo Cardíaco (BPM)"
                              stroke="#ef4444"
                              strokeWidth={2}
                              dot={historyRange !== 'mes'}
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="temp"
                              name="Temperatura (°C)"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              dot={historyRange !== 'mes'}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Panel de Registros Almacenados (1 Columna) */}
                    <div className="bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col">
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/60 dark:border-slate-800/60 flex-shrink-0">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                          <ArrowLeftRight size={14} className="text-hn-600 dark:text-sky-400" />
                          <span>Registros Almacenados</span>
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {mockTrendData.length} pts
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[300px] pr-1 divide-y divide-slate-200/50 dark:divide-slate-800/50">
                        {mockTrendData.map((data, idx) => (
                          <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wide">
                                {historyRange === 'hoy' ? 'Hora' : 'Fecha'}
                              </p>
                              <p className="text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">
                                {data.time}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="flex items-center justify-end gap-1 text-[9px] font-bold text-slate-400 uppercase">
                                  <Heart size={9} className="text-red-500" fill="currentColor" /> HR
                                </span>
                                <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                                  {data.bpm} <span className="text-[9px] font-normal text-slate-400">bpm</span>
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="flex items-center justify-end gap-1 text-[9px] font-bold text-slate-400 uppercase">
                                  <Thermometer size={9} className="text-blue-500" /> TEMP
                                </span>
                                <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                                  {data.temp.toFixed(1)} <span className="text-[9px] font-normal text-slate-400">°C</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Historial de Alertas Clínicas del Paciente y Bitácora de Atención */}
                  <div className="bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <History size={16} className="text-hn-800 dark:text-sky-400" />
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                          Historial de Alertas Clínicas del Paciente y Bitácora de Atención
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-0.5 rounded-full self-start sm:self-auto">
                        {patientAlerts.length} {patientAlerts.length === 1 ? 'alerta registrada' : 'alertas registradas'}
                      </span>
                    </div>

                    {patientAlerts.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center">
                        <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                        <p className="text-xs font-black text-slate-700 dark:text-slate-300">Sin historial de alertas clínicas</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">El paciente no registra anomalías cardíacas, térmicas o caídas.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {[...patientAlerts].reverse().map(alert => {
                          const lastTracking = alert.trackingHistory && alert.trackingHistory.length > 0
                            ? alert.trackingHistory[alert.trackingHistory.length - 1]
                            : null
                          const resolvedBy = alert.attendedBy || lastTracking?.userName
                          const resolvedAt = alert.attendedAt || lastTracking?.createdAt
                          const isAttended = alert.currentStatus === 'ATENDIDA' || alert.acknowledged

                          return (
                            <div
                              key={alert.id}
                              className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1.5 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                    alert.criticality === 'CRITICA'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-200 dark:border-red-800/60'
                                      : alert.criticality === 'ALTA'
                                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                                      : alert.criticality === 'MEDIA'
                                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                                      : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                                  }`}>
                                    {alert.criticality || 'MEDIA'}
                                  </span>

                                  <h5 className="text-xs font-black text-slate-800 dark:text-white">
                                    {alert.message}
                                  </h5>

                                  {alert.shiftType && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                                      Turno {alert.shiftType}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                                  <span className="flex items-center gap-1 font-mono">
                                    <Clock size={12} />
                                    {format(alert.timestamp, 'dd/MM/yyyy HH:mm:ss', { locale: es })}
                                  </span>
                                  <span>·</span>
                                  <span className="flex items-center gap-1">
                                    <HeartHandshake size={12} />
                                    Enfermero asignado en turno: <strong className="text-slate-700 dark:text-slate-300 font-bold">{alert.assignedTo || 'Enfermería General'}</strong>
                                  </span>
                                </div>

                                {/* Información de resolución médica y notas de bitácora */}
                                {isAttended && (
                                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                                    <div className="flex flex-wrap items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
                                      <CheckCircle2 size={13} className="text-emerald-500" />
                                      <span>Atendida y resuelta por: <strong>{resolvedBy || 'Personal Asistencial'}</strong></span>
                                      {resolvedAt && (
                                        <span className="text-slate-400 font-normal font-mono">
                                          el {format(resolvedAt, 'dd/MM/yyyy HH:mm:ss', { locale: es })}
                                        </span>
                                      )}
                                    </div>
                                    {lastTracking?.actionNotes && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 italic pl-5">
                                        "{lastTracking.actionNotes}"
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center self-start sm:self-center">
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                  isAttended
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40 animate-pulse'
                                }`}>
                                  {isAttended ? 'Atendida' : 'Pendiente de Atención'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 flex flex-col items-center justify-center">
              <Activity size={36} className="text-slate-300 mb-3 animate-pulse" />
              <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Selecciona un paciente del listado</p>
              <p className="text-xs text-slate-400 mt-1">Podrás visualizar sus métricas cardíacas, térmicas y los datos de su enfermero asociado.</p>
            </div>
          )}

        </div>
      )}

    </div>
  )
}
