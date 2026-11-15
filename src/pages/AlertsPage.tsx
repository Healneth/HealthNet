import { useState, useMemo } from 'react'
import { useDeviceStore } from '../store/deviceStore'
import { useAuth } from '../hooks/useAuth'
import { getSystemUsers } from '../services/auth'
import {
  Ticket, Inbox, Clock, CheckCircle2, AlertTriangle, AlertCircle,
  UserX, UserCheck, Search, Filter, ArrowRightLeft, Play, Send,
  Lock, ShieldAlert, FileText, HeartPulse, Building, BedDouble,
  ChevronRight, X, RefreshCw, HeartHandshake, Users, Check,
  Activity, Calendar, Stethoscope, ClipboardList, Info
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Alert, TicketStatus, TicketCriticality, ShiftType } from '../types'

export default function AlertsPage() {
  const { user } = useAuth()
  const alerts = useDeviceStore(s => s.alerts)
  const devices = useDeviceStore(s => s.devices)
  const addTicketNote = useDeviceStore(s => s.addTicketNote)
  const updateTicketStatus = useDeviceStore(s => s.updateTicketStatus)
  const transferTicket = useDeviceStore(s => s.transferTicket)

  // Roles
  const isAdmin = user?.role === 'admin'
  const isDoctor = user?.role === 'doctor'
  const isNurse = user?.role === 'nurse'

  // Filtros y Búsqueda
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | TicketStatus>('todos')
  const [criticalityFilter, setCriticalityFilter] = useState<'todas' | TicketCriticality>('todas')
  const [shiftFilter, setShiftFilter] = useState<'todos' | ShiftType>('todos')
  const [patientFilter, setPatientFilter] = useState<string>('todos')
  const [nurseFilter, setNurseFilter] = useState<string>('todos')

  // Estado del Modal de Detalle
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [newNoteText, setNewNoteText] = useState('')
  const [isSubmittingNote, setIsSubmittingNote] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Sub-modales de acción en el detalle
  const [isCompletingModal, setIsCompletingModal] = useState(false)
  const [resolutionNoteText, setResolutionNoteText] = useState('')
  const [isTransferModal, setIsTransferModal] = useState(false)
  const [transferTargetNurseId, setTransferTargetNurseId] = useState('')
  const [transferTargetShift, setTransferTargetShift] = useState<ShiftType>('vespertino')
  const [transferReason, setTransferReason] = useState('')

  // Lista de enfermeros activos del sistema para transferencias y filtros
  const availableNurses = useMemo(() => {
    return getSystemUsers().filter(u => u.role === 'nurse' && u.isActive)
  }, [])

  // Lista de pacientes únicos detectados en alertas
  const uniquePatients = useMemo(() => {
    const map = new Map<string, string>()
    alerts.forEach(a => {
      const dev = devices[a.deviceId]
      const name = a.patientName || dev?.patientName || dev?.profile?.name || a.deviceId
      map.set(a.deviceId, name)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [alerts, devices])

  // Normalización de estados y propiedades del ticket
  const normalizeStatus = (t: Alert): TicketStatus => {
    if (t.status === 'completado' || t.currentStatus === 'completado' || t.currentStatus === 'ATENDIDA' || t.status === 'attended' || t.acknowledged) {
      return 'completado'
    }
    if (t.status === 'en_progreso' || t.currentStatus === 'en_progreso' || t.currentStatus === 'EN_ATENCION') {
      return 'en_progreso'
    }
    return 'recibido'
  }

  const normalizeCriticality = (t: Alert): TicketCriticality => {
    const raw = (t.criticality || (t.type === 'fall' ? 'critica' : 'media')).toString().toLowerCase()
    if (raw.includes('critica') || raw.includes('crítica')) return 'critica'
    if (raw.includes('alta')) return 'alta'
    if (raw.includes('media')) return 'media'
    return 'baja'
  }

  const isTicketUnassigned = (t: Alert): boolean => {
    return Boolean(
      t.isUnassigned ||
      (!t.nurseId && !t.assignedNurseName && (!t.assignedTo || t.assignedTo === 'Sin asignar' || t.assignedTo === 'Enfermería General'))
    )
  }

  const isAssignedNurseToTicket = (ticket: Alert): boolean => {
    if (!user || user.role !== 'nurse') return false
    if (ticket.nurseId && ticket.nurseId === user.id) return true
    if (user.fullName && ticket.assignedNurseName &&
        ticket.assignedNurseName.trim().toLowerCase() === user.fullName.trim().toLowerCase()) {
      return true
    }
    if (user.fullName && ticket.assignedTo &&
        ticket.assignedTo.trim().toLowerCase() === user.fullName.trim().toLowerCase()) {
      return true
    }
    if (user.email === 'enfermero@healthnet.com') {
      if (!ticket.nurseId || ticket.nurseId === 'a0000000-0000-0000-0000-000000000003' ||
          ticket.assignedNurseName?.includes('Carlos Domínguez') || ticket.assignedTo?.includes('Carlos Domínguez')) {
        return true
      }
    }
    return false
  }

  // Contadores KPI
  const kpis = useMemo(() => {
    let recibidos = 0
    let enProgreso = 0
    let completados = 0
    let sinAsignar = 0

    alerts.forEach(a => {
      const st = normalizeStatus(a)
      if (st === 'recibido') recibidos++
      if (st === 'en_progreso') enProgreso++
      if (st === 'completado') completados++
      if (isTicketUnassigned(a)) sinAsignar++
    })

    return { recibidos, enProgreso, completados, sinAsignar, total: alerts.length }
  }, [alerts])

  // Filtrado de Tickets
  const filteredTickets = useMemo(() => {
    return alerts.filter(ticket => {
      const st = normalizeStatus(ticket)
      const crit = normalizeCriticality(ticket)
      const shift = ticket.shiftType || 'matutino'
      const unassigned = isTicketUnassigned(ticket)
      const dev = devices[ticket.deviceId]
      const patientName = ticket.patientName || dev?.patientName || dev?.profile?.name || ticket.deviceId
      const folio = ticket.folio || `TCK-${ticket.id.slice(0, 8)}`

      // 1. Búsqueda por folio o nombre del paciente
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const matchFolio = folio.toLowerCase().includes(query)
        const matchName = patientName.toLowerCase().includes(query)
        const matchRoom = (dev?.profile?.roomNumber || '').toLowerCase().includes(query)
        const matchMsg = (ticket.message || '').toLowerCase().includes(query)
        const matchTitle = (ticket.title || '').toLowerCase().includes(query)
        if (!matchFolio && !matchName && !matchRoom && !matchMsg && !matchTitle) {
          return false
        }
      }

      // 2. Filtro por Estado
      if (statusFilter !== 'todos' && st !== statusFilter) {
        return false
      }

      // 3. Filtro por Criticidad
      if (criticalityFilter !== 'todas' && crit !== criticalityFilter) {
        return false
      }

      // 4. Filtro por Turno
      if (shiftFilter !== 'todos' && shift !== shiftFilter) {
        return false
      }

      // 5. Filtro por Paciente
      if (patientFilter !== 'todos' && ticket.deviceId !== patientFilter) {
        return false
      }

      // 6. Filtro por Enfermero / Asignación
      if (nurseFilter === 'mis_tickets') {
        if (!isAssignedNurseToTicket(ticket)) return false
      } else if (nurseFilter === 'sin_asignar') {
        if (!unassigned) return false
      } else if (nurseFilter !== 'todos') {
        const matchNurseId = ticket.nurseId === nurseFilter
        const nurseObj = availableNurses.find(n => n.id === nurseFilter)
        const matchNurseName = nurseObj && (
          ticket.assignedNurseName?.toLowerCase() === nurseObj.fullName.toLowerCase() ||
          ticket.assignedTo?.toLowerCase() === nurseObj.fullName.toLowerCase()
        )
        if (!matchNurseId && !matchNurseName) return false
      }

      return true
    })
  }, [alerts, devices, searchQuery, statusFilter, criticalityFilter, shiftFilter, patientFilter, nurseFilter, user, availableNurses])

  // Ticket seleccionado actualmente
  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null
    return alerts.find(a => a.id === selectedTicketId) || null
  }, [alerts, selectedTicketId])

  // Estilos de Insignias y Badges
  const getCriticalityBadge = (crit: TicketCriticality) => {
    switch (crit) {
      case 'critica':
        return {
          label: 'Crítica',
          badge: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 border-rose-300 dark:border-rose-800/60',
          dot: 'bg-rose-500 animate-ping',
        }
      case 'alta':
        return {
          label: 'Alta',
          badge: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300 border-orange-300 dark:border-orange-800/60',
          dot: 'bg-orange-500',
        }
      case 'media':
        return {
          label: 'Media',
          badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border-amber-300 dark:border-amber-800/60',
          dot: 'bg-amber-500',
        }
      case 'baja':
      default:
        return {
          label: 'Baja',
          badge: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300 border-sky-300 dark:border-sky-800/60',
          dot: 'bg-sky-500',
        }
    }
  }

  const getStatusBadge = (st: TicketStatus) => {
    switch (st) {
      case 'recibido':
        return {
          label: 'Recibido',
          badge: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300 border-sky-300 dark:border-sky-700/60',
          icon: Inbox,
        }
      case 'en_progreso':
        return {
          label: 'En Progreso',
          badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border-amber-300 dark:border-amber-700/60',
          icon: Clock,
        }
      case 'completado':
      default:
        return {
          label: 'Completado',
          badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60',
          icon: CheckCircle2,
        }
    }
  }

  // Manejadores de Acciones Operativas (Solo Enfermero Asignado)
  const handleStartProgress = async () => {
    if (!selectedTicket || !isAssignedNurseToTicket(selectedTicket)) return
    try {
      await updateTicketStatus(selectedTicket.id, 'en_progreso', undefined, user || undefined)
      setFeedbackMsg({ type: 'success', text: 'Atención iniciada. El ticket ahora está en progreso.' })
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al iniciar atención.' })
    }
  }

  const handleOpenCompleteModal = () => {
    setIsCompletingModal(true)
    setResolutionNoteText('')
  }

  const handleConfirmCompletion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTicket || !isAssignedNurseToTicket(selectedTicket)) return
    if (!resolutionNoteText.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Debe ingresar obligatoriamente una nota de resolución médica.' })
      return
    }

    try {
      await updateTicketStatus(selectedTicket.id, 'completado', resolutionNoteText.trim(), user || undefined)
      setIsCompletingModal(false)
      setResolutionNoteText('')
      setFeedbackMsg({ type: 'success', text: 'Ticket completado y resuelto exitosamente con su nota clínica.' })
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al completar ticket.' })
    }
  }

  const handleOpenTransferModal = () => {
    setIsTransferModal(true)
    setTransferReason('')
    // Default to the first available nurse who is not the current user
    const otherNurses = availableNurses.filter(n => n.id !== user?.id)
    if (otherNurses.length > 0) {
      setTransferTargetNurseId(otherNurses[0].id)
    }
  }

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTicket || !isAssignedNurseToTicket(selectedTicket)) return
    if (!transferTargetNurseId) {
      setFeedbackMsg({ type: 'error', text: 'Seleccione el enfermero al que se transferirá el ticket.' })
      return
    }
    if (!transferReason.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Ingrese el motivo de la transferencia de turno.' })
      return
    }

    const targetNurseObj = availableNurses.find(n => n.id === transferTargetNurseId)
    const targetNurseName = targetNurseObj?.fullName || 'Enfermero Receptor'

    try {
      await transferTicket(
        selectedTicket.id,
        transferTargetNurseId,
        targetNurseName,
        transferTargetShift,
        transferReason.trim(),
        user || undefined
      )
      setIsTransferModal(false)
      setTransferReason('')
      setFeedbackMsg({ type: 'success', text: `Ticket transferido exitosamente a ${targetNurseName} (${transferTargetShift}).` })
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al transferir ticket.' })
    }
  }

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTicket || !newNoteText.trim() || !isAssignedNurseToTicket(selectedTicket)) return

    setIsSubmittingNote(true)
    try {
      await addTicketNote(selectedTicket.id, newNoteText.trim(), user || undefined)
      setNewNoteText('')
      setFeedbackMsg({ type: 'success', text: 'Nota de atención registrada en la bitácora.' })
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al registrar nota.' })
    } finally {
      setIsSubmittingNote(false)
    }
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setStatusFilter('todos')
    setCriticalityFilter('todas')
    setShiftFilter('todos')
    setPatientFilter('todos')
    setNurseFilter('todos')
  }

  const hasActiveFilters = Boolean(
    searchQuery || statusFilter !== 'todos' || criticalityFilter !== 'todas' ||
    shiftFilter !== 'todos' || patientFilter !== 'todos' || nurseFilter !== 'todos'
  )

  return (
    <div className="space-y-6">
      {/* ───────────────────────────────────────────────────────── */}
      {/* 1. HEADER PANEL & SISTEMA DE TICKETS */}
      {/* ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-hn-50 dark:bg-slate-800 border border-hn-100 dark:border-slate-700 text-hn-800 dark:text-sky-300 text-[10px] font-black uppercase tracking-wider mb-2">
            <Ticket size={12} />
            Sistema de Tickets y Seguimiento de Alertas Clínicas
          </div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
            Gestión y Seguimiento de Tickets Clínicos
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Registro con folio único, asignación automática por turno y bitácora clínica inmutable de enfermería y auditoría médica.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5 text-xs">
            <div className="w-8 h-8 rounded-xl bg-hn-800 text-white dark:bg-sky-500 dark:text-slate-950 flex items-center justify-center font-bold">
              {user?.role === 'admin' ? 'AD' : user?.role === 'doctor' ? 'DR' : 'EN'}
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-white text-[11px] leading-tight">
                {user?.fullName || user?.username || 'Usuario'}
              </p>
              <p className="text-[10px] text-slate-400 capitalize">
                Rol: {user?.role === 'admin' ? 'Administrador' : user?.role === 'doctor' ? 'Médico Especialista' : 'Personal de Enfermería'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 2. CONTADORES KPI (Recibidos, En Progreso, Completados, Sin Asignar) */}
      {/* ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Recibidos */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'recibido' ? 'todos' : 'recibido')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer shadow-sm ${
            statusFilter === 'recibido'
              ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-400 ring-2 ring-sky-400/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-sky-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 flex items-center justify-center">
              <Inbox size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800/40">
              Pendientes
            </span>
          </div>
          <p className="text-3xl font-black text-slate-800 dark:text-white">
            {kpis.recibidos}
          </p>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
            Tickets Recibidos
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Pendientes de inicio de atención</p>
        </div>

        {/* KPI: En Progreso */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'en_progreso' ? 'todos' : 'en_progreso')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer shadow-sm ${
            statusFilter === 'en_progreso'
              ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-400 ring-2 ring-amber-400/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <Clock size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/40">
              En Curso
            </span>
          </div>
          <p className="text-3xl font-black text-slate-800 dark:text-white">
            {kpis.enProgreso}
          </p>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
            En Progreso
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Bajo atención asistencial activa</p>
        </div>

        {/* KPI: Completados */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'completado' ? 'todos' : 'completado')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer shadow-sm ${
            statusFilter === 'completado'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-400 ring-2 ring-emerald-400/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40">
              Resueltos
            </span>
          </div>
          <p className="text-3xl font-black text-slate-800 dark:text-white">
            {kpis.completados}
          </p>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
            Completados
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Finalizados con nota de resolución</p>
        </div>

        {/* KPI: Sin Asignar */}
        <div
          onClick={() => setNurseFilter(nurseFilter === 'sin_asignar' ? 'todos' : 'sin_asignar')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer shadow-sm ${
            nurseFilter === 'sin_asignar'
              ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-400 ring-2 ring-rose-400/20'
              : kpis.sinAsignar > 0
              ? 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-900/60 hover:border-rose-300'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              kpis.sinAsignar > 0
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 animate-pulse'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}>
              <UserX size={18} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
              kpis.sinAsignar > 0
                ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-800/40'
                : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}>
              Supervisión
            </span>
          </div>
          <p className={`text-3xl font-black ${kpis.sinAsignar > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-white'}`}>
            {kpis.sinAsignar}
          </p>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
            Sin Asignar
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {isAdmin ? 'Supervisar en Control de Personal' : 'Pendientes de responsable de turno'}
          </p>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 3. BARRA DE BÚSQUEDA Y FILTROS MULTI-CRITERIO */}
      {/* ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
        {/* Buscador */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por folio (ej. TCK-2026-0081), nombre de paciente, habitación o causa clínica..."
            className="w-full pl-11 pr-10 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hn-800/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Controles de Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {/* Filtro por Estado */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Estado del Ticket
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-hn-800/30"
            >
              <option value="todos">Todos los Estados</option>
              <option value="recibido">Recibidos</option>
              <option value="en_progreso">En Progreso</option>
              <option value="completado">Completados</option>
            </select>
          </div>

          {/* Filtro por Criticidad */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Criticidad Clínica
            </label>
            <select
              value={criticalityFilter}
              onChange={e => setCriticalityFilter(e.target.value as typeof criticalityFilter)}
              className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-hn-800/30"
            >
              <option value="todas">Todas las Criticidades</option>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </div>

          {/* Filtro por Turno */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Turno de Generación
            </label>
            <select
              value={shiftFilter}
              onChange={e => setShiftFilter(e.target.value as typeof shiftFilter)}
              className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-hn-800/30"
            >
              <option value="todos">Todos los Turnos</option>
              <option value="matutino">Matutino (07:00 - 15:00)</option>
              <option value="vespertino">Vespertino (15:00 - 23:00)</option>
              <option value="nocturno">Nocturno (23:00 - 07:00)</option>
            </select>
          </div>

          {/* Filtro por Paciente */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Paciente Relacionado
            </label>
            <select
              value={patientFilter}
              onChange={e => setPatientFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-hn-800/30"
            >
              <option value="todos">Todos los Pacientes ({uniquePatients.length})</option>
              {uniquePatients.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Enfermero */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Enfermero Asignado
            </label>
            <select
              value={nurseFilter}
              onChange={e => setNurseFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-hn-800/30"
            >
              <option value="todos">Todos los Responsables</option>
              {isNurse && <option value="mis_tickets">★ Mis Tickets Asignados</option>}
              <option value="sin_asignar">⚠️ Sin Asignar ({kpis.sinAsignar})</option>
              {availableNurses.map(n => (
                <option key={n.id} value={n.id}>{n.fullName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen de Filtros y Limpieza */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Mostrando {filteredTickets.length} de {alerts.length} tickets
            </span>
            {hasActiveFilters && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-hn-800 dark:text-sky-400 bg-hn-50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-hn-100 dark:border-slate-700">
                <Filter size={10} /> Filtros Aplicados
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} /> Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 4. TABLA PRINCIPAL DE TICKETS CLÍNICOS */}
      {/* ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto w-full">
          {filteredTickets.length === 0 ? (
            <div className="py-24 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center">
              <CheckCircle2 size={42} className="text-emerald-500 mb-3" />
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                No se encontraron tickets con los criterios seleccionados
              </h3>
              <p className="text-xs max-w-sm mt-1">
                Ajuste los filtros o la búsqueda para consultar otros incidentes clínicos o registros de turno.
              </p>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="mt-4 px-4 py-2 rounded-xl bg-hn-800 text-white text-xs font-bold hover:bg-hn-900 transition-colors shadow-sm cursor-pointer"
                >
                  Restablecer Filtros
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-wider bg-slate-50/50 dark:bg-slate-950/20">
                  <th className="px-5 py-3.5">Folio</th>
                  <th className="px-5 py-3.5">Fecha y Hora</th>
                  <th className="px-5 py-3.5">Paciente & Ubicación</th>
                  <th className="px-5 py-3.5">Alerta / Evento Clínico</th>
                  <th className="px-5 py-3.5 text-center">Criticidad</th>
                  <th className="px-5 py-3.5 text-center">Turno</th>
                  <th className="px-5 py-3.5 text-center">Estado</th>
                  <th className="px-5 py-3.5">Enfermero Responsable</th>
                  <th className="px-5 py-3.5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium">
                {filteredTickets.map(ticket => {
                  const st = normalizeStatus(ticket)
                  const crit = normalizeCriticality(ticket)
                  const critBadge = getCriticalityBadge(crit)
                  const statusBadge = getStatusBadge(st)
                  const StatusIcon = statusBadge.icon
                  const dev = devices[ticket.deviceId]
                  const patientName = ticket.patientName || dev?.patientName || dev?.profile?.name || ticket.deviceId
                  const room = ticket.roomNumber || dev?.profile?.roomNumber || 'Habitación'
                  const floor = ticket.floor || dev?.profile?.floor || 'Piso 1'
                  const folio = ticket.folio || `TCK-${ticket.id.slice(0, 8).toUpperCase()}`
                  const shift = ticket.shiftType || 'matutino'
                  const unassigned = isTicketUnassigned(ticket)
                  const isAssignedToMe = isAssignedNurseToTicket(ticket)
                  const assignedNurseName = ticket.assignedNurseName || ticket.assignedTo || dev?.profile?.assignedNurseName

                  return (
                    <tr
                      key={ticket.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors"
                    >
                      {/* Folio */}
                      <td className="px-5 py-4 whitespace-nowrap font-mono">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700">
                          <Ticket size={12} className="text-hn-800 dark:text-sky-400" />
                          <span>{folio}</span>
                        </span>
                      </td>

                      {/* Fecha y Hora */}
                      <td className="px-5 py-4 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {format(ticket.timestamp, 'dd/MM/yyyy HH:mm:ss')}
                      </td>

                      {/* Paciente y Ubicación */}
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                          {patientName}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                          <BedDouble size={11} className="inline text-slate-400" />
                          <span>{room}</span>
                          <span>·</span>
                          <Building size={11} className="inline text-slate-400" />
                          <span>{floor}</span>
                          <span>·</span>
                          <span className="font-mono">{ticket.deviceId}</span>
                        </p>
                      </td>

                      {/* Evento Clínico */}
                      <td className="px-5 py-4 max-w-xs">
                        <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                          {ticket.title || ticket.message}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                          {ticket.description || ticket.message}
                        </p>
                        {ticket.clinicalValue && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Valor origen: {ticket.clinicalValue}
                          </span>
                        )}
                      </td>

                      {/* Criticidad */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${critBadge.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${critBadge.dot}`} />
                          {critBadge.label}
                        </span>
                      </td>

                      {/* Turno */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {shift}
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusBadge.badge}`}>
                          <StatusIcon size={12} />
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* Responsable */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {unassigned ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-300 dark:border-rose-700/60 shadow-xs">
                            <AlertTriangle size={13} className="text-rose-600 dark:text-rose-400" />
                            <span>Sin asignar</span>
                          </span>
                        ) : isAssignedToMe ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-50 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 shadow-xs">
                            <HeartHandshake size={13} className="text-emerald-600 dark:text-emerald-400" />
                            <span>{assignedNurseName} (Tú)</span>
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              <UserCheck size={13} className="text-slate-400" />
                              <span>{assignedNurseName || 'Enfermero de Turno'}</span>
                            </span>
                            {ticket.originalNurseName && ticket.originalNurseName !== assignedNurseName && (
                              <p className="text-[10px] text-slate-400 italic mt-0.5">
                                Original: {ticket.originalNurseName}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedTicketId(ticket.id)
                            setFeedbackMsg(null)
                          }}
                          className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 mx-auto cursor-pointer ${
                            isAssignedToMe && st !== 'completado'
                              ? 'bg-hn-800 hover:bg-hn-900 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <FileText size={13} />
                          <span>
                            {isAdmin || isDoctor
                              ? 'Consultar Detalle'
                              : isAssignedToMe
                              ? st === 'recibido'
                                ? 'Atender Ticket'
                                : st === 'en_progreso'
                                ? 'Gestionar / Resolver'
                                : 'Ver Resolución'
                              : 'Ver Detalle'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 5. MODAL DE DETALLE Y SEGUIMIENTO DEL TICKET (DRAWER/MODAL) */}
      {/* ───────────────────────────────────────────────────────── */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto space-y-5">
            {/* Encabezado del Modal */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-hn-50 dark:bg-slate-800 text-hn-800 dark:text-sky-300 flex items-center justify-center border border-hn-100 dark:border-slate-700">
                  <Ticket size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                      {selectedTicket.folio || `TCK-${selectedTicket.id.slice(0, 8).toUpperCase()}`}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      getCriticalityBadge(normalizeCriticality(selectedTicket)).badge
                    }`}>
                      {getCriticalityBadge(normalizeCriticality(selectedTicket)).label}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      getStatusBadge(normalizeStatus(selectedTicket)).badge
                    }`}>
                      {getStatusBadge(normalizeStatus(selectedTicket)).label}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">
                    {selectedTicket.title || selectedTicket.message}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTicketId(null)
                  setIsCompletingModal(false)
                  setIsTransferModal(false)
                  setFeedbackMsg(null)
                }}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mensaje de Feedback */}
            {feedbackMsg && (
              <div className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between border ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-800/60'
                  : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-800/60'
              }`}>
                <span>{feedbackMsg.text}</span>
                <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-700">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Ficha Resumen de Alerta y Paciente */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Paciente:</span>
                <span className="font-bold text-slate-800 dark:text-white text-sm">
                  {selectedTicket.patientName || devices[selectedTicket.deviceId]?.patientName || selectedTicket.deviceId}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Habitación: <strong>{selectedTicket.roomNumber || devices[selectedTicket.deviceId]?.profile?.roomNumber || 'Hab. 101'}</strong> ({selectedTicket.floor || devices[selectedTicket.deviceId]?.profile?.floor || 'Piso 1'})
                </p>
                <p className="text-[11px] text-slate-400 font-mono">
                  Brazalete: {selectedTicket.deviceId}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Generación & Turno:</span>
                <p className="font-mono text-slate-700 dark:text-slate-300">
                  {format(selectedTicket.timestamp, 'dd/MM/yyyy HH:mm:ss')}
                </p>
                <p className="text-[11px] text-slate-400 capitalize mt-0.5">
                  Turno: <strong>{selectedTicket.shiftType || 'matutino'}</strong>
                </p>
                {selectedTicket.clinicalValue && (
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                    Valor Clínico que Originó: {selectedTicket.clinicalValue}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Enfermero Responsable:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {isTicketUnassigned(selectedTicket) ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">⚠️ Sin enfermero asignado en el turno</span>
                    ) : (
                      selectedTicket.assignedNurseName || selectedTicket.assignedTo || 'Personal de Turno'
                    )}
                  </span>
                </div>
                {selectedTicket.originalNurseName && selectedTicket.originalNurseName !== selectedTicket.assignedNurseName && (
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Responsable Original:</span>
                    <span className="text-slate-600 dark:text-slate-400 text-xs italic">
                      {selectedTicket.originalNurseName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Banners Informativos de Rol (RBAC) */}
            {isAdmin && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
                <Lock size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 dark:text-slate-200">Modo Supervisión Administrativa:</strong>
                  <span>
                    El rol Administrador tiene autorización para auditar y consultar todos los tickets clínicos, sus notas e historial completo. La atención operativa directa y el cierre de tickets corresponden al personal de enfermería en turno.
                  </span>
                  {isTicketUnassigned(selectedTicket) && (
                    <div className="mt-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 font-bold">
                      ⚠️ Atención requerida: Este ticket no cuenta con enfermero asignado en la programación de turnos. Puede realizar la asignación en la sección Control de Personal.
                    </div>
                  )}
                </div>
              </div>
            )}

            {isDoctor && (
              <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-800/60 text-xs text-sky-800 dark:text-sky-300 flex items-start gap-2.5">
                <Stethoscope size={16} className="text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block">Modo Consulta Médica Especializada:</strong>
                  <span>
                    El médico especialista cuenta con permisos de solo lectura para consultar la criticidad, valor clínico, notas de turno y línea de tiempo del ticket. No se autoriza la modificación o cierre operativo de tickets de alerta.
                  </span>
                </div>
              </div>
            )}

            {isNurse && !isAssignedNurseToTicket(selectedTicket) && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <Lock size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block">Consulta de Solo Lectura:</strong>
                  <span>
                    Este ticket está asignado a <strong>{selectedTicket.assignedNurseName || 'otro enfermero'}</strong>. Según las reglas de asignación territorial y turnos, solo el enfermero responsable asignado puede cambiar estados, agregar notas o transferir el ticket.
                  </span>
                </div>
              </div>
            )}

            {/* Botones de Acción Operativa (Exclusivos para Enfermero Asignado) */}
            {isNurse && isAssignedNurseToTicket(selectedTicket) && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Acciones Operativas Disponibles (Enfermero Titular)
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                    Autorizado
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {normalizeStatus(selectedTicket) === 'recibido' && (
                    <button
                      type="button"
                      onClick={handleStartProgress}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play size={14} />
                      <span>Comenzar Atención (En Progreso)</span>
                    </button>
                  )}

                  {normalizeStatus(selectedTicket) === 'en_progreso' && (
                    <button
                      type="button"
                      onClick={handleOpenCompleteModal}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>Completar y Cerrar Ticket</span>
                    </button>
                  )}

                  {normalizeStatus(selectedTicket) !== 'completado' && (
                    <button
                      type="button"
                      onClick={handleOpenTransferModal}
                      className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRightLeft size={14} />
                      <span>Transferir a Siguiente Turno</span>
                    </button>
                  )}

                  {normalizeStatus(selectedTicket) === 'completado' && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 py-1">
                      <CheckCircle2 size={16} />
                      <span>Ticket completado y cerrado formalmente en el turno.</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Subformulario Modal: Completar Ticket con Nota Obligatoria */}
            {isCompletingModal && (
              <form onSubmit={handleConfirmCompletion} className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-200 uppercase flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Finalizar Ticket: Nota Obligatoria de Resolución</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsCompletingModal(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Para completar el ticket es obligatorio documentar las acciones de cuidado realizadas, el estado físico final del paciente y el resultado de la atención.
                </p>
                <textarea
                  rows={3}
                  required
                  value={resolutionNoteText}
                  onChange={e => setResolutionNoteText(e.target.value)}
                  placeholder="Ej. Paciente valorado en piso. Signos vitales estabilizados (FC 72 bpm, Temp 36.6°C). Reposo asistido sin complicaciones adicionales..."
                  className="w-full p-3 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCompletingModal(false)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    Confirmar Cierre de Ticket
                  </button>
                </div>
              </form>
            )}

            {/* Subformulario Modal: Transferencia de Turno (Handoff) */}
            {isTransferModal && (
              <form onSubmit={handleConfirmTransfer} className="p-4 rounded-2xl bg-sky-50/70 dark:bg-sky-950/20 border border-sky-300 dark:border-sky-800 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-sky-900 dark:text-sky-200 uppercase flex items-center gap-1.5">
                    <ArrowRightLeft size={14} className="text-sky-600" />
                    <span>Transferencia de Ticket al Siguiente Turno (Handoff)</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsTransferModal(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Conserva el responsable original e historial de transferencias. Seleccione al enfermero del turno entrante que asumirá la continuidad asistencial.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Enfermero Receptor
                    </label>
                    <select
                      value={transferTargetNurseId}
                      onChange={e => setTransferTargetNurseId(e.target.value)}
                      className="w-full p-2 rounded-xl border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white font-bold"
                    >
                      {availableNurses
                        .filter(n => n.id !== user?.id)
                        .map(n => (
                          <option key={n.id} value={n.id}>{n.fullName}</option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Turno Destino
                    </label>
                    <select
                      value={transferTargetShift}
                      onChange={e => setTransferTargetShift(e.target.value as ShiftType)}
                      className="w-full p-2 rounded-xl border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white font-bold"
                    >
                      <option value="matutino">Turno Matutino (07:00 - 15:00)</option>
                      <option value="vespertino">Turno Vespertino (15:00 - 23:00)</option>
                      <option value="nocturno">Turno Nocturno (23:00 - 07:00)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Motivo / Observaciones de Entrega de Turno
                  </label>
                  <input
                    type="text"
                    required
                    value={transferReason}
                    onChange={e => setTransferReason(e.target.value)}
                    placeholder="Ej. Finalización del turno matutino. Paciente estable pero se requiere control de temperatura en turno vespertino."
                    className="w-full p-2.5 rounded-xl border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsTransferModal(false)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    Registrar Transferencia
                  </button>
                </div>
              </form>
            )}

            {/* Formulario para Agregar Nota de Atención (Solo si es Enfermero Titular) */}
            {isNurse && isAssignedNurseToTicket(selectedTicket) && (
              <form onSubmit={handleAddNote} className="space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Registrar Nueva Observación de Atención Clínica
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newNoteText}
                    onChange={e => setNewNoteText(e.target.value)}
                    placeholder="Escriba aquí sus observaciones o medidas de enfermería aplicadas..."
                    className="flex-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingNote || !newNoteText.trim()}
                    className="px-4 py-2 rounded-xl bg-hn-800 hover:bg-hn-900 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send size={13} />
                    <span>Guardar</span>
                  </button>
                </div>
              </form>
            )}

            {/* ───────────────────────────────────────────────────── */}
            {/* 6. BITÁCORA INMUTABLE DE NOTAS DE ATENCIÓN */}
            {/* ───────────────────────────────────────────────────── */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <FileText size={14} className="text-hn-800 dark:text-sky-400" />
                  <span>Bitácora de Notas de Atención</span>
                </h4>
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  {(selectedTicket.notes?.length || 0)} Nota(s)
                </span>
              </div>

              {selectedTicket.notes && selectedTicket.notes.length > 0 ? (
                <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                  {selectedTicket.notes.map((note, idx) => (
                    <div
                      key={note.id || idx}
                      className={`p-3 rounded-2xl border text-xs ${
                        note.type === 'resolucion'
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                          : note.type === 'transferencia'
                          ? 'bg-sky-50/60 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {note.userName}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] uppercase font-bold">
                            {note.userRole}
                          </span>
                          {note.type === 'resolucion' && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[9px] uppercase font-black">
                              Resolución
                            </span>
                          )}
                          {note.type === 'transferencia' && (
                            <span className="px-1.5 py-0.2 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 text-[9px] uppercase font-black">
                              Transferencia
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-slate-400">
                          {format(note.createdAt, 'dd/MM/yyyy HH:mm:ss')}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                        {note.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  Sin notas de atención registradas para este ticket.
                </p>
              )}
            </div>

            {/* ───────────────────────────────────────────────────── */}
            {/* 7. LÍNEA DE TIEMPO / HISTORIAL DE ACTIVIDAD */}
            {/* ───────────────────────────────────────────────────── */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Activity size={14} className="text-hn-800 dark:text-sky-400" />
                  <span>Historial de Actividad y Auditoría</span>
                </h4>
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  {(selectedTicket.activityLog?.length || 0)} Evento(s)
                </span>
              </div>

              {selectedTicket.activityLog && selectedTicket.activityLog.length > 0 ? (
                <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                  {selectedTicket.activityLog.map((act, idx) => (
                    <div key={act.id || idx} className="relative text-xs">
                      {/* Punto de la línea de tiempo */}
                      <span className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                        act.action === 'COMPLETADO'
                          ? 'bg-emerald-500'
                          : act.action === 'TRANSFERENCIA'
                          ? 'bg-sky-500'
                          : act.action === 'EN_PROGRESO'
                          ? 'bg-amber-500'
                          : 'bg-hn-800 dark:bg-sky-400'
                      }`} />

                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {act.performedBy} ({act.performedByRole})
                        </span>
                        <span className="font-mono">
                          {format(act.timestamp, 'dd/MM/yyyy HH:mm:ss')}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                        {act.description}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-3 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  Sin eventos adicionales en el historial.
                </p>
              )}
            </div>

            {/* Pie del Modal */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedTicketId(null)
                  setIsCompletingModal(false)
                  setIsTransferModal(false)
                  setFeedbackMsg(null)
                }}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
