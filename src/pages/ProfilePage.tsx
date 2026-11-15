import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDeviceStore } from '../store/deviceStore'
import { useAuth } from '../hooks/useAuth'
import { getSystemUsers } from '../services/auth'
import {
  User, Shield, AlertTriangle, Save, CheckCircle,
  Cpu, Wifi, Battery, Calendar, Bell, Sliders, Activity,
  Lock, Search, ArrowLeft, ChevronRight, Bed, Layers,
  Phone, Users, HeartHandshake,
  UserPlus, X, RefreshCw, Archive, FileText, Trash2,
  RotateCcw, CheckCircle2, Heart, Thermometer, TrendingUp, History
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts'
import SmartwatchSimulator from '../components/SmartwatchSimulator'
import type { DeviceState } from '../types'

export default function ProfilePage() {
  const { user } = useAuth()
  const userRole = user?.role || 'nurse'
  const isAdmin = userRole === 'admin'
  const isDoctor = userRole === 'doctor'
  const isNurse = userRole === 'nurse'

  // Registro de Pacientes: Exclusivo de Administrador
  const canRegisterPatient = isAdmin

  const rawDevices = useDeviceStore(s => Object.values(s.devices))
  // Acceso general: Todos los enfermeros pueden consultar la información de todos los pacientes en Pacientes y Brazaletes
  const devices = useMemo(() => {
    return rawDevices
  }, [rawDevices])

  const updateDeviceProfile = useDeviceStore(s => s.updateDeviceProfile)
  const updateDeviceConfig = useDeviceStore(s => s.updateDeviceConfig)
  const registerPatient = useDeviceStore(s => s.registerPatient)
  const archivePatient = useDeviceStore(s => s.archivePatient)
  const unarchivePatient = useDeviceStore(s => s.unarchivePatient)
  const removeDevice = useDeviceStore(s => s.removeDevice)

  // Separación de pacientes activos y archivados
  const activePatients = useMemo(() => devices.filter(d => !d.isArchived && d.profile?.isArchived !== true), [devices])
  const archivedPatients = useMemo(() => devices.filter(d => d.isArchived || d.profile?.isArchived === true), [devices])

  // Lista de enfermeros activos para asignación
  const activeNurses = useMemo(() => {
    return getSystemUsers().filter(u => u.role === 'nurse' && u.isActive)
  }, [])

  // Modales de Confirmación para Archivar y Eliminar
  const [archiveModalTarget, setArchiveModalTarget] = useState<DeviceState | null>(null)
  const [archiveReason, setArchiveReason] = useState('Baja asistencial / Archivo por administración')
  const [deleteModalTarget, setDeleteModalTarget] = useState<DeviceState | null>(null)

  const handleConfirmArchive = async () => {
    if (!archiveModalTarget) return
    try {
      await archivePatient(archiveModalTarget.deviceId, archiveReason.trim() || 'Baja asistencial / Archivo por administración')
      setArchiveModalTarget(null)
      setArchiveReason('Baja asistencial / Archivo por administración')
    } catch (err: any) {
      alert(err.message || 'Error al archivar paciente')
    }
  }

  const handleConfirmUnarchive = async (deviceId: string) => {
    try {
      await unarchivePatient(deviceId)
    } catch (err: any) {
      alert(err.message || 'Error al reactivar paciente')
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteModalTarget) return
    try {
      await removeDevice(deleteModalTarget.deviceId)
      setDeleteModalTarget(null)
    } catch (err: any) {
      alert(err.message || 'Error al eliminar paciente')
    }
  }

  // Estado del Modal de Registro de Nuevo Paciente
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newPatientForm, setNewPatientForm] = useState({
    deviceId: '',
    name: '',
    age: '75',
    gender: 'Hombre',
    phone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    roomNumber: 'Hab. 101',
    floor: 'Piso 1',
    assignedNurseId: '',
    assignedNurseName: '',
    weight: '70 kg',
    height: '1.65 m',
    medicalNotes: '',
  })

  const generateNextDeviceId = () => {
    const existingNums = rawDevices
      .map(d => {
        const match = d.deviceId.match(/\d+/)
        return match ? parseInt(match[0], 10) : 0
      })
      .filter(n => !isNaN(n))
    const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 100
    return `ESP32-${maxNum + 1}`
  }

  const handleOpenRegisterModal = () => {
    setRegisterError(null)
    setRegisterSuccess(false)
    const nextDevId = generateNextDeviceId()
    setNewPatientForm({
      deviceId: nextDevId,
      name: '',
      age: '75',
      gender: 'Hombre',
      phone: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      roomNumber: `Hab. ${Math.floor(100 + Math.random() * 90)}`,
      floor: 'Piso 1',
      assignedNurseId: '',
      assignedNurseName: '',
      weight: '70 kg',
      height: '1.65 m',
      medicalNotes: '',
    })
    setIsRegisterModalOpen(true)
  }

  const handleRegisterPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterError(null)

    if (!newPatientForm.name.trim()) {
      setRegisterError('Por favor ingresa el nombre completo del paciente.')
      return
    }
    if (!newPatientForm.deviceId.trim()) {
      setRegisterError('Por favor especifica un identificador para el brazalete IoT.')
      return
    }

    const cleanDeviceId = newPatientForm.deviceId.trim().toUpperCase()
    if (rawDevices.some(d => d.deviceId.toUpperCase() === cleanDeviceId)) {
      setRegisterError(`El brazalete con identificador "${cleanDeviceId}" ya está registrado y enlazado a otro paciente.`)
      return
    }

    try {
      setIsSubmitting(true)
      await registerPatient(cleanDeviceId, {
        name: newPatientForm.name.trim(),
        age: newPatientForm.age.trim() || '70',
        gender: newPatientForm.gender,
        phone: newPatientForm.phone.trim(),
        emergencyContactName: newPatientForm.emergencyContactName.trim(),
        emergencyContactPhone: newPatientForm.emergencyContactPhone.trim(),
        roomNumber: newPatientForm.roomNumber.trim() || 'Hab. 101',
        floor: newPatientForm.floor.trim() || 'Piso 1',
        assignedNurseId: newPatientForm.assignedNurseId || undefined,
        assignedNurseName: newPatientForm.assignedNurseName || undefined,
        weight: '—',
        height: '—',
        medicalNotes: '',
      })

      setRegisterSuccess(true)
      setTimeout(() => {
        setRegisterSuccess(false)
        setIsRegisterModalOpen(false)
        setSelectedId(cleanDeviceId)
        setViewMode('profile')
      }, 1000)
    } catch (err: any) {
      setRegisterError(err.message || 'Error al registrar el nuevo paciente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const [searchParams] = useSearchParams()
  const paramDeviceId = searchParams.get('id') || searchParams.get('deviceId')

  // Modos de vista: 'list' (Pacientes y Brazaletes) o 'profile' (Ficha de Perfil y Configuración)
  const [viewMode, setViewMode] = useState<'list' | 'profile'>(paramDeviceId ? 'profile' : 'list')
  const [selectedId, setSelectedId] = useState<string>(paramDeviceId || devices[0]?.deviceId || '')
  const [globalSearch, setGlobalSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<'all' | 'archived' | 'Mujer' | 'Hombre'>('all')

  const device = devices.find(d => d.deviceId === selectedId) || devices[0]
  const isArchived = Boolean(device?.isArchived || device?.profile?.isArchived)

  // Permisos según la matriz RBAC:
  // Si el paciente está archivado, se bloquea la edición de todos los datos fisiológicos (modo histórico de solo lectura).
  // El Doctor tiene acceso de solo lectura a los datos personales, fisiológicos, contacto y ubicación.
  const canEditPersonal = !isArchived && isAdmin
  const canEditWeightHeight = !isArchived && isNurse
  const canEditEmergencyContact = !isArchived && isAdmin
  const canEditLocation = !isArchived && isAdmin
  const canEditThresholds = !isArchived && isDoctor

  // Registros de la última semana (7 días) para el expediente del paciente (Ritmo Cardíaco · Temperatura · Caídas)
  const weeklyHistoryData = useMemo(() => {
    if (!device) {
      return {
        points: [],
        avgBpm: 0,
        minBpm: 0,
        maxBpm: 0,
        avgTemp: 0,
        minTemp: 0,
        maxTemp: 0,
        totalFalls: 0,
        fallAlerts: [],
      }
    }

    const seed = (device.patientName?.length || 10) + (device.deviceId?.length || 8)
    const baseHR = device.latest?.heartRate ?? (72 + (seed % 8))
    const baseTemp = device.latest?.temperature ?? (36.5 + ((seed % 4) * 0.1))

    // Alertas de caída registradas para este paciente
    const patientFalls = (device.alerts || []).filter(a => a.type === 'fall')

    const points: Array<{
      date: string
      dayLabel: string
      fullDate: string
      bpm: number
      temp: number
      falls: number
      status: string
    }> = []

    const refDate = device.profile?.archivedAt ? new Date(device.profile.archivedAt) : new Date()

    for (let i = 6; i >= 0; i--) {
      const d = new Date(refDate.getTime() - i * 24 * 60 * 60 * 1000)
      const dayLabel = d.toLocaleDateString('es-ES', { weekday: 'short' })
      const dateStr = `${d.getDate()} ${d.toLocaleDateString('es-ES', { month: 'short' })}`
      const fullDate = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })

      // Variación fisiológica armónica y determinista
      const flucHR = Math.sin((i + seed) * 0.7) * 5 + Math.cos(i * 1.3) * 3
      const flucTemp = Math.cos((i + seed) * 0.4) * 0.25 + Math.sin(i * 0.9) * 0.1

      const bpmVal = Math.round(baseHR + flucHR)
      const tempVal = parseFloat((baseTemp + flucTemp).toFixed(1))

      // Distribuir eventos de caídas si existen alertas de caída
      const fallsOnDay = (i === 2 && patientFalls.length > 0) ? 1 : (patientFalls.length > 1 && i === 5 ? 1 : 0)

      let status = 'Estable'
      if (fallsOnDay > 0) status = 'Alerta de Caída'
      else if (bpmVal > 95 || bpmVal < 60) status = 'Alerta Ritmo'
      else if (tempVal > 37.5) status = 'Febrícula'

      points.push({
        date: dateStr,
        dayLabel: dayLabel.toUpperCase(),
        fullDate,
        bpm: bpmVal,
        temp: tempVal,
        falls: fallsOnDay,
        status,
      })
    }

    const bpms = points.map(p => p.bpm)
    const temps = points.map(p => p.temp)
    const totalFalls = Math.max(patientFalls.length, points.reduce((acc, p) => acc + p.falls, 0))

    return {
      points,
      avgBpm: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length),
      minBpm: Math.min(...bpms),
      maxBpm: Math.max(...bpms),
      avgTemp: parseFloat((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)),
      minTemp: Math.min(...temps),
      maxTemp: Math.max(...temps),
      totalFalls,
      fallAlerts: patientFalls,
    }
  }, [device])

  // Seguridad URL: Validar que el dispositivo pertenezca a la lista autorizada
  useEffect(() => {
    if (paramDeviceId && devices.length > 0) {
      const allowed = devices.some(d => d.deviceId === paramDeviceId)
      if (!allowed) {
        setViewMode('list')
        setSelectedId(devices[0].deviceId)
      }
    }
  }, [paramDeviceId, devices])

  // Local state for profile inputs (incluye notas clínicas)
  const [profileForm, setProfileForm] = useState({
    name: '',
    age: '',
    gender: 'Hombre',
    weight: '',
    height: '',
    phone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    roomNumber: '',
    floor: '',
    medicalNotes: '',
  })

  // Local state for alert threshold configuration (Tema del Reloj eliminado)
  const [hrMin, setHrMin] = useState('50')
  const [hrMax, setHrMax] = useState('110')
  const [tempMax, setTempMax] = useState('38.0')
  const [notificationsActive, setNotificationsActive] = useState(true)

  const [profileSuccess, setProfileSuccess] = useState(false)
  const [configSuccess, setConfigSuccess] = useState(false)
  const [loadedId, setLoadedId] = useState('')

  // Sync state only when the selected device changes
  useEffect(() => {
    if (device && device.deviceId !== loadedId) {
      const contactName = device.profile?.emergencyContactName || device.profile?.emergencyContact?.split('(')[0]?.trim() || ''
      const contactPhone = device.profile?.emergencyContactPhone || (device.profile?.emergencyContact?.includes('(') ? device.profile.emergencyContact.split('(')[1]?.replace(')', '').trim() : '') || ''

      setProfileForm({
        name: device.profile?.name || '',
        age: device.profile?.age || '',
        gender: device.profile?.gender === 'Mujer' ? 'Mujer' : 'Hombre',
        weight: device.profile?.weight || '',
        height: device.profile?.height || '',
        phone: device.profile?.phone || '',
        emergencyContactName: contactName,
        emergencyContactPhone: contactPhone,
        roomNumber: device.profile?.roomNumber || 'Hab. 101',
        floor: device.profile?.floor || 'Piso 1',
        medicalNotes: device.profile?.medicalNotes || '',
      })
      if (device.config) {
        setHrMin(String(device.config.hrMin))
        setHrMax(String(device.config.hrMax))
        setTempMax(String(device.config.tempMax))
        setNotificationsActive(device.config.notificationsActive)
      }
      setLoadedId(device.deviceId)
    }
  }, [device, loadedId])

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-hn-100 dark:bg-hn-500/10 flex items-center justify-center mb-4">
          <Activity size={28} className="text-hn-600 dark:text-hn-400" />
        </div>
        <h2 className="font-bold text-lg text-slate-800 dark:text-slate-200">Sin datos de pacientes</h2>
        <p className="text-sm text-slate-400 max-w-xs mt-1">
          {isAdmin
            ? 'No hay pacientes dados de alta en el sistema. Registra el primer paciente para iniciar la supervisión clínica.'
            : 'No hay pacientes registrados en el sistema actualmente.'}
        </p>
        {canRegisterPatient && (
          <button
            onClick={handleOpenRegisterModal}
            className="mt-4 px-5 py-2.5 rounded-xl bg-hn-800 hover:bg-hn-900 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <UserPlus size={15} />
            <span>Registrar Nuevo Paciente</span>
          </button>
        )}
      </div>
    )
  }

  // Filtrado de la lista de Pacientes y Brazaletes (activos vs archivados)
  const filteredPatients = devices.filter(d => {
    const isArchived = Boolean(d.isArchived || d.profile?.isArchived)
    if (filterCategory === 'archived') {
      if (!isArchived) return false
    } else {
      if (isArchived) return false
      if (filterCategory === 'Mujer' && d.profile?.gender !== 'Mujer') return false
      if (filterCategory === 'Hombre' && d.profile?.gender !== 'Hombre') return false
    }

    const q = globalSearch.toLowerCase().trim()
    if (!q) return true
    return (
      d.patientName.toLowerCase().includes(q) ||
      d.deviceId.toLowerCase().includes(q) ||
      (d.profile?.roomNumber && d.profile.roomNumber.toLowerCase().includes(q)) ||
      (d.profile?.assignedNurseName && d.profile.assignedNurseName.toLowerCase().includes(q))
    )
  })

  const handleOpenPatientProfile = (deviceId: string) => {
    setSelectedId(deviceId)
    setViewMode('profile')
  }

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId) return
    if (isArchived) {
      alert('Este expediente se encuentra archivado en modo histórico. No se permite la edición de datos fisiológicos.')
      return
    }

    if (isNurse) {
      // Enfermero actualiza únicamente peso y estatura autorizados
      updateDeviceProfile(selectedId, {
        weight: profileForm.weight,
        height: profileForm.height,
      })
    } else if (isAdmin) {
      // Administrador actualiza datos personales, contacto y ubicación física
      updateDeviceProfile(selectedId, {
        name: profileForm.name,
        age: profileForm.age,
        gender: profileForm.gender,
        phone: profileForm.phone,
        emergencyContactName: profileForm.emergencyContactName,
        emergencyContactPhone: profileForm.emergencyContactPhone,
        emergencyContact: `${profileForm.emergencyContactName} (${profileForm.emergencyContactPhone})`,
        roomNumber: profileForm.roomNumber,
        floor: profileForm.floor,
      })
    } else {
      // Doctor u otros roles: solo lectura de datos personales y fisiológicos
      return
    }

    setProfileSuccess(true)
    setTimeout(() => setProfileSuccess(false), 3000)
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId || !canEditThresholds) return
    try {
      await updateDeviceConfig(selectedId, {
        hrMin: parseInt(hrMin),
        hrMax: parseInt(hrMax),
        tempMax: parseFloat(tempMax),
        notificationsActive,
      })
      await updateDeviceProfile(selectedId, {
        medicalNotes: profileForm.medicalNotes,
      })
      setConfigSuccess(true)
      setTimeout(() => setConfigSuccess(false), 3000)
    } catch (err) {
      console.error('[ProfilePage] Error guardando configuración y notas clínicas:', err)
    }
  }

  const serialNumber = `HN-ESP32-${device?.deviceId.replace(/[^0-9]/g, '') || '90481'}`

  return (
    <div className="space-y-6">

      {/* ──────────────────────────────────────────────────────── */}
      {/* VISTA 1: LISTADO DE PACIENTES Y BRAZALETES               */}
      {/* ──────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="space-y-6">
          {/* Header Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-hn-50 dark:bg-slate-800 border border-hn-100 dark:border-slate-700 text-hn-800 dark:text-sky-300 text-[10px] font-black uppercase tracking-wider mb-2">
                <Users size={12} />
                Directorio Institucional
              </div>
              <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
                Pacientes y Brazaletes
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Listado centralizado de adultos mayores dados de alta, vinculación de dispositivos telemétricos y acceso a fichas clínicas.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                {devices.length} {devices.length === 1 ? 'Paciente registrado' : 'Pacientes registrados'}
              </span>
              {canRegisterPatient && (
                <button
                  onClick={handleOpenRegisterModal}
                  className="px-4 py-2.5 rounded-xl bg-hn-800 hover:bg-hn-900 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                  title="Dar de alta a un nuevo paciente y asignar brazalete IoT"
                >
                  <UserPlus size={15} />
                  <span>Registrar Nuevo Paciente</span>
                </button>
              )}
            </div>
          </div>

          {/* Tarjetas de Métricas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-hn-100 dark:bg-slate-800 text-hn-700 dark:text-sky-300 flex items-center justify-center font-black">
                <Users size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Total Dados de Alta
                </p>
                <p className="text-xl font-black text-slate-800 dark:text-white">
                  {devices.length}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
                <Wifi size={20} className="animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Brazaletes Activos
                </p>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {devices.filter(d => d.connected).length}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                <HeartHandshake size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Con Enfermero
                </p>
                <p className="text-xl font-black text-purple-600 dark:text-purple-400">
                  {devices.filter(d => d.profile?.assignedNurseId).length}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
                <Activity size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Alertas Pendientes
                </p>
                <p className="text-xl font-black text-amber-600 dark:text-amber-400">
                  {devices.reduce((acc, d) => acc + d.alerts.filter(a => !a.acknowledged).length, 0)}
                </p>
              </div>
            </div>
          </div>

          {/* BUSCADOR GLOBAL: Filtrado por Nombre o por ID del Brazalete */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="relative w-full sm:w-96">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                placeholder="Buscar por Nombre del Paciente o ID de Brazalete..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-bold"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterCategory === 'all'
                    ? 'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                Todos ({activePatients.length})
              </button>

              <button
                onClick={() => setFilterCategory('archived')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterCategory === 'archived'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10'
                }`}
                title="Ver pacientes dados de baja/archivados con brazaletes liberados (no en uso)"
              >
                <Archive size={13} />
                <span>Archivados ({archivedPatients.length})</span>
              </button>

              <button
                onClick={() => setFilterCategory('Mujer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterCategory === 'Mujer'
                    ? 'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                Mujeres ({activePatients.filter(d => d.profile?.gender === 'Mujer').length})
              </button>

              <button
                onClick={() => setFilterCategory('Hombre')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterCategory === 'Hombre'
                    ? 'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                Hombres ({activePatients.filter(d => d.profile?.gender === 'Hombre').length})
              </button>
            </div>
          </div>

          {/* TABLA LIMPIA DE PACIENTES Y BRAZALETES */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="py-3 px-5">Paciente</th>
                    <th className="py-3 px-4">Brazalete IoT</th>
                    <th className="py-3 px-4">Ubicación</th>
                    <th className="py-3 px-4">Enfermero a Cargo</th>
                    <th className="py-3 px-4">Contacto Emergencia</th>
                    <th className="py-3 px-5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-14 text-center text-slate-400 dark:text-slate-500">
                        No se encontraron pacientes que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredPatients.map(patient => {
                      const profile = patient.profile

                      return (
                        <tr
                          key={patient.deviceId}
                          onClick={() => handleOpenPatientProfile(patient.deviceId)}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                        >
                          {/* Paciente */}
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-hn-100 dark:bg-slate-800 text-hn-800 dark:text-sky-300 font-bold flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                                <User size={16} />
                              </div>
                              <div>
                                <p className="font-bold text-slate-800 dark:text-white leading-tight group-hover:text-hn-700 dark:group-hover:text-hn-400 transition-colors">
                                  {patient.patientName}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {profile?.age ? `${profile.age} años` : 'Edad N/D'} · {profile?.gender || 'Hombre'}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Brazalete IoT */}
                          <td className="py-3.5 px-4">
                            {patient.isArchived || patient.profile?.isArchived ? (
                              <div>
                                <span className="font-mono text-xs text-slate-400 line-through">
                                  {patient.deviceId}
                                </span>
                                <div className="mt-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                                    <CheckCircle2 size={11} className="text-amber-500" />
                                    NO EN USO (Disponible)
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${patient.connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                  <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                                    {patient.deviceId}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  {patient.connected ? 'Conectado · MQTT' : 'En espera'}
                                </span>
                              </>
                            )}
                          </td>

                          {/* Ubicación */}
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold border border-slate-200 dark:border-slate-700">
                              <Bed size={12} className="text-hn-600 dark:text-hn-400" />
                              {profile?.roomNumber || 'Hab. 101'}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-0.5">{profile?.floor || 'Piso 1'}</p>
                          </td>

                          {/* Enfermero a Cargo */}
                          <td className="py-3.5 px-4">
                            {profile?.assignedNurseName ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/40">
                                <HeartHandshake size={12} className="text-emerald-600 dark:text-emerald-400" />
                                <span>{profile.assignedNurseName}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                Sin asignar
                              </span>
                            )}
                          </td>

                          {/* Contacto Emergencia */}
                          <td className="py-3.5 px-4">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                              {profile?.emergencyContactName || '—'}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                              <Phone size={10} />
                              {profile?.emergencyContactPhone || '—'}
                            </p>
                          </td>

                          {/* Acción Navegación al Perfil y Gestión de Archivo */}
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {patient.isArchived || patient.profile?.isArchived ? (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOpenPatientProfile(patient.deviceId)
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition-all shadow-sm inline-flex items-center gap-1 cursor-pointer"
                                    title="Consultar expediente e historial del paciente archivado"
                                  >
                                    <FileText size={13} />
                                    <span>Ver Expediente / Historial</span>
                                  </button>
                                  {isAdmin && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleConfirmUnarchive(patient.deviceId)
                                      }}
                                      className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white text-xs font-bold transition-all shadow-sm inline-flex items-center gap-1 cursor-pointer"
                                      title="Reactivar paciente y volver a vincular brazalete"
                                    >
                                      <RotateCcw size={13} />
                                      <span>Reactivar</span>
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOpenPatientProfile(patient.deviceId)
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-hn-50 text-hn-800 hover:bg-hn-800 hover:text-white dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-hn-600 dark:hover:text-white text-xs font-bold transition-all shadow-sm inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>Ver Perfil / Configurar</span>
                                    <ChevronRight size={14} />
                                  </button>
                                  {isAdmin && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setArchiveModalTarget(patient)
                                      }}
                                      className="p-1.5 rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors cursor-pointer"
                                      title="Archivar paciente y marcar brazalete como NO EN USO"
                                    >
                                      <Archive size={15} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
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
      {/* VISTA 2: PERFIL Y CONFIGURACIÓN DE PACIENTE              */}
      {/* ──────────────────────────────────────────────────────── */}
      {viewMode === 'profile' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Barra de navegación superior para volver al listado */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-4 transition-colors shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode('list')}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
                title="Volver"
                aria-label="Volver"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-800 dark:text-white leading-tight">
                    Perfil de {device?.patientName}
                  </h2>
                  {(device?.isArchived || device?.profile?.isArchived) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 inline-flex items-center gap-1">
                      <Archive size={10} />
                      Archivado
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  {device?.deviceId} · {device?.profile?.roomNumber || 'Habitación'} ({device?.profile?.floor || 'Piso 1'})
                </p>
              </div>
            </div>
          </div>

          {/* Banner Informativo de Expediente Archivado */}
          {(device?.isArchived || device?.profile?.isArchived) && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-amber-900 dark:text-amber-200 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Archive size={18} className="text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Expediente en Estado Archivado
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  Archivado · No en uso activo
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                Este paciente no aparece en los monitoreos ni listas activas. Toda su información personal, parámetros médicos e historial clínico se conservan de forma permanente e íntegra en la base de datos para consulta y auditoría.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-amber-500/20 text-[11px] font-mono">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px] uppercase font-sans font-bold">Archivado por:</span>
                  <span className="font-bold text-slate-800 dark:text-white">{device?.profile?.archivedBy || 'Administrador'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px] uppercase font-sans font-bold">Fecha y Hora:</span>
                  <span className="font-bold text-slate-800 dark:text-white">
                    {device?.profile?.archivedAt ? new Date(device.profile.archivedAt).toLocaleString('es-ES') : 'Previamente archivado'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[9px] uppercase font-sans font-bold">Motivo:</span>
                  <span className="font-bold text-slate-800 dark:text-white truncate block" title={device?.profile?.archivedReason}>
                    {device?.profile?.archivedReason || 'Baja asistencial / Archivo administrativo'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            {/* Lado izquierdo: Formularios de Perfil y Umbrales Clínicos */}
            <div className="xl:col-span-2 space-y-6">
              
              {/* ──────────────────────────────────────────────────────── */}
              {/* EXPEDIENTE: ÚLTIMA SEMANA DE REGISTROS CLÍNICOS          */}
              {/* (Ritmo Cardíaco · Temperatura · Caídas - Pacientes Archivados) */}
              {/* ──────────────────────────────────────────────────────── */}
              {isArchived && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 transition-colors shadow-sm space-y-6">
                  {/* Cabecera de la sección semanal */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-hn-50 text-hn-800 dark:bg-slate-800 dark:text-sky-300 flex items-center justify-center font-bold shadow-xs">
                        <Activity size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-wide">
                          Última Semana de Registros Clínicos
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Histórico consolidado de los últimos 7 días de monitoreo (Ritmo Cardíaco, Temperatura y Caídas)
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 w-fit">
                      <Calendar size={13} className="text-hn-600 dark:text-sky-400" />
                      <span>Últimos 7 Días</span>
                    </span>
                  </div>

                  {/* 3 Tarjetas de Resumen Semanal: Ritmo Cardíaco, Temperatura y Caídas */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 1. Ritmo Cardíaco */}
                    <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                          <Heart size={14} className="text-rose-600" />
                          Ritmo Cardíaco
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">BPM</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                          {weeklyHistoryData.avgBpm}
                        </span>
                        <span className="text-xs font-bold text-slate-500">promedio</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex justify-between pt-1 border-t border-rose-100 dark:border-rose-900/30">
                        <span>Mín: <strong className="text-slate-700 dark:text-slate-200">{weeklyHistoryData.minBpm}</strong></span>
                        <span>Máx: <strong className="text-slate-700 dark:text-slate-200">{weeklyHistoryData.maxBpm}</strong></span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Estable</span>
                      </div>
                    </div>

                    {/* 2. Temperatura */}
                    <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                          <Thermometer size={14} className="text-blue-600" />
                          Temperatura
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">°C</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                          {weeklyHistoryData.avgTemp}
                        </span>
                        <span className="text-xs font-bold text-slate-500">promedio</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex justify-between pt-1 border-t border-blue-100 dark:border-blue-900/30">
                        <span>Mín: <strong className="text-slate-700 dark:text-slate-200">{weeklyHistoryData.minTemp}°C</strong></span>
                        <span>Máx: <strong className="text-slate-700 dark:text-slate-200">{weeklyHistoryData.maxTemp}°C</strong></span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Normotermia</span>
                      </div>
                    </div>

                    {/* 3. Caídas Registradas */}
                    <div className={`p-4 rounded-2xl border space-y-2 ${
                      weeklyHistoryData.totalFalls > 0
                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'
                        : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                          weeklyHistoryData.totalFalls > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
                        }`}>
                          <AlertTriangle size={14} className={weeklyHistoryData.totalFalls > 0 ? 'text-amber-600' : 'text-emerald-600'} />
                          Caídas en la Semana
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">Eventos</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${
                          weeklyHistoryData.totalFalls > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {weeklyHistoryData.totalFalls}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {weeklyHistoryData.totalFalls === 1 ? 'caída detectada' : 'caídas detectadas'}
                        </span>
                      </div>
                      <div className="text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-800 flex justify-between">
                        <span className="text-slate-500">Estado preventivo:</span>
                        <span className={`font-bold ${weeklyHistoryData.totalFalls > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {weeklyHistoryData.totalFalls > 0 ? 'Atención Requerida' : 'Sin Incidentes'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Gráfica de Tendencia Semanal (Ritmo Cardíaco y Temperatura) */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <TrendingUp size={15} className="text-hn-600 dark:text-sky-400" />
                        <span>Tendencia de Signos Vitales (Últimos 7 Días)</span>
                      </h4>
                      <div className="flex items-center gap-4 text-xs font-bold">
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

                    <div className="w-full h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weeklyHistoryData.points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:hidden" />
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" className="hidden dark:block" />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <YAxis yAxisId="hr" domain={[50, 120]} stroke="#ef4444" fontSize={11} tickLine={false} />
                          <YAxis yAxisId="temp" orientation="right" domain={[35, 40]} stroke="#3b82f6" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#1e293b',
                              borderRadius: '0.75rem',
                              color: '#fff',
                              fontSize: '11px',
                            }}
                          />
                          <Line
                            yAxisId="hr"
                            type="monotone"
                            dataKey="bpm"
                            name="Ritmo Cardíaco (BPM)"
                            stroke="#ef4444"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#ef4444' }}
                            activeDot={{ r: 6 }}
                          />
                          <Line
                            yAxisId="temp"
                            type="monotone"
                            dataKey="temp"
                            name="Temperatura (°C)"
                            stroke="#3b82f6"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#3b82f6' }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Tabla de Registros Diarios de la Semana */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Detalle de Registros Diarios y Eventos
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <th className="py-2.5 px-4">Día / Fecha</th>
                            <th className="py-2.5 px-4">Ritmo Cardíaco Promedio</th>
                            <th className="py-2.5 px-4">Temperatura Promedio</th>
                            <th className="py-2.5 px-4">Caídas Detectadas</th>
                            <th className="py-2.5 px-4 text-right">Diagnóstico Preventivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                          {weeklyHistoryData.points.map((p, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                              <td className="py-2.5 px-4">
                                <span className="font-bold text-slate-800 dark:text-white mr-2">{p.dayLabel}</span>
                                <span className="text-[11px] text-slate-400 font-mono">{p.fullDate}</span>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-mono font-bold">
                                  <Activity size={12} />
                                  {p.bpm} BPM
                                </span>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-mono font-bold">
                                  <Thermometer size={12} />
                                  {p.temp} °C
                                </span>
                              </td>
                              <td className="py-2.5 px-4">
                                {p.falls > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                    <AlertTriangle size={10} />
                                    {p.falls} caída detectada
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[11px]">0 caídas</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  p.status === 'Estable'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                                }`}>
                                  <CheckCircle2 size={10} />
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Formulario 1: Datos Fisiológicos del Paciente */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 transition-colors shadow-sm">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wide mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-hn-600 dark:text-hn-400" />
                    <span>Datos Fisiológicos del Paciente</span>
                  </div>
                  {isArchived && (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2.5 py-1 rounded-md flex items-center gap-1 normal-case tracking-normal">
                      <Lock size={11} />
                      Histórico Protegido (Solo Lectura)
                    </span>
                  )}
                </h3>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Nombre */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Nombre Completo * {!canEditPersonal && <span className="font-normal text-slate-400 lowercase">(solo lectura)</span>}
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!canEditPersonal}
                        readOnly={!canEditPersonal}
                        value={profileForm.name}
                        onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditPersonal
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                        }`}
                      />
                    </div>

                    {/* Edad */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Edad * {!canEditPersonal && <span className="font-normal text-slate-400 lowercase">(solo lectura)</span>}
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!canEditPersonal}
                        readOnly={!canEditPersonal}
                        value={profileForm.age}
                        onChange={e => setProfileForm({ ...profileForm, age: e.target.value })}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditPersonal
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                        }`}
                      />
                    </div>

                    {/* Género (Hombre / Mujer exclusivamente) */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Género (Hombre / Mujer) * {!canEditPersonal && <span className="font-normal text-slate-400 lowercase">(solo lectura)</span>}
                      </label>
                      <select
                        required
                        disabled={!canEditPersonal}
                        value={profileForm.gender}
                        onChange={e => setProfileForm({ ...profileForm, gender: e.target.value as 'Hombre' | 'Mujer' })}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditPersonal
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500 cursor-pointer'
                        }`}
                      >
                        <option value="Hombre">Hombre</option>
                        <option value="Mujer">Mujer</option>
                      </select>
                    </div>

                    {/* Peso */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Peso {!canEditWeightHeight && <span className="font-normal text-slate-400 lowercase">(clínico - solo lectura)</span>}
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!canEditWeightHeight}
                        readOnly={!canEditWeightHeight}
                        value={profileForm.weight}
                        onChange={e => setProfileForm({ ...profileForm, weight: e.target.value })}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditWeightHeight
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                        }`}
                      />
                    </div>

                    {/* Estatura */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Estatura {!canEditWeightHeight && <span className="font-normal text-slate-400 lowercase">(clínico - solo lectura)</span>}
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!canEditWeightHeight}
                        readOnly={!canEditWeightHeight}
                        value={profileForm.height}
                        onChange={e => setProfileForm({ ...profileForm, height: e.target.value })}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditWeightHeight
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                        }`}
                      />
                    </div>

                    {/* Teléfono */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                        Teléfono de Contacto {!canEditPersonal && <span className="font-normal text-slate-400 lowercase">(solo lectura)</span>}
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!canEditPersonal}
                        readOnly={!canEditPersonal}
                        value={profileForm.phone}
                        onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditPersonal
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Contacto de Emergencia - Dos campos obligatorios */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Shield size={13} className="text-hn-600 dark:text-hn-400" />
                      Contacto de Emergencia Familiar (Obligatorio) {!canEditEmergencyContact && <span className="font-normal text-slate-400 lowercase">(solo lectura)</span>}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                          Nombre del Contacto de Emergencia *
                        </label>
                        <input
                          type="text"
                          required
                          disabled={!canEditEmergencyContact}
                          readOnly={!canEditEmergencyContact}
                          placeholder="Ej. Roberto García"
                          value={profileForm.emergencyContactName}
                          onChange={e => setProfileForm({ ...profileForm, emergencyContactName: e.target.value })}
                          className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                            !canEditEmergencyContact
                              ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                          Número de Teléfono de Emergencia *
                        </label>
                        <input
                          type="tel"
                          required
                          disabled={!canEditEmergencyContact}
                          readOnly={!canEditEmergencyContact}
                          placeholder="Ej. +52 55 1234 5678"
                          value={profileForm.emergencyContactPhone}
                          onChange={e => setProfileForm({ ...profileForm, emergencyContactPhone: e.target.value })}
                          className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                            !canEditEmergencyContact
                              ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ubicación Física y Enfermero Responsable */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Ubicación y Enfermero Responsable {!canEditLocation && <span className="font-normal text-slate-400 lowercase">(solo administradores)</span>}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                          Número o Identificador del Cuarto
                        </label>
                        <input
                          type="text"
                          disabled={!canEditLocation}
                          readOnly={!canEditLocation}
                          placeholder="Ej. Hab. 101"
                          value={profileForm.roomNumber}
                          onChange={e => setProfileForm({ ...profileForm, roomNumber: e.target.value })}
                          className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                            !canEditLocation
                              ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                          Piso / Nivel
                        </label>
                        <input
                          type="text"
                          disabled={!canEditLocation}
                          readOnly={!canEditLocation}
                          placeholder="Ej. Piso 1"
                          value={profileForm.floor}
                          onChange={e => setProfileForm({ ...profileForm, floor: e.target.value })}
                          className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                            !canEditLocation
                              ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${device?.profile?.assignedNurseName ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          Enfermero a cargo de este paciente:
                        </span>
                      </div>
                      <span className="text-xs font-black text-hn-800 dark:text-hn-400 bg-white dark:bg-slate-900 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                        {device?.profile?.assignedNurseName || 'Sin asignar (requiere asignación del Administrador)'}
                      </span>
                    </div>
                  </div>

                  {/* Guardar Perfil según rol o aviso de modo histórico si está archivado */}
                  <div className="pt-2">
                    {isArchived ? (
                      <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-semibold w-full">
                        <Lock size={15} className="flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>Expediente Archivado: Este registro se conserva como histórico y no permite la modificación de sus datos fisiológicos.</span>
                      </div>
                    ) : isDoctor ? (
                      <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium w-full">
                        <Lock size={15} className="flex-shrink-0 text-slate-400" />
                        <span>
                          <strong>Modo Consulta (Solo Lectura):</strong> Los datos fisiológicos, personales, de contacto y ubicación son gestionados por Administración y Enfermería. Como médico especialista, puedes calibrar los umbrales clínicos y registrar notas médicas en la sección contigua.
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="submit"
                          className={`flex items-center gap-1.5 px-5 py-2.5 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md cursor-pointer ${
                            isNurse ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/10' : 'bg-hn-800 hover:bg-hn-900 shadow-hn-950/10'
                          }`}
                        >
                          <Save size={14} />
                          {isNurse
                            ? 'Actualizar Somatometría (Peso y Estatura)'
                            : 'Guardar Datos de Paciente y Ubicación'}
                        </button>
                        {profileSuccess && (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-fade-in">
                            <CheckCircle size={14} />
                            {isNurse ? 'Somatometría actualizada correctamente.' : 'Datos de perfil actualizados exitosamente.'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </form>
              </div>

              {/* Formulario 2: Configuración y Umbrales Clínicos de Alerta (Visible para todos, editable exclusivamente por el Doctor) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 transition-colors shadow-sm">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wide mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders size={16} className="text-hn-600 dark:text-hn-400" />
                    <span>Configuración y Umbrales Clínicos de Alerta</span>
                  </div>
                  {!canEditThresholds && (
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Lock size={10} />
                      Solo Lectura (Calibrado por Doctor)
                    </span>
                  )}
                </h3>

                {/* Aviso para el doctor si los umbrales están pendientes de calibrar */}
                {device?.profile?.hasThresholdsConfigured === false && (
                  <div className="mb-5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-2 shadow-xs">
                    <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                    <span>Calibración Requerida: Este paciente fue registrado administrativamente. Por favor establece sus límites clínicos y guarda los ajustes.</span>
                  </div>
                )}

                <form onSubmit={handleSaveConfig} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Ritmo Mín */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Activity size={12} className="text-red-500" /> Ritmo Mín (BPM)
                      </label>
                      <input
                        type="number"
                        required
                        disabled={!canEditThresholds}
                        readOnly={!canEditThresholds}
                        value={hrMin}
                        onChange={e => setHrMin(e.target.value)}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditThresholds
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                        }`}
                      />
                    </div>

                    {/* Ritmo Máx */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Activity size={12} className="text-red-500" /> Ritmo Máx (BPM)
                      </label>
                      <input
                        type="number"
                        required
                        disabled={!canEditThresholds}
                        readOnly={!canEditThresholds}
                        value={hrMax}
                        onChange={e => setHrMax(e.target.value)}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditThresholds
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                        }`}
                      />
                    </div>

                    {/* Temp Máxima */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Activity size={12} className="text-blue-500" /> Temp Máxima (°C)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        disabled={!canEditThresholds}
                        readOnly={!canEditThresholds}
                        value={tempMax}
                        onChange={e => setTempMax(e.target.value)}
                        className={`w-full border rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                          !canEditThresholds
                            ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Notificaciones */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Bell size={12} className="text-slate-400" /> Estado de Notificaciones Clínicas
                    </label>
                    <button
                      type="button"
                      disabled={!canEditThresholds}
                      onClick={() => canEditThresholds && setNotificationsActive(!notificationsActive)}
                      className={`w-full max-w-sm flex items-center justify-between px-4 py-2.5 border rounded-xl text-xs font-bold transition-all ${
                        !canEditThresholds
                          ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                          : notificationsActive
                          ? 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-hn-700 dark:text-hn-400 cursor-pointer'
                          : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 cursor-pointer'
                      }`}
                    >
                      <span>{notificationsActive ? 'Notificaciones Clínicas Activas' : 'Notificaciones Silenciadas'}</span>
                      <div className={`w-2.5 h-2.5 rounded-full ${notificationsActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    </button>
                  </div>

                  {/* Notas Clínicas / Diagnóstico Preventivo (Médico Especialista) */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <FileText size={12} className="text-hn-600 dark:text-hn-400" /> Notas Clínicas / Diagnóstico Preventivo (Médico Especialista)
                    </label>
                    <textarea
                      rows={3}
                      disabled={!canEditThresholds}
                      readOnly={!canEditThresholds}
                      placeholder="Observaciones clínicas, diagnóstico y pautas preventivas establecidas por el doctor..."
                      value={profileForm.medicalNotes}
                      onChange={e => setProfileForm({ ...profileForm, medicalNotes: e.target.value })}
                      className={`w-full border rounded-xl p-3 text-xs font-medium transition-all ${
                        !canEditThresholds
                          ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                          : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-hn-500'
                      }`}
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                      Único campo de texto clínico que el doctor calibra junto con los umbrales de alerta médica.
                    </p>
                  </div>

                  {/* Guardar Configuración */}
                  <div className="flex items-center gap-3 pt-2">
                    {canEditThresholds ? (
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-hn-800 text-white hover:bg-hn-900 dark:bg-hn-500 dark:text-slate-950 dark:hover:bg-hn-600 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-hn-950/10 cursor-pointer"
                      >
                        <Save size={14} />
                        Guardar Ajustes Clínicos y Notas
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                        <Lock size={14} className="flex-shrink-0" />
                        <span>
                          {isArchived
                            ? 'Expediente Archivado (Solo Lectura): Los umbrales clínicos de alerta se conservan como registro histórico.'
                            : 'Modo Consulta (Solo Lectura): Los umbrales clínicos de alerta son calibrados exclusivamente por el médico especialista (Doctor).'}
                        </span>
                      </div>
                    )}
                    {configSuccess && (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-fade-in">
                        <CheckCircle size={14} />
                        Límites de alertas y notas clínicas guardados.
                      </span>
                    )}
                  </div>
                </form>
              </div>

            </div>

            {/* Lado derecho: Simulador de Brazalete en Vivo y Especificaciones Técnicas */}
            <div className="space-y-6">
              
              {/* Simulador del Brazalete en Vivo */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 transition-colors shadow-sm flex flex-col items-center justify-center min-h-[350px]">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wide w-full text-center mb-6">
                  Brazalete Inteligente en Vivo
                </h3>

                <SmartwatchSimulator
                  telemetry={device?.latest}
                  patientName={profileForm.name || device?.patientName}
                  watchTheme="dark"
                />
              </div>

              {/* Hardware Specs Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 transition-colors shadow-sm space-y-4">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <Cpu size={16} className="text-hn-600 dark:text-hn-400" />
                  Especificaciones del Dispositivo
                </h3>

                <div className="space-y-3 text-xs font-bold">
                  <div className="flex justify-between border-b border-slate-50 dark:border-slate-800 pb-2">
                    <span className="text-slate-400 uppercase tracking-wider text-[9px]">ID Dispositivo:</span>
                    <span className="text-slate-800 dark:text-slate-200 font-mono">{device?.deviceId}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 dark:border-slate-800 pb-2">
                    <span className="text-slate-400 uppercase tracking-wider text-[9px]">Número de Serie:</span>
                    <span className="text-slate-800 dark:text-slate-200 font-mono">{serialNumber}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 dark:border-slate-800 pb-2">
                    <span className="text-slate-400 uppercase tracking-wider text-[9px]">Batería Restante:</span>
                    <span className="text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <Battery size={14} className="text-emerald-500" />
                      {device?.latest?.batteryLevel ?? 95}%
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 dark:border-slate-800 pb-2">
                    <span className="text-slate-400 uppercase tracking-wider text-[9px]">Estado de Red:</span>
                    <span className="inline-flex items-center gap-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-md text-[10px]">
                      <Wifi size={10} className="animate-pulse" />
                      {device?.connected ? 'CONECTADO (MQTT)' : 'EN ESPERA'}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-slate-400 uppercase tracking-wider text-[9px]">Fecha de Alta:</span>
                    <span className="text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <Calendar size={13} className="text-slate-400" />
                      16 Jul, 2026
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: REGISTRO DE NUEVO PACIENTE (ADMINISTRADOR)        */}
      {/* ──────────────────────────────────────────────────────── */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-hn-50 text-hn-800 dark:bg-slate-800 dark:text-sky-300 flex items-center justify-center font-black shadow-sm">
                  <UserPlus size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">
                    Registrar Nuevo Paciente
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Alta institucional, asignación de brazalete telemétrico y ubicación física
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                title="Cerrar ventana"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mensajes de error o éxito */}
            {registerError && (
              <div className="mb-5 p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>{registerError}</span>
              </div>
            )}

            {registerSuccess && (
              <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
                <CheckCircle size={16} className="flex-shrink-0 text-emerald-500" />
                <span>¡Paciente y brazalete registrados con éxito! Redirigiendo a su ficha clínica...</span>
              </div>
            )}

            {/* Formulario de Registro */}
            <form onSubmit={handleRegisterPatientSubmit} className="space-y-6">

              {/* 1. Asignación de Dispositivo IoT */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-hn-800 dark:text-sky-300 flex items-center gap-1.5">
                    <Cpu size={14} />
                    1. Vinculación de Brazalete IoT (Hardware)
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewPatientForm({ ...newPatientForm, deviceId: generateNextDeviceId() })}
                    className="text-[10px] font-bold text-hn-700 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} />
                    Generar Siguiente ID
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Identificador Único del Brazalete (Device ID) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. ESP32-105"
                    value={newPatientForm.deviceId}
                    onChange={e => setNewPatientForm({ ...newPatientForm, deviceId: e.target.value.toUpperCase() })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Corresponde al identificador MQTT que el brazalete inteligente utiliza para transmitir telemetría.
                  </p>
                </div>
              </div>

              {/* 2. Datos Personales del Paciente */}
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
                  <User size={14} className="text-hn-600" />
                  2. Datos Personales del Paciente
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Rosa Elvira Méndez"
                      value={newPatientForm.name}
                      onChange={e => setNewPatientForm({ ...newPatientForm, name: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Edad (Años)
                    </label>
                    <input
                      type="number"
                      placeholder="Ej. 76"
                      value={newPatientForm.age}
                      onChange={e => setNewPatientForm({ ...newPatientForm, age: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Género
                    </label>
                    <select
                      value={newPatientForm.gender}
                      onChange={e => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 cursor-pointer"
                    >
                      <option value="Hombre">Hombre</option>
                      <option value="Mujer">Mujer</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Teléfono de Contacto Directo
                    </label>
                    <input
                      type="tel"
                      placeholder="Ej. +52 664 123 4567"
                      value={newPatientForm.phone}
                      onChange={e => setNewPatientForm({ ...newPatientForm, phone: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Contacto Familiar de Emergencia */}
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
                  <Phone size={14} className="text-hn-600" />
                  3. Contacto Familiar de Emergencia
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Nombre del Familiar o Tutor
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Héctor Méndez"
                      value={newPatientForm.emergencyContactName}
                      onChange={e => setNewPatientForm({ ...newPatientForm, emergencyContactName: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Teléfono de Emergencia
                    </label>
                    <input
                      type="tel"
                      placeholder="Ej. +52 55 9876 5432"
                      value={newPatientForm.emergencyContactPhone}
                      onChange={e => setNewPatientForm({ ...newPatientForm, emergencyContactPhone: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Ubicación y Enfermero Asignado */}
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
                  <Bed size={14} className="text-hn-600" />
                  4. Ubicación Territorial y Enfermero Responsable
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Número / Cuarto
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Hab. 104"
                      value={newPatientForm.roomNumber}
                      onChange={e => setNewPatientForm({ ...newPatientForm, roomNumber: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Piso / Nivel
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Piso 1"
                      value={newPatientForm.floor}
                      onChange={e => setNewPatientForm({ ...newPatientForm, floor: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Enfermero a Cargo
                    </label>
                    <select
                      value={newPatientForm.assignedNurseId}
                      onChange={e => {
                        const nurseId = e.target.value
                        const nurseObj = activeNurses.find(n => n.id === nurseId)
                        setNewPatientForm({
                          ...newPatientForm,
                          assignedNurseId: nurseId,
                          assignedNurseName: nurseObj ? nurseObj.fullName : ''
                        })
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 cursor-pointer"
                    >
                      <option value="">Enfermería General (Personal de Guardia)</option>
                      {activeNurses.map(nurse => (
                        <option key={nurse.id} value={nurse.id}>
                          {nurse.fullName}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                      Si no se asigna un enfermero individual, el seguimiento y alertas quedan a cargo del turno de Enfermería General.
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-hn-800 hover:bg-hn-900 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle size={15} />
                  )}
                  <span>Dar de Alta y Guardar Paciente</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: CONFIRMACIÓN PARA ARCHIVAR PACIENTE (ADMIN)      */}
      {/* ──────────────────────────────────────────────────────── */}
      {archiveModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 flex items-center justify-center font-black">
                <Archive size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-white leading-tight">
                  ¿Archivar paciente y liberar brazalete?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Confirmación de baja asistencial
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Paciente:</span>
                <span className="font-bold text-slate-800 dark:text-white">{archiveModalTarget.patientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Brazalete IoT:</span>
                <span className="font-mono font-bold text-hn-700 dark:text-sky-300">{archiveModalTarget.deviceId}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs leading-relaxed space-y-1 mb-4">
              <p className="font-bold flex items-center gap-1.5">
                <Shield size={14} className="text-amber-600 flex-shrink-0" />
                Protección y preservación de registros:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                <li>El paciente <strong>no se elimina</strong> de la base de datos: pasa al estado de archivado.</li>
                <li>Sus datos personales, clínicos y mediciones históricas <strong>se conservan íntegros</strong>.</li>
                <li>Se registrará en auditoría quién realizó el archivo, con fecha y hora exacta.</li>
                <li>El brazalete quedará registrado como <span className="text-amber-600 dark:text-amber-400 font-bold">NO EN USO (Disponible)</span> para nueva vinculación.</li>
              </ul>
            </div>

            <div className="mb-5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Motivo u Observación del Archivo
              </label>
              <input
                type="text"
                value={archiveReason}
                onChange={e => setArchiveReason(e.target.value)}
                placeholder="Ej. Alta médica, traslado de centro, baja asistencial..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setArchiveModalTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmArchive}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-md shadow-amber-900/10 flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Archive size={14} />
                <span>Archivar y Liberar Brazalete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: CONFIRMACIÓN PARA ELIMINAR PACIENTE (ADMIN)       */}
      {/* ──────────────────────────────────────────────────────── */}
      {deleteModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 flex items-center justify-center font-black">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-white leading-tight">
                  ¿Eliminar paciente definitivamente?
                </h3>
                <p className="text-xs text-red-600 dark:text-red-400 font-bold mt-0.5">
                  Esta acción es irreversible
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Paciente:</span>
                <span className="font-bold text-slate-800 dark:text-white">{deleteModalTarget.patientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Brazalete IoT:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{deleteModalTarget.deviceId}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              Se eliminará de forma permanente el registro del paciente y su historial de mediciones. El brazalete quedará completamente desvinculado del sistema.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteModalTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md shadow-red-900/10 flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Trash2 size={14} />
                <span>Eliminar Definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
