import { useState, useEffect, useMemo } from 'react'
import {
  Users, UserPlus, Shield, Stethoscope, HeartHandshake,
  Search, CheckCircle2, XCircle, Edit2, ShieldAlert,
  Save, X, Phone, Mail, User as UserIcon, Lock,
  Building2, Bed, MapPin, UserCheck, UserX, Layers, ArrowRightLeft,
  Activity, Calendar, Clock, Sun, Sunset, Moon, ChevronLeft, ChevronRight,
  SlidersHorizontal, RotateCcw, AlertTriangle, Info, CalendarDays, History as HistoryIcon,
  Filter, Check, Sparkles, UserMinus, Plus, CheckSquare, Square,
  AlertCircle, Eye, ArrowRight
} from 'lucide-react'
import { parseISO, addDays, format } from 'date-fns'
import { getSystemUsers, saveSystemUsers } from '../services/auth'
import { logAuditEvent } from '../utils/auditLogger'
import { useAuth } from '../hooks/useAuth'
import { useDeviceStore } from '../store/deviceStore'
import type { SystemUser, UserRole, DeviceState, ShiftType, ShiftConfig, NurseShiftAssignment, PatientShiftAssignment } from '../types'
import {
  getShiftConfigs,
  saveShiftConfigs,
  getShiftAssignments,
  saveOrUpdateNurseShift,
  removeNurseShift,
  checkShiftConflict,
  getCurrentOrNextShift,
  getShiftStyle,
  getCurrentWeekMonday,
  formatWeekLabel,
  getWeekDaysList,
  DEFAULT_SHIFT_CONFIGS
} from '../services/shiftService'
import {
  getAllPatientShiftAssignments,
  getNursePatientAssignments,
  getPatientCoverage,
  assignPatientToNurseShift,
  withdrawPatientShiftAssignment,
  calculateAssignmentsOverview,
} from '../services/patientAssignmentService'

export default function UsersManagementPage() {
  const { user } = useAuth()
  const userRole: UserRole = user?.role || 'admin'
  const isAdmin = userRole === 'admin'
  const isDoctor = userRole === 'doctor'
  const isNurse = userRole === 'nurse'

  // Roles y Permisos Estrictos:
  // - Administrador: Control total (Usuarios RBAC, Turnos y Asignación de Pacientes).
  // - Doctor: Únicamente puede consultar 'assignments' (Enfermeros Responsables de sus pacientes).
  //   NO puede ver ni 'users' (Personal y Cuentas RBAC) ni 'shifts' (Programación Semanal de Turnos).
  // - Enfermero: Inicia en 'shifts' (Mi Turno) y puede consultar 'assignments' (Mis Pacientes).
  const [activeTab, setActiveTab] = useState<'users' | 'shifts' | 'assignments'>(
    isDoctor ? 'assignments' : isNurse ? 'shifts' : 'users'
  )

  // Salvaguarda: Forzar que el Doctor permanezca estrictamente en 'assignments' y el enfermero no entre a 'users'
  useEffect(() => {
    if (isDoctor && activeTab !== 'assignments') {
      setActiveTab('assignments')
    } else if (isNurse && activeTab === 'users') {
      setActiveTab('shifts')
    }
  }, [isDoctor, isNurse, activeTab])

  const [users, setUsers] = useState<SystemUser[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')

  // Modal de confirmación para suspender cuenta (RBAC)
  const [suspensionModalTarget, setSuspensionModalTarget] = useState<SystemUser | null>(null)
  const [suspensionReason, setSuspensionReason] = useState('Suspensión administrativa de credenciales')

  // Store de dispositivos / pacientes
  const devices = useDeviceStore(s => Object.values(s.devices))
  const assignPatientToNurseStore = useDeviceStore(s => s.assignPatientToNurse)

  // ──────────────────────────────────────────────
  // Estados para Turnos de Trabajo
  // ──────────────────────────────────────────────
  const [shiftConfigs, setShiftConfigs] = useState<Record<ShiftType, ShiftConfig>>(getShiftConfigs())
  const [shiftAssignments, setShiftAssignments] = useState<NurseShiftAssignment[]>(getShiftAssignments())
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<string>(getCurrentWeekMonday())
  const [shiftFilter, setShiftFilter] = useState<'all' | ShiftType | 'unassigned'>('all')
  const [nurseShiftSearch, setNurseShiftSearch] = useState('')

  // Modal para Programar / Modificar Turno Semanal
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<NurseShiftAssignment | null>(null)
  const [modalNurseId, setModalNurseId] = useState('')
  const [modalShiftType, setModalShiftType] = useState<ShiftType>('matutino')
  const [modalWeekStartDate, setModalWeekStartDate] = useState(getCurrentWeekMonday())
  const [modalDays, setModalDays] = useState<string[]>(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'])
  const [modalNotes, setModalNotes] = useState('')
  const [shiftConflictError, setShiftConflictError] = useState<string | null>(null)

  // Modal para Configuración de Horarios del Centro
  const [configHoursModalOpen, setConfigHoursModalOpen] = useState(false)
  const [tempShiftConfigs, setTempShiftConfigs] = useState<Record<ShiftType, ShiftConfig>>(getShiftConfigs())

  // Modal State para Usuarios
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [role, setRole] = useState<UserRole>('nurse')
  const [defaultShift, setDefaultShift] = useState<ShiftType>('matutino')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // ──────────────────────────────────────────────
  // Estados para Asignación Territorial de Pacientes
  // ──────────────────────────────────────────────
  const [patientAssignments, setPatientAssignments] = useState<PatientShiftAssignment[]>(getAllPatientShiftAssignments())
  const [selectedAssignmentNurseId, setSelectedAssignmentNurseId] = useState<string>('')
  const [managedShiftType, setManagedShiftType] = useState<ShiftType>('matutino')
  const [assignmentNurseSearch, setAssignmentNurseSearch] = useState('')
  const [assignmentPatientSearch, setAssignmentPatientSearch] = useState('')
  const [assignmentSubTab, setAssignmentSubTab] = useState<'assigned' | 'available' | 'history'>('assigned')
  const [selectedPatientIdsToAssign, setSelectedPatientIdsToAssign] = useState<string[]>([])

  // Modal para Retiro de Asignación (Preservando Historial)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [assignmentToWithdraw, setAssignmentToWithdraw] = useState<PatientShiftAssignment | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('Rotación de servicio asistencial')
  const [customWithdrawReason, setCustomWithdrawReason] = useState('')

  // Modal para Reasignar Paciente a otro enfermero programado en el mismo turno
  const [reassignModal, setReassignModal] = useState<{
    open: boolean
    assignment: PatientShiftAssignment | null
    targetNurseId: string
  }>({ open: false, assignment: null, targetNurseId: '' })

  useEffect(() => {
    setUsers(getSystemUsers())
    setShiftConfigs(getShiftConfigs())
    setShiftAssignments(getShiftAssignments())
    setPatientAssignments(getAllPatientShiftAssignments())
  }, [])

  // Lista de enfermeros activos registrados
  const activeNurses = users.filter(u => u.role === 'nurse' && u.isActive)

  // Identificar el usuario enfermero actual si el llamador es enfermero
  const currentNurseUser = users.find(u => u.email.toLowerCase() === (user?.email || '').toLowerCase())

  // Inicializar selección de enfermero por defecto
  useEffect(() => {
    if (activeNurses.length > 0 && !selectedAssignmentNurseId) {
      if (isNurse && currentNurseUser) {
        setSelectedAssignmentNurseId(currentNurseUser.id)
      } else {
        setSelectedAssignmentNurseId(activeNurses[0].id)
      }
    }
  }, [activeNurses, selectedAssignmentNurseId, isNurse, currentNurseUser])

  // Semana actual de referencia
  const currentWeekMonday = getCurrentWeekMonday()
  const isSelectedCurrentWeek = selectedWeekMonday === currentWeekMonday
  const isSelectedPastWeek = selectedWeekMonday < currentWeekMonday
  const isSelectedFutureWeek = selectedWeekMonday > currentWeekMonday

  // Asignaciones de turnos de la semana seleccionada
  const weekAssignments = useMemo(() => {
    return shiftAssignments.filter(a => a.weekStartDate === selectedWeekMonday)
  }, [shiftAssignments, selectedWeekMonday])

  // Métricas de turnos de la semana seleccionada
  const shiftMetrics = useMemo(() => {
    let matutino = 0
    let vespertino = 0
    let nocturno = 0
    const assignedNurseIds = new Set<string>()

    weekAssignments.forEach(a => {
      assignedNurseIds.add(a.nurseId)
      if (a.shiftType === 'matutino') matutino++
      if (a.shiftType === 'vespertino') vespertino++
      if (a.shiftType === 'nocturno') nocturno++
    })

    const unassigned = activeNurses.filter(n => !assignedNurseIds.has(n.id)).length

    return {
      totalNurses: activeNurses.length,
      matutino,
      vespertino,
      nocturno,
      unassigned,
    }
  }, [weekAssignments, activeNurses])

  // Opciones de semanas rápidas (±4 semanas desde la actual)
  const weekOptions = useMemo(() => {
    const opts = []
    const baseDate = parseISO(currentWeekMonday)
    for (let offset = -4; offset <= 4; offset++) {
      const mon = format(addDays(baseDate, offset * 7), 'yyyy-MM-dd')
      opts.push({
        value: mon,
        label: formatWeekLabel(mon),
        isCurrent: mon === currentWeekMonday,
      })
    }
    return opts
  }, [currentWeekMonday])

  // Resumen métrico de Asignación Territorial de Pacientes
  const assignmentStats = useMemo(() => {
    return calculateAssignmentsOverview(devices, activeNurses, selectedWeekMonday)
  }, [devices, activeNurses, selectedWeekMonday, patientAssignments])

  // Turno efectivo para la gestión de asignaciones
  // Para enfermero: su turno asignado en la semana o su defecto
  // Para admin/doctor: el turno seleccionado en el selector (managedShiftType)
  const effectiveShiftType: ShiftType = useMemo(() => {
    if (isNurse && currentNurseUser) {
      const nurseShift = shiftAssignments.find(
        a => a.nurseId === currentNurseUser.id && a.weekStartDate === selectedWeekMonday
      )
      return nurseShift?.shiftType || currentNurseUser.defaultShift || managedShiftType
    }
    return managedShiftType
  }, [isNurse, currentNurseUser, shiftAssignments, selectedWeekMonday, managedShiftType])

  const managedShiftConfig = shiftConfigs[effectiveShiftType] || DEFAULT_SHIFT_CONFIGS[effectiveShiftType]

  // VALIDACIÓN PRINCIPAL: Solo se muestran los enfermeros que tengan programado este turno en esta semana
  const scheduledNursesInShift = useMemo(() => {
    const scheduledNurseIds = new Set(
      shiftAssignments
        .filter(a => a.weekStartDate === selectedWeekMonday && a.shiftType === effectiveShiftType)
        .map(a => a.nurseId)
    )
    return activeNurses.filter(n => scheduledNurseIds.has(n.id))
  }, [shiftAssignments, selectedWeekMonday, effectiveShiftType, activeNurses])

  // Enfermero seleccionado actualmente en la pestaña de Asignaciones
  const selectedAssignmentNurse = useMemo(() => {
    if (isNurse && currentNurseUser) return currentNurseUser
    const found = scheduledNursesInShift.find(n => n.id === selectedAssignmentNurseId)
    return found || scheduledNursesInShift[0] || null
  }, [selectedAssignmentNurseId, scheduledNursesInShift, isNurse, currentNurseUser])

  // Auto-ajuste de selección de enfermero al cambiar turno o semana
  useEffect(() => {
    if (isNurse) {
      if (currentNurseUser && selectedAssignmentNurseId !== currentNurseUser.id) {
        setSelectedAssignmentNurseId(currentNurseUser.id)
      }
    } else {
      const isStillValid = scheduledNursesInShift.some(n => n.id === selectedAssignmentNurseId)
      if (!isStillValid) {
        setSelectedAssignmentNurseId(scheduledNursesInShift[0]?.id || '')
        setSelectedPatientIdsToAssign([])
      }
    }
  }, [effectiveShiftType, selectedWeekMonday, scheduledNursesInShift, isNurse, currentNurseUser, selectedAssignmentNurseId])

  // Pacientes actualmente asignados a este enfermero en este turno y semana
  const assignedPatientsToSelectedNurse = useMemo(() => {
    if (!selectedAssignmentNurse) return []
    return patientAssignments.filter(
      a =>
        a.nurseId === selectedAssignmentNurse.id &&
        a.weekStartDate === selectedWeekMonday &&
        a.shiftType === effectiveShiftType &&
        a.active === true
    )
  }, [patientAssignments, selectedAssignmentNurse, selectedWeekMonday, effectiveShiftType])

  // Pacientes disponibles en el centro asistencial
  const nonArchivedDevices = useMemo(() => {
    return devices.filter(d => !d.isArchived && d.profile?.isArchived !== true)
  }, [devices])

  // Pacientes pendientes de asignación en este turno y semana (sin enfermero asignado para este turno)
  const pendingPatientsForShift = useMemo(() => {
    const assignedDeviceIdsInShift = new Set(
      patientAssignments
        .filter(a => a.weekStartDate === selectedWeekMonday && a.shiftType === effectiveShiftType && a.active === true)
        .map(a => a.patientDeviceId)
    )
    return nonArchivedDevices.filter(d => !assignedDeviceIdsInShift.has(d.deviceId))
  }, [nonArchivedDevices, patientAssignments, selectedWeekMonday, effectiveShiftType])

  // Historial de asignaciones anteriores o retiradas para este enfermero
  const historyAssignmentsForSelectedNurse = useMemo(() => {
    if (!selectedAssignmentNurse) return []
    return patientAssignments
      .filter(
        a =>
          a.nurseId === selectedAssignmentNurse.id &&
          (a.active === false || a.weekStartDate !== selectedWeekMonday || a.shiftType !== effectiveShiftType)
      )
      .sort((a, b) => (b.withdrawnAt || b.assignedAt).localeCompare(a.withdrawnAt || a.assignedAt))
  }, [patientAssignments, selectedAssignmentNurse, selectedWeekMonday, effectiveShiftType])

  // Pacientes pendientes filtrados por búsqueda
  const availablePatientsFiltered = useMemo(() => {
    const query = assignmentPatientSearch.trim().toLowerCase()
    if (!query) return pendingPatientsForShift
    return pendingPatientsForShift.filter(d => {
      const matchesSearch =
        d.patientName.toLowerCase().includes(query) ||
        d.deviceId.toLowerCase().includes(query) ||
        (d.profile?.roomNumber && d.profile.roomNumber.toLowerCase().includes(query)) ||
        (d.profile?.floor && d.profile.floor.toLowerCase().includes(query))
      return matchesSearch
    })
  }, [pendingPatientsForShift, assignmentPatientSearch])

  // Resumen métrico específico para el turno y semana seleccionados
  const shiftSpecificStats = useMemo(() => {
    const assignedCount = patientAssignments.filter(
      a => a.weekStartDate === selectedWeekMonday && a.shiftType === effectiveShiftType && a.active === true
    ).length
    return {
      scheduledNursesCount: scheduledNursesInShift.length,
      assignedPatientsCount: assignedCount,
      pendingPatientsCount: pendingPatientsForShift.length,
      totalHospitalized: nonArchivedDevices.length,
    }
  }, [scheduledNursesInShift, patientAssignments, selectedWeekMonday, effectiveShiftType, pendingPatientsForShift, nonArchivedDevices])

  // ──────────────────────────────────────────────
  // Lista de enfermeros para el directorio asistencial
  // Muestra únicamente a los enfermeros programados para este turno en esta semana
  // Filtrada mediante la barra de búsqueda ubicada debajo de "3. Enfermeros en Turno"
  // ──────────────────────────────────────────────
  const nursesForNurseView = useMemo(() => {
    const q = assignmentNurseSearch.trim().toLowerCase()
    if (!q) return scheduledNursesInShift

    return scheduledNursesInShift.filter(nurse => {
      // A) Coincidencia directa con datos del enfermero (nombre, correo, teléfono)
      const matchesNurse =
        nurse.fullName.toLowerCase().includes(q) ||
        nurse.email.toLowerCase().includes(q) ||
        (nurse.phoneNumber && nurse.phoneNumber.toLowerCase().includes(q))

      if (matchesNurse) return true

      // B) Búsqueda por paciente a su cargo: coincide con algún paciente asignado a este enfermero en la semana y turno
      const assignedToNurse = patientAssignments.filter(
        a =>
          a.nurseId === nurse.id &&
          a.weekStartDate === selectedWeekMonday &&
          a.shiftType === effectiveShiftType &&
          a.active
      )
      return assignedToNurse.some(
        a =>
          a.patientName.toLowerCase().includes(q) ||
          a.patientDeviceId.toLowerCase().includes(q) ||
          (a.roomNumber && a.roomNumber.toLowerCase().includes(q)) ||
          (a.floor && a.floor.toLowerCase().includes(q))
      )
    })
  }, [scheduledNursesInShift, assignmentNurseSearch, patientAssignments, selectedWeekMonday, effectiveShiftType])

  // ──────────────────────────────────────────────
  // Navegación de Semanas
  // ──────────────────────────────────────────────
  const handlePrevWeek = () => {
    try {
      const prev = format(addDays(parseISO(selectedWeekMonday), -7), 'yyyy-MM-dd')
      setSelectedWeekMonday(prev)
    } catch {
      setSelectedWeekMonday(currentWeekMonday)
    }
  }

  const handleNextWeek = () => {
    try {
      const next = format(addDays(parseISO(selectedWeekMonday), 7), 'yyyy-MM-dd')
      setSelectedWeekMonday(next)
    } catch {
      setSelectedWeekMonday(currentWeekMonday)
    }
  }

  const handleCurrentWeek = () => {
    setSelectedWeekMonday(currentWeekMonday)
  }

  // ──────────────────────────────────────────────
  // Manejadores de Turnos
  // ──────────────────────────────────────────────
  const handleOpenNewShift = (presetNurseId?: string) => {
    setEditingShift(null)
    setModalNurseId(presetNurseId || activeNurses[0]?.id || '')
    setModalShiftType('matutino')
    setModalWeekStartDate(selectedWeekMonday)
    setModalDays(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'])
    setModalNotes('')
    setShiftConflictError(null)
    setShiftModalOpen(true)
  }

  const handleOpenEditShift = (assignment: NurseShiftAssignment) => {
    setEditingShift(assignment)
    setModalNurseId(assignment.nurseId)
    setModalShiftType(assignment.shiftType)
    setModalWeekStartDate(assignment.weekStartDate)
    setModalDays(assignment.days || ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'])
    setModalNotes(assignment.notes || '')
    setShiftConflictError(null)
    setShiftModalOpen(true)
  }

  const toggleModalDay = (day: string) => {
    if (modalDays.includes(day)) {
      if (modalDays.length > 1) {
        setModalDays(modalDays.filter(d => d !== day))
      }
    } else {
      setModalDays([...modalDays, day])
    }
  }

  const handleSaveShift = (e: React.FormEvent) => {
    e.preventDefault()
    setShiftConflictError(null)

    if (!modalNurseId) {
      setShiftConflictError('Por favor selecciona a un enfermero.')
      return
    }

    const selectedNurse = users.find(u => u.id === modalNurseId)
    if (!selectedNurse) {
      setShiftConflictError('Enfermero no encontrado.')
      return
    }

    try {
      saveOrUpdateNurseShift({
        id: editingShift?.id,
        nurseId: modalNurseId,
        nurseName: selectedNurse.fullName,
        nurseEmail: selectedNurse.email,
        weekStartDate: modalWeekStartDate,
        shiftType: modalShiftType,
        days: modalDays,
        notes: modalNotes.trim(),
        assignedByUserName: user?.fullName || 'Lic. Laura Martínez',
      })

      const updatedAssignments = getShiftAssignments()
      setShiftAssignments(updatedAssignments)
      setShiftModalOpen(false)

      const shiftName = shiftConfigs[modalShiftType]?.name || modalShiftType
      setSuccessMsg(
        editingShift
          ? `Turno ${shiftName} actualizado para ${selectedNurse.fullName} (${formatWeekLabel(modalWeekStartDate)}).`
          : `Turno ${shiftName} programado exitosamente para ${selectedNurse.fullName}.`
      )
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: any) {
      setShiftConflictError(err.message || 'Error al guardar la asignación de turno.')
    }
  }

  // ──────────────────────────────────────────────
  // Configuración de Horarios del Centro
  // ──────────────────────────────────────────────
  const handleOpenConfigHours = () => {
    setTempShiftConfigs({ ...shiftConfigs })
    setConfigHoursModalOpen(true)
  }

  const handleSaveConfigHours = (e: React.FormEvent) => {
    e.preventDefault()
    saveShiftConfigs(tempShiftConfigs)
    setShiftConfigs(tempShiftConfigs)
    setConfigHoursModalOpen(false)
    setSuccessMsg('Horarios de turnos del establecimiento actualizados correctamente.')
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  // ──────────────────────────────────────────────
  // Manejadores de Asignación Territorial de Pacientes
  // ──────────────────────────────────────────────
  const handleAssignSinglePatient = async (device: DeviceState) => {
    if (!selectedAssignmentNurse) return
    const shiftToUse = effectiveShiftType
    const room = device.profile?.roomNumber || 'Hab. 101'
    const floor = device.profile?.floor || 'Piso 1'

    // Validación principal: El enfermero debe tener programado este turno en la semana seleccionada
    const isScheduled = shiftAssignments.some(
      s => s.nurseId === selectedAssignmentNurse.id && s.weekStartDate === selectedWeekMonday && s.shiftType === shiftToUse
    )
    if (!isScheduled) {
      setErrorMsg(`El enfermero ${selectedAssignmentNurse.fullName} no tiene programado el turno ${managedShiftConfig.name} para esta semana.`)
      setTimeout(() => setErrorMsg(null), 4000)
      return
    }

    assignPatientToNurseShift({
      patientDeviceId: device.deviceId,
      patientName: device.patientName,
      roomNumber: room,
      floor: floor,
      nurseId: selectedAssignmentNurse.id,
      nurseName: selectedAssignmentNurse.fullName,
      nurseEmail: selectedAssignmentNurse.email,
      shiftType: shiftToUse,
      weekStartDate: selectedWeekMonday,
      assignedByUserName: user?.fullName || 'Lic. Laura Martínez (Admin)',
      assignedByUserId: user?.id,
    })

    // Sincronizar store en memoria para telemetría y alertas
    await assignPatientToNurseStore(
      device.deviceId,
      selectedAssignmentNurse.id,
      selectedAssignmentNurse.fullName,
      room,
      floor
    )

    setPatientAssignments(getAllPatientShiftAssignments())
    const shiftName = managedShiftConfig.name
    setSuccessMsg(`Paciente ${device.patientName} asignado a ${selectedAssignmentNurse.fullName} en Turno ${shiftName}.`)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const handleBatchAssignPatients = async () => {
    if (!selectedAssignmentNurse || selectedPatientIdsToAssign.length === 0) return
    const shiftToUse = effectiveShiftType

    // Validación principal
    const isScheduled = shiftAssignments.some(
      s => s.nurseId === selectedAssignmentNurse.id && s.weekStartDate === selectedWeekMonday && s.shiftType === shiftToUse
    )
    if (!isScheduled) {
      setErrorMsg(`El enfermero ${selectedAssignmentNurse.fullName} no tiene programado el turno ${managedShiftConfig.name} para esta semana.`)
      setTimeout(() => setErrorMsg(null), 4000)
      return
    }

    for (const devId of selectedPatientIdsToAssign) {
      const dev = devices.find(d => d.deviceId === devId)
      if (dev) {
        const room = dev.profile?.roomNumber || 'Hab. 101'
        const floor = dev.profile?.floor || 'Piso 1'

        assignPatientToNurseShift({
          patientDeviceId: dev.deviceId,
          patientName: dev.patientName,
          roomNumber: room,
          floor: floor,
          nurseId: selectedAssignmentNurse.id,
          nurseName: selectedAssignmentNurse.fullName,
          nurseEmail: selectedAssignmentNurse.email,
          shiftType: shiftToUse,
          weekStartDate: selectedWeekMonday,
          assignedByUserName: user?.fullName || 'Lic. Laura Martínez (Admin)',
          assignedByUserId: user?.id,
        })

        await assignPatientToNurseStore(
          dev.deviceId,
          selectedAssignmentNurse.id,
          selectedAssignmentNurse.fullName,
          room,
          floor
        )
      }
    }

    setPatientAssignments(getAllPatientShiftAssignments())
    const count = selectedPatientIdsToAssign.length
    setSelectedPatientIdsToAssign([])
    setAssignmentSubTab('assigned')
    const shiftName = managedShiftConfig.name
    setSuccessMsg(`${count} pacientes asignados exitosamente a ${selectedAssignmentNurse.fullName} en Turno ${shiftName}.`)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const handleOpenReassign = (assignment: PatientShiftAssignment) => {
    const otherScheduledNurses = scheduledNursesInShift.filter(n => n.id !== assignment.nurseId)
    setReassignModal({
      open: true,
      assignment,
      targetNurseId: otherScheduledNurses[0]?.id || '',
    })
  }

  const handleConfirmReassign = async () => {
    if (!reassignModal.assignment || !reassignModal.targetNurseId) return
    const targetNurse = scheduledNursesInShift.find(n => n.id === reassignModal.targetNurseId)
    if (!targetNurse) return

    assignPatientToNurseShift({
      patientDeviceId: reassignModal.assignment.patientDeviceId,
      patientName: reassignModal.assignment.patientName,
      roomNumber: reassignModal.assignment.roomNumber,
      floor: reassignModal.assignment.floor,
      nurseId: targetNurse.id,
      nurseName: targetNurse.fullName,
      nurseEmail: targetNurse.email,
      shiftType: reassignModal.assignment.shiftType,
      weekStartDate: selectedWeekMonday,
      assignedByUserName: user?.fullName || 'Lic. Laura Martínez (Admin)',
      assignedByUserId: user?.id,
    })

    await assignPatientToNurseStore(
      reassignModal.assignment.patientDeviceId,
      targetNurse.id,
      targetNurse.fullName,
      reassignModal.assignment.roomNumber || 'Habitación',
      reassignModal.assignment.floor || 'Piso 1'
    )

    setPatientAssignments(getAllPatientShiftAssignments())
    const patientName = reassignModal.assignment.patientName
    setReassignModal({ open: false, assignment: null, targetNurseId: '' })
    setSuccessMsg(`Paciente ${patientName} reasignado exitosamente a ${targetNurse.fullName} conservando el registro histórico.`)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const togglePatientSelection = (devId: string) => {
    if (selectedPatientIdsToAssign.includes(devId)) {
      setSelectedPatientIdsToAssign(selectedPatientIdsToAssign.filter(id => id !== devId))
    } else {
      setSelectedPatientIdsToAssign([...selectedPatientIdsToAssign, devId])
    }
  }

  const handleOpenWithdraw = (assignment: PatientShiftAssignment) => {
    setAssignmentToWithdraw(assignment)
    setWithdrawReason('Rotación periódica de personal asistencial')
    setCustomWithdrawReason('')
    setWithdrawModalOpen(true)
  }

  const handleConfirmWithdraw = async () => {
    if (!assignmentToWithdraw) return
    const finalReason = customWithdrawReason.trim() || withdrawReason

    withdrawPatientShiftAssignment({
      assignmentId: assignmentToWithdraw.id,
      reason: finalReason,
      byUserName: user?.fullName || 'Lic. Laura Martínez (Admin)',
      byUserId: user?.id,
    })

    // Si no queda ningún otro enfermero en ningún turno para este paciente, desvincular en store
    const remainingActive = getAllPatientShiftAssignments().filter(
      a => a.patientDeviceId === assignmentToWithdraw.patientDeviceId && a.active === true && a.id !== assignmentToWithdraw.id
    )
    if (remainingActive.length === 0) {
      const dev = devices.find(d => d.deviceId === assignmentToWithdraw.patientDeviceId)
      await assignPatientToNurseStore(
        assignmentToWithdraw.patientDeviceId,
        null,
        null,
        dev?.profile?.roomNumber || 'Habitación',
        dev?.profile?.floor || 'Piso 1'
      )
    }

    setPatientAssignments(getAllPatientShiftAssignments())
    setWithdrawModalOpen(false)
    setSuccessMsg(`Se retiró la asignación de ${assignmentToWithdraw.patientName} conservando el registro en el historial.`)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  // ──────────────────────────────────────────────
  // Manejadores de Usuarios
  // ──────────────────────────────────────────────
  const handleOpenCreateUser = () => {
    setEditingUser(null)
    setFullName('')
    setEmail('')
    setPhoneNumber('')
    setRole('nurse')
    setDefaultShift('matutino')
    setErrorMsg(null)
    setUserModalOpen(true)
  }

  const handleOpenEditUser = (userItem: SystemUser) => {
    setEditingUser(userItem)
    setFullName(userItem.fullName)
    setEmail(userItem.email)
    setPhoneNumber(userItem.phoneNumber)
    setRole(userItem.role)
    setDefaultShift(userItem.defaultShift || 'matutino')
    setErrorMsg(null)
    setUserModalOpen(true)
  }

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!fullName.trim() || !email.trim() || !phoneNumber.trim()) {
      setErrorMsg('Por favor completa todos los campos requeridos.')
      return
    }

    if (editingUser) {
      const updated = users.map(u => {
        if (u.id === editingUser.id) {
          return {
            ...u,
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            phoneNumber: phoneNumber.trim(),
            role,
            defaultShift: role === 'nurse' ? defaultShift : undefined,
          }
        }
        return u
      })
      setUsers(updated)
      saveSystemUsers(updated)
      setSuccessMsg(`Usuario ${fullName} actualizado correctamente.`)
    } else {
      if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
        setErrorMsg('Ya existe una cuenta registrada con este correo electrónico.')
        return
      }

      const newUser: SystemUser = {
        id: `usr-${Date.now()}`,
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        role,
        phoneNumber: phoneNumber.trim(),
        defaultShift: role === 'nurse' ? defaultShift : undefined,
        isActive: true,
        createdAt: new Date().toISOString(),
      }

      const updated = [newUser, ...users]
      setUsers(updated)
      saveSystemUsers(updated)

      // Si es enfermero, programar automáticamente su turno inicial en la semana en curso
      if (role === 'nurse') {
        try {
          saveOrUpdateNurseShift({
            nurseId: newUser.id,
            nurseName: newUser.fullName,
            nurseEmail: newUser.email,
            weekStartDate: currentWeekMonday,
            shiftType: defaultShift,
            days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
            notes: 'Turno inicial asignado al registrar el usuario en el sistema.',
            assignedByUserName: user?.fullName || 'Administración',
          })
          setShiftAssignments(getShiftAssignments())
        } catch (err) {
          console.warn('[UsersManagement] Registro inicial de turno:', err)
        }
      }

      setSuccessMsg(`Cuenta creada para ${fullName}. Credenciales y turno inicial configurados.`)
    }

    setUserModalOpen(false)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const handleOpenSuspendModal = (targetUser: SystemUser) => {
    if (targetUser.email === 'admin@healthnet.com') {
      alert('La cuenta de administrador principal no puede ser suspendida por motivos de seguridad institucional.')
      return
    }
    setSuspensionModalTarget(targetUser)
    setSuspensionReason('Suspensión administrativa de credenciales')
  }

  const handleConfirmSuspend = async () => {
    if (!suspensionModalTarget) return
    if (suspensionModalTarget.email === 'admin@healthnet.com') {
      alert('La cuenta de administrador principal no puede ser suspendida.')
      setSuspensionModalTarget(null)
      return
    }

    const nowIso = new Date().toISOString()
    const updated = users.map(u => {
      if (u.id === suspensionModalTarget.id) {
        return {
          ...u,
          isActive: false,
          suspendedAt: nowIso,
          suspendedBy: user?.fullName || 'Administrador',
          suspendedByUserId: user?.id || '',
          suspendedReason: suspensionReason.trim() || 'Suspensión administrativa de credenciales',
        }
      }
      return u
    })

    setUsers(updated)
    saveSystemUsers(updated)

    // Registrar en auditoría
    if (user) {
      try {
        await logAuditEvent({
          userId: user.id,
          userEmail: user.email,
          userRole: 'admin',
          userName: user.fullName,
          action: 'SUSPEND_ACCOUNT',
          entityType: 'user',
          entityId: suspensionModalTarget.id,
          details: `Cuenta de ${suspensionModalTarget.fullName} (${suspensionModalTarget.email}) suspendida por ${user.fullName} el ${new Date().toLocaleString('es-ES')}. Motivo: ${suspensionReason.trim() || 'Suspensión administrativa de credenciales'}`
        })
      } catch (e) {
        console.warn('Error registrando auditoría de suspensión:', e)
      }
    }

    setSuccessMsg(`Cuenta de ${suspensionModalTarget.fullName} suspendida. Se ha bloqueado su inicio de sesión conservando sus registros históricos.`)
    setSuspensionModalTarget(null)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const handleReactivateUser = async (targetUser: SystemUser) => {
    const updated = users.map(u => {
      if (u.id === targetUser.id) {
        return {
          ...u,
          isActive: true,
          suspendedAt: undefined,
          suspendedBy: undefined,
          suspendedByUserId: undefined,
          suspendedReason: undefined,
        }
      }
      return u
    })

    setUsers(updated)
    saveSystemUsers(updated)

    if (user) {
      try {
        await logAuditEvent({
          userId: user.id,
          userEmail: user.email,
          userRole: 'admin',
          userName: user.fullName,
          action: 'REACTIVATE_ACCOUNT',
          entityType: 'user',
          entityId: targetUser.id,
          details: `Cuenta de ${targetUser.fullName} (${targetUser.email}) reactivada por ${user.fullName} el ${new Date().toLocaleString('es-ES')}.`
        })
      } catch (e) {
        console.warn('Error registrando auditoría de reactivación:', e)
      }
    }

    setSuccessMsg(`Cuenta de ${targetUser.fullName} reactivada con éxito. Ya puede iniciar sesión nuevamente.`)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  // Filtrado de Usuarios (Búsqueda + Rol + Estado de Cuenta)
  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.phoneNumber.includes(search)
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && u.isActive) ||
      (statusFilter === 'suspended' && !u.isActive)
    return matchesSearch && matchesRole && matchesStatus
  })

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'admin':
        return {
          label: 'Administrador',
          color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-800',
          icon: Shield,
        }
      case 'doctor':
        return {
          label: 'Médico',
          color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 border-sky-200 dark:border-sky-800',
          icon: Stethoscope,
        }
      case 'nurse':
        return {
          label: 'Enfermero',
          color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
          icon: HeartHandshake,
        }
    }
  }

  return (
    <div className="space-y-6">
      {/* ────────────────────────────────────────────── */}
      {/* ENCABEZADO PRINCIPAL                          */}
      {/* ────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider mb-2 border ${
            isAdmin
              ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-800/40 text-purple-700 dark:text-purple-300'
              : isDoctor
              ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-800/40 text-sky-700 dark:text-sky-300'
              : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300'
          }`}>
            {isAdmin ? (
              <>
                <Shield size={12} />
                <span>Módulo de Administración de Personal y Asignación de Turnos</span>
              </>
            ) : isDoctor ? (
              <>
                <Stethoscope size={12} />
                <span>Consulta Médica · Enfermeros Responsables de Pacientes (Solo Lectura)</span>
              </>
            ) : (
              <>
                <HeartHandshake size={12} />
                <span>Portal de Enfermería · Mis Pacientes Asignados</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
            {isNurse
              ? 'Mis Pacientes Asignados y Horario'
              : isDoctor
              ? 'Enfermeros Responsables de Pacientes'
              : 'Control de Personal, Turnos y Asignación de Pacientes'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isNurse
              ? 'Consulta los pacientes a tu cargo durante tu turno programado y el historial de atención.'
              : isDoctor
              ? 'Supervisión clínica de los enfermeros asignados a cada paciente según su turno de trabajo (modo solo lectura).'
              : 'Gestión por enfermero responsable: selecciona el turno, la semana y el enfermero para administrar los pacientes a su cargo.'}
          </p>
        </div>

        {/* Botones de acción según pestaña y rol */}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'users' && (
              <button
                onClick={handleOpenCreateUser}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-hn-800 hover:bg-hn-900 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-hn-900/20 cursor-pointer"
              >
                <UserPlus size={16} />
                <span>Registrar Nuevo Usuario</span>
              </button>
            )}

            {activeTab === 'shifts' && (
              <>
                <button
                  onClick={handleOpenConfigHours}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                  title="Configurar horas de inicio y fin de los turnos del centro"
                >
                  <SlidersHorizontal size={15} />
                  <span>Configurar Horarios</span>
                </button>

                <button
                  onClick={() => handleOpenNewShift()}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-hn-800 hover:bg-hn-900 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-hn-900/20 cursor-pointer"
                >
                  <Calendar size={16} />
                  <span>+ Programar Turno Semanal</span>
                </button>
              </>
            )}

            {activeTab === 'assignments' && (
              <button
                onClick={() => setAssignmentSubTab('available')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-emerald-900/20 cursor-pointer"
              >
                <Plus size={16} />
                <span>Asignar Pacientes a Enfermero</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────── */}
      {/* SELECTOR DE PESTAÑAS (TABS)                    */}
      {/* Doctor únicamente puede ver: Asignación de Pacientes */}
      {/* ────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 overflow-x-auto pb-1">
        {/* Pestaña: Personal y Cuentas (EXCLUSIVA DE ADMINISTRADOR - Doctor y Enfermero NO PUEDEN VER) */}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 pb-3 px-4 text-xs font-black transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            <Users size={16} />
            <span>Personal y Cuentas RBAC</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              {users.length}
            </span>
          </button>
        )}

        {/* Pestaña: Programación Semanal de Turnos (Admin y Enfermero - Doctor NO PUEDE VER) */}
        {!isDoctor && (
          <button
            onClick={() => setActiveTab('shifts')}
            className={`flex items-center gap-2 pb-3 px-4 text-xs font-black transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'shifts'
                ? 'border-hn-800 text-hn-800 dark:border-sky-400 dark:text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            <CalendarDays size={16} />
            <span>{isNurse ? 'Mi Turno y Rotación Semanal' : 'Programación Semanal de Turnos'}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-mono font-bold">
              3 Turnos
            </span>
          </button>
        )}

        {/* Pestaña: Asignación de Pacientes por Turno (Disponible para todos, para Doctor es su vista clínica única) */}
        <button
          onClick={() => setActiveTab('assignments')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-black transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === 'assignments'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
          }`}
        >
          <Building2 size={16} />
          <span>
            {isDoctor
              ? 'Enfermeros Responsables de Pacientes'
              : isNurse
              ? 'Mis Pacientes Asignados'
              : 'Asignación de Pacientes por Enfermero'}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-bold">
            {nonArchivedDevices.length} Pacientes
          </span>
        </button>
      </div>

      {/* Banner de Mensaje de Éxito */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ────────────────────────────────────────────── */}
      {/* PESTAÑA 1: GESTIÓN DE PERSONAL Y USUARIOS RBAC */}
      {/* ────────────────────────────────────────────── */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-6">
          {/* Resumen de Políticas de Roles RBAC */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {/* 1. Rol: Administrador */}
            <div className="bg-white dark:bg-slate-900 border border-purple-200/80 dark:border-purple-800/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:border-purple-300 dark:hover:border-purple-700">
              <div>
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-purple-100 dark:border-purple-900/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold">
                      <Shield size={17} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                        Administrador
                      </h4>
                      <p className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">
                        Control Total Institucional
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40">
                    Nivel 1
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                  Responsable de la gestión del sistema, gobierno de identidades y administración operativa de recursos.
                </p>

                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Atribuciones del Permiso:
                  </p>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>Alta, edición y suspensión de credenciales RBAC.</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>Programación y rotación semanal de turnos.</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>Asignación territorial de pacientes por enfermero y turno.</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>Registro, archivo y asignación de brazaletes IoT.</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-semibold">Acceso al Módulo:</span>
                <span className="font-mono font-bold text-purple-700 dark:text-purple-300">Personal · Turnos · Asignaciones</span>
              </div>
            </div>

            {/* 2. Rol: Médico Especialista (Doctor) */}
            <div className="bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-sky-800/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:border-sky-300 dark:hover:border-sky-700">
              <div>
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-sky-100 dark:border-sky-900/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center font-bold">
                      <Stethoscope size={17} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                        Médico Especialista
                      </h4>
                      <p className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">
                        Gestión Clínica y Umbrales
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40">
                    Nivel 2
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                  Responsable del diagnóstico clínico, límites de alerta y supervisión asistencial de los pacientes.
                </p>

                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Atribuciones del Permiso:
                  </p>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                    <span>Calibración de umbrales clínicos de alerta (BPM y °C).</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                    <span>Edición de expediente clínico y notas de diagnóstico.</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                    <span>Atención y resolución médica de alertas críticas.</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                    <span>Consulta de enfermeros asignados a sus pacientes.</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-semibold">Acceso al Módulo:</span>
                <span className="font-mono font-bold text-sky-700 dark:text-sky-300">Enfermeros Responsables</span>
              </div>
            </div>

            {/* 3. Rol: Enfermero */}
            <div className="bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
              <div>
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-emerald-100 dark:border-emerald-900/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                      <HeartHandshake size={17} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                        Enfermero Operativo
                      </h4>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                        Atención en Piso y Cuidados
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                    Nivel 3
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                  Responsable del monitoreo de signos vitales, respuesta rápida a alertas y registro de somatometría.
                </p>

                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Atribuciones del Permiso:
                  </p>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Monitoreo continuo de pacientes y brazaletes IoT.</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Atención y acuse inmediato de alertas y caídas.</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Actualización autorizada de peso y estatura.</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                    <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Consulta de su turno laboral y pacientes asignados.</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-semibold">Acceso al Módulo:</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">Mi Turno · Mis Pacientes</span>
              </div>
            </div>
          </div>

          {/* Filtros y Buscador */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, correo o teléfono..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hn-800/30"
              />
            </div>

            {/* Filtros por Rol */}
            <div className="flex items-center gap-1.5 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
              {(['all', 'admin', 'doctor', 'nurse'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    roleFilter === r
                      ? 'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {r === 'all' ? 'Todos los Roles' : r === 'admin' ? 'Administradores' : r === 'doctor' ? 'Doctores' : 'Enfermeros'}
                </button>
              ))}
            </div>

            {/* Filtros de Estado de Cuenta (Activa / Suspendida) */}
            <div className="flex items-center gap-1.5 w-full lg:w-auto border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-2 lg:pt-0 lg:pl-3 overflow-x-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1 hidden sm:inline">
                Estado:
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                Todas ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                  statusFilter === 'active'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/40'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Activas ({users.filter(u => u.isActive).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('suspended')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                  statusFilter === 'suspended'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-red-700 bg-red-50/60 dark:bg-red-950/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>Suspendidas ({users.filter(u => !u.isActive).length})</span>
              </button>
            </div>
          </div>

          {/* Tabla de Usuarios */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="py-3 px-5">Profesional / Usuario</th>
                    <th className="py-3 px-4">Rol Asignado</th>
                    <th className="py-3 px-4">Turno Actual / Próximo</th>
                    <th className="py-3 px-4">Teléfono Móvil (Alertas)</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-5 text-right">{isAdmin ? 'Acciones' : 'Permiso'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        No se encontraron usuarios que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(userItem => {
                      const badge = getRoleBadge(userItem.role)
                      const RoleIcon = badge.icon

                      return (
                        <tr
                          key={userItem.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-hn-100 dark:bg-slate-800 text-hn-800 dark:text-sky-300 font-bold flex items-center justify-center text-xs">
                                {userItem.fullName[0]?.toUpperCase() || 'U'}
                              </div>
                              <div>
                                <p className="font-bold text-slate-800 dark:text-white leading-tight">
                                  {userItem.fullName}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                                  {userItem.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${badge.color}`}>
                              <RoleIcon size={12} />
                              {badge.label}
                            </span>
                          </td>

                          {/* Columna de Turno Actual / Próximo programado */}
                          <td className="py-3.5 px-4">
                            {userItem.role === 'nurse' ? (
                              (() => {
                                const shiftInfo = getCurrentOrNextShift(userItem.id, shiftAssignments, shiftConfigs)
                                if (shiftInfo.status === 'sin_asignar' || !shiftInfo.shift) {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                                      <Clock size={12} className="text-slate-400" />
                                      <span>Sin turno programado</span>
                                    </span>
                                  )
                                }
                                const style = getShiftStyle(shiftInfo.shift.id)
                                const ShiftIcon = shiftInfo.shift.id === 'matutino' ? Sun : shiftInfo.shift.id === 'vespertino' ? Sunset : Moon
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border w-fit ${style.badge}`}>
                                      <ShiftIcon size={12} />
                                      <span>{shiftInfo.badgeLabel}</span>
                                    </span>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono ml-1">
                                      {shiftInfo.hoursLabel}
                                    </span>
                                  </div>
                                )
                              })()
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 text-[11px] font-mono">
                                {userItem.role === 'doctor' ? 'Personal Clínico' : 'Administración'}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300 text-[11px]">
                            {userItem.phoneNumber || '—'}
                          </td>

                          <td className="py-3.5 px-4">
                            {userItem.isActive ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/40">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Activa
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-[10px] font-bold border border-red-200 dark:border-red-800/40">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  Suspendida
                                </span>
                                {userItem.suspendedAt && (
                                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-mono leading-tight" title={`Suspendida por ${userItem.suspendedBy || 'Administrador'}${userItem.suspendedReason ? ` - Motivo: ${userItem.suspendedReason}` : ''}`}>
                                    {new Date(userItem.suspendedAt).toLocaleDateString('es-ES')} · {userItem.suspendedBy?.split(' ')[0] || 'Admin'}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-5 text-right space-x-2">
                            {isAdmin ? (
                              <>
                                <button
                                  onClick={() => handleOpenEditUser(userItem)}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                                  title="Editar rol y datos"
                                >
                                  <Edit2 size={12} />
                                  <span>Editar</span>
                                </button>

                                {userItem.isActive ? (
                                  <button
                                    onClick={() => handleOpenSuspendModal(userItem)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-200/60 dark:border-red-800/40"
                                    title="Suspender acceso de esta cuenta"
                                  >
                                    Suspender
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleReactivateUser(userItem)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-800/40"
                                    title="Reactivar acceso de esta cuenta"
                                  >
                                    Reactivar
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                                Solo Consulta
                              </span>
                            )}
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
      {/* PESTAÑA 2: PROGRAMACIÓN SEMANAL DE TURNOS (ROTACIONES)   */}
      {/* (Oculta para Doctor - Doctor no puede verla)            */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'shifts' && !isDoctor && (
        <div className="space-y-6">
          {/* Barra de Control y Navegación Semanal */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Controles de Navegación de Semanas */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handlePrevWeek}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="Semana anterior"
                >
                  <ChevronLeft size={16} />
                  <span>Anterior</span>
                </button>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <Calendar size={15} className="text-hn-800 dark:text-sky-400" />
                  <span className="text-xs font-black text-slate-800 dark:text-white">
                    {formatWeekLabel(selectedWeekMonday)}
                  </span>

                  {isSelectedCurrentWeek ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-700/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Semana Actual
                    </span>
                  ) : isSelectedPastWeek ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold border border-amber-200 dark:border-amber-700/50">
                      <HistoryIcon size={10} />
                      Historial Pasado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 text-[10px] font-bold border border-sky-200 dark:border-sky-700/50">
                      <Sparkles size={10} />
                      Programación Futura
                    </span>
                  )}
                </div>

                <button
                  onClick={handleNextWeek}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="Semana siguiente"
                >
                  <span>Siguiente</span>
                  <ChevronRight size={16} />
                </button>

                {!isSelectedCurrentWeek && (
                  <button
                    onClick={handleCurrentWeek}
                    className="px-3 py-2 rounded-xl bg-hn-50 hover:bg-hn-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-hn-900 dark:text-sky-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    title="Volver a la semana en curso"
                  >
                    <RotateCcw size={13} />
                    <span>Semana Actual</span>
                  </button>
                )}
              </div>

              {/* Selector Rápido de Semanas */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                  Saltar a:
                </span>
                <select
                  value={selectedWeekMonday}
                  onChange={e => setSelectedWeekMonday(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-hn-800/30"
                >
                  {weekOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} {opt.isCurrent ? '★ (Actual)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Aviso informativo de preservación histórica */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Info size={14} className="text-hn-800 dark:text-sky-400 flex-shrink-0" />
                <span>
                  <strong>Historial protegido:</strong> Las rotaciones se registran cronológicamente por semana. Modificar la programación de una semana no sobrescribe ni altera los registros de turnos de semanas anteriores.
                </span>
              </div>
              {isSelectedPastWeek && (
                <span className="font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap ml-2">
                  Modo Auditoría Histórica
                </span>
              )}
            </div>
          </div>

          {/* Métricas de Distribución de Turnos de la Semana (Ocultos en vista de Enfermero) */}
          {!isNurse && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase mb-1">
                  <Users size={14} />
                  <span>Enfermeros Activos</span>
                </div>
                <p className="text-2xl font-black text-slate-800 dark:text-white">
                  {shiftMetrics.totalNurses}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Plantilla total registrada</p>
              </div>

              {/* Matutino */}
              <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-500/5">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold text-[10px] uppercase mb-1">
                  <Sun size={14} />
                  <span>Turno Matutino</span>
                </div>
                <p className="text-2xl font-black text-amber-800 dark:text-amber-200">
                  {shiftMetrics.matutino}
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                  {shiftConfigs.matutino.startTime} - {shiftConfigs.matutino.endTime}
                </p>
              </div>

              {/* Vespertino */}
              <div className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-500/30 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-sky-50/50 to-transparent dark:from-sky-500/5">
                <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-bold text-[10px] uppercase mb-1">
                  <Sunset size={14} />
                  <span>Turno Vespertino</span>
                </div>
                <p className="text-2xl font-black text-sky-800 dark:text-sky-200">
                  {shiftMetrics.vespertino}
                </p>
                <p className="text-[10px] text-sky-600 dark:text-sky-400 font-mono mt-0.5">
                  {shiftConfigs.vespertino.startTime} - {shiftConfigs.vespertino.endTime}
                </p>
              </div>

              {/* Nocturno */}
              <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-500/5">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] uppercase mb-1">
                  <Moon size={14} />
                  <span>Turno Nocturno</span>
                </div>
                <p className="text-2xl font-black text-indigo-800 dark:text-indigo-200">
                  {shiftMetrics.nocturno}
                </p>
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
                  {shiftConfigs.nocturno.startTime} - {shiftConfigs.nocturno.endTime}
                </p>
              </div>

              {/* Sin Turno / Pendiente */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase mb-1">
                  <Clock size={14} />
                  <span>Sin Asignar / Franco</span>
                </div>
                <p className="text-2xl font-black text-slate-500 dark:text-slate-400">
                  {shiftMetrics.unassigned}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Descanso o pendiente</p>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* VISTA ESPECÍFICA PARA ENFERMERO (MI TURNO INDIVIDUAL)    */}
          {/* ──────────────────────────────────────────────────────── */}
          {isNurse ? (
            <div className="space-y-6">
              {(() => {
                const myAssignment = weekAssignments.find(
                  a => a.nurseEmail?.toLowerCase() === (user?.email || '').toLowerCase() ||
                       (currentNurseUser && a.nurseId === currentNurseUser.id)
                )

                if (myAssignment) {
                  const cfg = shiftConfigs[myAssignment.shiftType] || DEFAULT_SHIFT_CONFIGS[myAssignment.shiftType]
                  const style = getShiftStyle(myAssignment.shiftType)
                  const ShiftIcon = myAssignment.shiftType === 'matutino' ? Sun : myAssignment.shiftType === 'vespertino' ? Sunset : Moon

                  return (
                    <div className={`p-6 rounded-3xl border ${style.border} ${style.bg} space-y-4 shadow-sm`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-2xl ${style.badge} flex items-center justify-center font-black`}>
                            <ShiftIcon size={24} />
                          </div>
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Mi Turno de Trabajo Programado
                            </span>
                            <h2 className="text-xl font-black text-slate-800 dark:text-white">
                              Turno {cfg.name} ({cfg.startTime} a {cfg.endTime} hrs)
                            </h2>
                          </div>
                        </div>

                        <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border ${style.badge}`}>
                          {myAssignment.shiftType.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                            Días de Cobertura
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {myAssignment.days?.map(d => (
                              <span
                                key={d}
                                className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-bold border border-slate-200 dark:border-slate-700"
                              >
                                {d}
                              </span>
                            )) || <span className="text-xs text-slate-500">Lunes a Viernes</span>}
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                            Supervisor Responsable
                          </p>
                          <p className="text-xs font-bold text-slate-800 dark:text-white mt-1">
                            {myAssignment.assignedByUserName || 'Lic. Laura Martínez (Admin)'}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                            Notas Clínicas de la Rotación
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">
                            {myAssignment.notes || 'Sin observaciones particulares.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3 shadow-sm">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                      <Clock size={24} />
                    </div>
                    <h3 className="text-base font-black text-slate-800 dark:text-white">
                      Sin Turno Programado para Esta Semana
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      No tienes asignado un turno de trabajo para la {formatWeekLabel(selectedWeekMonday)}. Puedes consultar con el Administrador si requieres cubrir una guardia.
                    </p>
                  </div>
                )
              })()}

              {/* Historial Cronológico de Turnos Anteriores para el Enfermero */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-slate-800 dark:text-white font-black text-sm">
                  <HistoryIcon size={18} className="text-hn-800 dark:text-sky-400" />
                  <span>Mi Historial de Rotaciones y Turnos Anteriores</span>
                </div>
                <p className="text-xs text-slate-500">
                  Registro cronológico de los turnos que has cubierto en el centro asistencial.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="py-2.5 px-3">Semana</th>
                        <th className="py-2.5 px-3">Turno Cubierto</th>
                        <th className="py-2.5 px-3">Horario</th>
                        <th className="py-2.5 px-3">Días</th>
                        <th className="py-2.5 px-3">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {shiftAssignments
                        .filter(
                          a => a.nurseEmail?.toLowerCase() === (user?.email || '').toLowerCase() ||
                               (currentNurseUser && a.nurseId === currentNurseUser.id)
                        )
                        .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
                        .map(item => {
                          const cfg = shiftConfigs[item.shiftType] || DEFAULT_SHIFT_CONFIGS[item.shiftType]
                          const style = getShiftStyle(item.shiftType)
                          const ShiftIcon = item.shiftType === 'matutino' ? Sun : item.shiftType === 'vespertino' ? Sunset : Moon
                          const isCurrent = item.weekStartDate === currentWeekMonday

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800 dark:text-white">
                                    {formatWeekLabel(item.weekStartDate)}
                                  </span>
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                                      Actual
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border ${style.badge}`}>
                                  <ShiftIcon size={12} />
                                  <span>{cfg.name}</span>
                                </span>
                              </td>

                              <td className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {cfg.startTime} - {cfg.endTime}
                              </td>

                              <td className="py-3 px-3 text-[11px] text-slate-500">
                                {item.days?.join(', ') || 'Lun - Vie'}
                              </td>

                              <td className="py-3 px-3 text-[11px] text-slate-500 italic">
                                {item.notes || '—'}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* ──────────────────────────────────────────────────────── */
            /* VISTA DE PLANTILLA COMPLETA PARA ADMIN Y DOCTORES       */
            /* ──────────────────────────────────────────────────────── */
            <div className="space-y-4">
              {/* Buscador de Enfermeros y Filtros de Turnos */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
                <div className="relative w-full md:w-80">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={nurseShiftSearch}
                    onChange={e => setNurseShiftSearch(e.target.value)}
                    placeholder="Buscar enfermero por nombre, correo o teléfono..."
                    className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-medium"
                  />
                  {nurseShiftSearch && (
                    <button
                      type="button"
                      onClick={() => setNurseShiftSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title="Limpiar búsqueda"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  <span className="text-[10px] font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
                    <Filter size={12} />
                    Turno:
                  </span>
                  {(['all', 'matutino', 'vespertino', 'nocturno', 'unassigned'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setShiftFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        shiftFilter === f
                          ? 'bg-hn-800 text-white dark:bg-sky-500 dark:text-slate-950 shadow-sm'
                          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {f === 'all'
                        ? 'Todos los Turnos'
                        : f === 'matutino'
                        ? 'Matutino'
                        : f === 'vespertino'
                        ? 'Vespertino'
                        : f === 'nocturno'
                        ? 'Nocturno'
                        : 'Sin Asignar'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rejilla de Enfermeros y Turnos Asignados con Filtrado Dinámico */}
              {(() => {
                const query = nurseShiftSearch.trim().toLowerCase()
                const filteredNurses = activeNurses.filter(nurse => {
                  const matchesSearch =
                    !query ||
                    nurse.fullName.toLowerCase().includes(query) ||
                    nurse.email.toLowerCase().includes(query) ||
                    nurse.phoneNumber.includes(query)

                  if (!matchesSearch) return false

                  const assignment = weekAssignments.find(a => a.nurseId === nurse.id)
                  if (shiftFilter === 'all') return true
                  if (shiftFilter === 'unassigned') return !assignment
                  return assignment?.shiftType === shiftFilter
                })

                if (filteredNurses.length === 0) {
                  return (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-3 shadow-sm">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                        <Search size={22} />
                      </div>
                      <h4 className="text-sm font-black text-slate-800 dark:text-white">
                        No se encontraron enfermeros coincidentes
                      </h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        No hay personal de enfermería que coincida con {nurseShiftSearch ? `"${nurseShiftSearch}"` : 'el filtro seleccionado'}.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setNurseShiftSearch('')
                          setShiftFilter('all')
                        }}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <RotateCcw size={13} />
                        <span>Restablecer Filtros y Búsqueda</span>
                      </button>
                    </div>
                  )
                }

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 font-mono px-1">
                      <span>
                        Mostrando {filteredNurses.length} de {activeNurses.length} enfermeros
                      </span>
                      {nurseShiftSearch && (
                        <span className="text-hn-800 dark:text-sky-400 font-bold">
                          Filtro activo: "{nurseShiftSearch}"
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredNurses.map(nurse => {
                        const assignment = weekAssignments.find(a => a.nurseId === nurse.id)
                        const cfg = assignment
                          ? shiftConfigs[assignment.shiftType] || DEFAULT_SHIFT_CONFIGS[assignment.shiftType]
                          : null
                        const style = assignment ? getShiftStyle(assignment.shiftType) : null
                        const ShiftIcon =
                          assignment?.shiftType === 'matutino'
                            ? Sun
                            : assignment?.shiftType === 'vespertino'
                            ? Sunset
                            : Moon

                        return (
                          <div
                            key={nurse.id}
                            className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between ${
                              assignment && style ? style.border : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="space-y-4">
                              {/* Cabecera del Enfermero */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-black flex items-center justify-center text-sm flex-shrink-0">
                                    {nurse.fullName[0]?.toUpperCase() || 'E'}
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-slate-800 dark:text-white text-sm leading-tight">
                                      {nurse.fullName}
                                    </h3>
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                                      {nurse.email}
                                    </p>
                                  </div>
                                </div>

                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                  {nurse.phoneNumber}
                                </span>
                              </div>

                              {/* Tarjeta de Turno de la Semana */}
                              {assignment && cfg && style ? (
                                <div className={`p-3.5 rounded-2xl border ${style.border} ${style.bg} space-y-2.5`}>
                                  <div className="flex items-center justify-between">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black border ${style.badge}`}>
                                      <ShiftIcon size={14} />
                                      <span>Turno {cfg.name}</span>
                                    </span>
                                    <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-200">
                                      {cfg.startTime} - {cfg.endTime}
                                    </span>
                                  </div>

                                  {/* Días cubiertos */}
                                  <div className="flex flex-wrap gap-1">
                                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => {
                                      const isActive = assignment.days?.includes(day)
                                      return (
                                        <span
                                          key={day}
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                            isActive
                                              ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                                              : 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-400 line-through opacity-40'
                                          }`}
                                        >
                                          {day.slice(0, 3)}
                                        </span>
                                      )
                                    })}
                                  </div>

                                  {assignment.notes && (
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 italic pt-1 border-t border-slate-200/40 dark:border-slate-700/40">
                                      "{assignment.notes}"
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/20 text-center space-y-1">
                                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                    Sin turno asignado en esta semana
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    Disponible para guardias, rotación o descanso programado.
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Botón de Modificación (Solo Admin) */}
                            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                              {isAdmin ? (
                                assignment ? (
                                  <button
                                    onClick={() => handleOpenEditShift(assignment)}
                                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <Edit2 size={12} />
                                    <span>Modificar Turno</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleOpenNewShift(nurse.id)}
                                    className="px-3 py-1.5 rounded-xl bg-hn-800 hover:bg-hn-900 text-white text-xs font-bold transition-all shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <Calendar size={12} />
                                    <span>Asignar Turno</span>
                                  </button>
                                )
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400">
                                  Supervisión Médica
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* PESTAÑA 3: ASIGNACIÓN DE PACIENTES POR ENFERMERO Y TURNO */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          {/* Métricas de Asignación y Resumen del Turno (Ocultos en vista de Enfermero) */}
          {!isNurse && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Enfermeros en Turno
                  </p>
                  <p className="text-xl font-black text-purple-600 dark:text-purple-400">
                    {shiftSpecificStats.scheduledNursesCount} <span className="text-xs text-slate-400 font-normal">/ {assignmentStats.totalNurses}</span>
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
                  <UserCheck size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Pacientes Asignados
                  </p>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                    {shiftSpecificStats.assignedPatientsCount} / {shiftSpecificStats.totalHospitalized}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Pacientes Pendientes
                  </p>
                  <p className="text-xl font-black text-amber-600 dark:text-amber-400">
                    {shiftSpecificStats.pendingPatientsCount}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                  Distribución por Turno
                </p>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className={`px-1.5 py-0.5 rounded ${effectiveShiftType === 'matutino' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 font-black' : 'text-amber-700 dark:text-amber-300'}`}>
                    Mat: {assignmentStats.shiftDistribution.matutino}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className={`px-1.5 py-0.5 rounded ${effectiveShiftType === 'vespertino' ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 font-black' : 'text-sky-700 dark:text-sky-300'}`}>
                    Vesp: {assignmentStats.shiftDistribution.vespertino}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className={`px-1.5 py-0.5 rounded ${effectiveShiftType === 'nocturno' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 font-black' : 'text-indigo-700 dark:text-indigo-300'}`}>
                    Noct: {assignmentStats.shiftDistribution.nocturno}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* PASO 1 Y PASO 2: SELECTOR DE TURNO Y NAVEGACIÓN SEMANAL  */}
          {/* ──────────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            {/* Paso 1: Selección de Turno (Para Admin y Doctor) */}
            {!isNurse && (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={14} className="text-emerald-600 dark:text-emerald-400" />
                    <span>1. Selecciona el Turno a Gestionar</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Filtra automáticamente solo a los enfermeros con este turno programado
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'matutino' as ShiftType, name: 'Turno Matutino', icon: Sun, color: 'amber', time: shiftConfigs.matutino ? `${shiftConfigs.matutino.startTime} - ${shiftConfigs.matutino.endTime}` : '07:00 - 15:00' },
                    { id: 'vespertino' as ShiftType, name: 'Turno Vespertino', icon: Sunset, color: 'sky', time: shiftConfigs.vespertino ? `${shiftConfigs.vespertino.startTime} - ${shiftConfigs.vespertino.endTime}` : '15:00 - 23:00' },
                    { id: 'nocturno' as ShiftType, name: 'Turno Nocturno', icon: Moon, color: 'indigo', time: shiftConfigs.nocturno ? `${shiftConfigs.nocturno.startTime} - ${shiftConfigs.nocturno.endTime}` : '23:00 - 07:00' },
                  ].map(st => {
                    const isSelected = effectiveShiftType === st.id
                    const IconComp = st.icon
                    const countNurses = shiftAssignments.filter(
                      a => a.weekStartDate === selectedWeekMonday && a.shiftType === st.id
                    ).length

                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setManagedShiftType(st.id)
                          setSelectedPatientIdsToAssign([])
                        }}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? st.id === 'matutino'
                              ? 'bg-amber-500/10 border-amber-500 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30 shadow-sm'
                              : st.id === 'vespertino'
                              ? 'bg-sky-500/10 border-sky-500 text-sky-900 dark:text-sky-200 ring-2 ring-sky-500/30 shadow-sm'
                              : 'bg-indigo-500/10 border-indigo-500 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/30 shadow-sm'
                            : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                            isSelected
                              ? st.id === 'matutino'
                                ? 'bg-amber-500 text-white shadow-sm'
                                : st.id === 'vespertino'
                                ? 'bg-sky-500 text-white shadow-sm'
                                : 'bg-indigo-500 text-white shadow-sm'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}>
                            <IconComp size={18} />
                          </div>
                          <div>
                            <p className="text-xs font-black leading-tight">{st.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{st.time} hrs</p>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          countNurses > 0
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                        }`}>
                          {countNurses} enfermero{countNurses !== 1 ? 's' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Paso 2: Selección de Semana */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1.5">
                <Calendar size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span>2. Semana:</span>
              </span>

              <button
                onClick={handlePrevWeek}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Semana anterior"
              >
                <ChevronLeft size={16} />
                <span>Anterior</span>
              </button>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <Calendar size={15} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-black text-slate-800 dark:text-white">
                  {formatWeekLabel(selectedWeekMonday)}
                </span>
                {isSelectedCurrentWeek ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-700/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Semana Actual
                  </span>
                ) : (
                  <button
                    onClick={handleCurrentWeek}
                    className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Ir a actual
                  </button>
                )}
              </div>

              <button
                onClick={handleNextWeek}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Semana siguiente"
              >
                <span>Siguiente</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────── */}
          {/* GESTIÓN ASISTENCIAL: DIRECTORIO Y PACIENTES A SU CARGO   */}
          {/* ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* ──────────────────────────────────────────────────────── */}
              {/* COLUMNA IZQUIERDA: DIRECTORIO DE ENFERMEROS             */}
              {/* ──────────────────────────────────────────────────────── */}
              {!isNurse && (
                <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Users size={16} className="text-hn-800 dark:text-sky-400" />
                        <span>3. Enfermeros en Turno {managedShiftConfig.name}</span>
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {nursesForNurseView.length} programado{nursesForNurseView.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Mostrando únicamente personal con turno {managedShiftConfig.name} programado en esta semana.
                    </p>
                  </div>

                  {/* Buscador Rápido de Enfermeros y Pacientes Asignados en este Turno */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={assignmentNurseSearch}
                      onChange={e => setAssignmentNurseSearch(e.target.value)}
                      placeholder={`Buscar enfermero en Turno ${managedShiftConfig.name}...`}
                      className="w-full pl-8 pr-7 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-medium"
                    />
                    {assignmentNurseSearch && (
                      <button
                        onClick={() => setAssignmentNurseSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                        title="Limpiar búsqueda"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Lista de Enfermeros Programados con Validación de Turno */}
                  <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                    {scheduledNursesInShift.length === 0 ? (
                      <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 mx-auto flex items-center justify-center">
                          <AlertCircle size={20} />
                        </div>
                        <p className="text-xs font-black text-amber-900 dark:text-amber-200">
                          Sin enfermeros programados
                        </p>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                          No hay enfermeros con turno <strong>{managedShiftConfig.name}</strong> para la semana seleccionada.
                          Los enfermeros únicamente pueden recibir pacientes en los turnos que tengan previamente programados.
                        </p>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('shifts')}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <CalendarDays size={13} />
                            <span>Programar Turno</span>
                          </button>
                        )}
                      </div>
                    ) : nursesForNurseView.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                        <p className="font-bold text-slate-600 dark:text-slate-300">Sin resultados</p>
                        <p className="text-[11px]">No se encontró personal en este turno para "{assignmentNurseSearch}".</p>
                      </div>
                    ) : (
                      nursesForNurseView.map(nurse => {
                        const isSelected = selectedAssignmentNurse?.id === nurse.id
                        const shiftStyle = getShiftStyle(effectiveShiftType)
                        const ShiftIcon = effectiveShiftType === 'matutino' ? Sun : effectiveShiftType === 'vespertino' ? Sunset : Moon
                        const assignedCount = patientAssignments.filter(
                          a => a.nurseId === nurse.id && a.weekStartDate === selectedWeekMonday && a.shiftType === effectiveShiftType && a.active === true
                        ).length

                        // Identificar los pacientes de este enfermero que coinciden con la búsqueda
                        const nurseQ = assignmentNurseSearch.trim().toLowerCase()
                        const matchedPatients = nurseQ
                          ? patientAssignments.filter(
                              a =>
                                a.nurseId === nurse.id &&
                                a.weekStartDate === selectedWeekMonday &&
                                a.shiftType === effectiveShiftType &&
                                a.active &&
                                (a.patientName.toLowerCase().includes(nurseQ) ||
                                  a.patientDeviceId.toLowerCase().includes(nurseQ) ||
                                  (a.roomNumber && a.roomNumber.toLowerCase().includes(nurseQ)))
                            )
                          : []

                        return (
                          <button
                            key={nurse.id}
                            type="button"
                            onClick={() => {
                              setSelectedAssignmentNurseId(nurse.id)
                              setSelectedPatientIdsToAssign([])
                            }}
                            className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2.5 ${
                              isSelected
                                ? 'border-hn-800 bg-hn-50/50 dark:bg-hn-500/10 dark:border-sky-400 ring-2 ring-hn-800/20 shadow-sm'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-xl font-black flex items-center justify-center text-xs ${
                                  isSelected
                                    ? 'bg-hn-800 text-white dark:bg-sky-400 dark:text-slate-950'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                }`}>
                                  {nurse.fullName[0]?.toUpperCase() || 'E'}
                                </div>
                                <div>
                                  <h4 className="text-xs font-bold text-slate-800 dark:text-white leading-tight">
                                    {nurse.fullName}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 font-mono">
                                    {nurse.email}
                                  </p>
                                </div>
                              </div>

                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                assignedCount > 0
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                              }`}>
                                {assignedCount} pac.
                              </span>
                            </div>

                            {/* Badge Bidireccional si este enfermero tiene a cargo un paciente que coincide con la búsqueda */}
                            {matchedPatients.length > 0 && (
                              <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/40 text-[9px] font-bold text-emerald-800 dark:text-emerald-300">
                                ✓ Tiene a cargo a: {matchedPatients.map(m => `${m.patientName} (${m.roomNumber})`).join(', ')}
                              </div>
                            )}

                            {/* Badge de Turno Programado */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-200/40 dark:border-slate-700/40 text-[10px]">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold border ${shiftStyle.badge}`}>
                                <ShiftIcon size={11} />
                                <span>Turno {managedShiftConfig.name}</span>
                              </span>
                              <span className="font-mono text-slate-500 font-bold">
                                {managedShiftConfig.startTime} - {managedShiftConfig.endTime}
                              </span>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────── */}
              {/* COLUMNA DERECHA: PANEL DE GESTIÓN DE PACIENTES A CARGO  */}
              {/* ──────────────────────────────────────────────────────── */}
              <div className={isNurse ? 'lg:col-span-12 space-y-6' : 'lg:col-span-8 space-y-6'}>
                {selectedAssignmentNurse ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
                    {/* Encabezado del Enfermero Seleccionado */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-black flex items-center justify-center text-lg flex-shrink-0">
                          {selectedAssignmentNurse.fullName[0]?.toUpperCase() || 'E'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-black text-slate-800 dark:text-white">
                              {selectedAssignmentNurse.fullName}
                            </h2>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/40">
                              Enfermero Titular
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            {selectedAssignmentNurse.email} · Tel: {selectedAssignmentNurse.phoneNumber}
                          </p>
                        </div>
                      </div>

                      {/* Badge del Turno Programado */}
                      <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Turno Programado ({formatWeekLabel(selectedWeekMonday).split(' ')[0]})
                          </p>
                          <p className="text-xs font-black text-slate-800 dark:text-white">
                            Turno {managedShiftConfig.name} ({managedShiftConfig.startTime} a {managedShiftConfig.endTime} hrs)
                          </p>
                        </div>
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      </div>
                    </div>

                    {/* Sub-Pestañas de Gestión del Enfermero */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setAssignmentSubTab('assigned')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            assignmentSubTab === 'assigned'
                              ? 'bg-hn-800 text-white dark:bg-sky-500 dark:text-slate-950 shadow-sm'
                              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                          }`}
                        >
                          Pacientes a su Cargo ({assignedPatientsToSelectedNurse.length})
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => setAssignmentSubTab('available')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              assignmentSubTab === 'available'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Plus size={14} />
                            <span>Asignar Pacientes Disponibles</span>
                          </button>
                        )}

                        <button
                          onClick={() => setAssignmentSubTab('history')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            assignmentSubTab === 'history'
                              ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-sm'
                              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                          }`}
                        >
                          <HistoryIcon size={13} />
                          <span>Historial de Asignaciones ({historyAssignmentsForSelectedNurse.length})</span>
                        </button>
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono">
                        Semana: {formatWeekLabel(selectedWeekMonday)}
                      </span>
                    </div>

                    {/* ──────────────────────────────────────────────────────── */}
                    {/* SUB-VISTA 1: PACIENTES A SU CARGO (ACTIVOS)             */}
                    {/* ──────────────────────────────────────────────────────── */}
                    {assignmentSubTab === 'assigned' && (
                      <div className="space-y-4">
                        {assignedPatientsToSelectedNurse.length === 0 ? (
                          <div className="p-10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                              <UserX size={22} />
                            </div>
                            <h4 className="text-sm font-black text-slate-800 dark:text-white">
                              Sin pacientes asignados actualmente
                            </h4>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                              {selectedAssignmentNurse.fullName} aún no tiene pacientes bajo su cuidado para el turno {managedShiftConfig.name}.
                            </p>
                            {isAdmin && (
                              <button
                                onClick={() => setAssignmentSubTab('available')}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <Plus size={14} />
                                <span>Asignar Pacientes Disponibles</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {assignedPatientsToSelectedNurse.map(assignment => {
                              const dev = devices.find(d => d.deviceId === assignment.patientDeviceId)
                              const coverage = getPatientCoverage(assignment.patientDeviceId, selectedWeekMonday, patientAssignments)
                              const nurseQ = assignmentNurseSearch.trim().toLowerCase()
                              const matchesSearch =
                                nurseQ &&
                                (assignment.patientName.toLowerCase().includes(nurseQ) ||
                                  assignment.patientDeviceId.toLowerCase().includes(nurseQ) ||
                                  (assignment.roomNumber && assignment.roomNumber.toLowerCase().includes(nurseQ)))

                              return (
                                <div
                                  key={assignment.id}
                                  className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 shadow-sm space-y-3 transition-all ${
                                    matchesSearch
                                      ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                                      : 'border-slate-200 dark:border-slate-800'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-xs flex-shrink-0">
                                        <UserIcon size={16} />
                                      </div>
                                      <div>
                                        <h4 className="text-xs font-bold text-slate-800 dark:text-white leading-tight">
                                          {assignment.patientName}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 font-mono">
                                          ID: {assignment.patientDeviceId} · {assignment.roomNumber} · {assignment.floor}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Botones Reasignar y Retirar (Solo Admin) */}
                                    {isAdmin && (
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenReassign(assignment)}
                                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                                          title="Reasignar a otro enfermero programado en este turno conservando el historial"
                                        >
                                          <ArrowRight size={12} />
                                          <span>Reasignar</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenWithdraw(assignment)}
                                          className="px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                                          title="Retirar asignación conservando registro histórico"
                                        >
                                          <UserMinus size={13} />
                                          <span>Retirar</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Cobertura de los 3 Turnos para este Paciente */}
                                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Cobertura de Turnos (24 Horas)
                                    </span>
                                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                                      {/* Matutino */}
                                      <div className={`p-1.5 rounded-lg border text-center ${
                                        coverage.matutino
                                          ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-700/50 text-amber-800 dark:text-amber-300 font-bold'
                                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                                      }`}>
                                        <span className="block text-[8px] uppercase">Matutino</span>
                                        <span className="truncate block font-semibold">
                                          {coverage.matutino ? coverage.matutino.nurseName.split(' ')[1] || 'Asignado' : 'Pendiente'}
                                        </span>
                                      </div>

                                      {/* Vespertino */}
                                      <div className={`p-1.5 rounded-lg border text-center ${
                                        coverage.vespertino
                                          ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-700/50 text-sky-800 dark:text-sky-300 font-bold'
                                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                                      }`}>
                                        <span className="block text-[8px] uppercase">Vespertino</span>
                                        <span className="truncate block font-semibold">
                                          {coverage.vespertino ? coverage.vespertino.nurseName.split(' ')[1] || 'Asignado' : 'Pendiente'}
                                        </span>
                                      </div>

                                      {/* Nocturno */}
                                      <div className={`p-1.5 rounded-lg border text-center ${
                                        coverage.nocturno
                                          ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-700/50 text-indigo-800 dark:text-indigo-300 font-bold'
                                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                                      }`}>
                                        <span className="block text-[8px] uppercase">Nocturno</span>
                                        <span className="truncate block font-semibold">
                                          {coverage.nocturno ? coverage.nocturno.nurseName.split(' ')[1] || 'Asignado' : 'Pendiente'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ──────────────────────────────────────────────────────── */}
                    {/* SUB-VISTA 2: ASIGNAR PACIENTES DISPONIBLES AL TURNO     */}
                    {/* (Exclusiva de Administrador)                             */}
                    {/* ──────────────────────────────────────────────────────── */}
                    {assignmentSubTab === 'available' && isAdmin && (
                      <div className="space-y-4">
                        {/* Barra de Búsqueda y Acción Masiva */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                          <div className="relative w-full sm:w-72">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={assignmentPatientSearch}
                              onChange={e => setAssignmentPatientSearch(e.target.value)}
                              placeholder="Filtrar pacientes por nombre, cuarto o brazalete..."
                              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            />
                          </div>

                          {selectedPatientIdsToAssign.length > 0 && (
                            <button
                              type="button"
                              onClick={handleBatchAssignPatients}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 animate-in fade-in"
                            >
                              <Plus size={14} />
                              <span>Asignar {selectedPatientIdsToAssign.length} seleccionados a {selectedAssignmentNurse.fullName} (Turno {managedShiftConfig.name})</span>
                            </button>
                          )}
                        </div>

                        {/* Lista de Pacientes para Asignación */}
                        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                          {availablePatientsFiltered.length === 0 ? (
                            <div className="p-10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                              <UserCheck size={26} className="mx-auto text-emerald-500" />
                              <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                                Todos los pacientes cuentan con enfermero asignado
                              </p>
                              <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                                {assignmentPatientSearch
                                  ? `No se encontraron pacientes pendientes con el término "${assignmentPatientSearch}".`
                                  : `No hay pacientes pendientes de asignación para el turno ${managedShiftConfig.name} en la semana seleccionada.`}
                              </p>
                            </div>
                          ) : (
                            availablePatientsFiltered.map(dev => {
                              const coverage = getPatientCoverage(dev.deviceId, selectedWeekMonday, patientAssignments)
                              const isSelected = selectedPatientIdsToAssign.includes(dev.deviceId)

                              return (
                                <div
                                  key={dev.deviceId}
                                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                    isSelected
                                      ? 'bg-slate-50 dark:bg-slate-800/80 border-emerald-500 ring-2 ring-emerald-500/20'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    {/* Checkbox de Selección múltiple */}
                                    <button
                                      type="button"
                                      onClick={() => togglePatientSelection(dev.deviceId)}
                                      className="text-slate-400 hover:text-emerald-600 cursor-pointer"
                                    >
                                      {isSelected ? (
                                        <CheckSquare size={18} className="text-emerald-600" />
                                      ) : (
                                        <Square size={18} />
                                      )}
                                    </button>

                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-bold text-slate-800 dark:text-white leading-tight">
                                          {dev.patientName}
                                        </h4>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          ID: {dev.deviceId}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-slate-500">
                                        {dev.profile?.roomNumber || 'Hab. 101'} · {dev.profile?.floor || 'Piso 1'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Estado de Cobertura en los 3 turnos */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex items-center gap-1 text-[10px]">
                                      {/* Matutino */}
                                      <span className={`px-2 py-0.5 rounded-md font-bold ${
                                        coverage.matutino
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                                      }`}>
                                        Mat: {coverage.matutino ? 'Cubierto' : 'Libre'}
                                      </span>
                                      {/* Vespertino */}
                                      <span className={`px-2 py-0.5 rounded-md font-bold ${
                                        coverage.vespertino
                                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                                      }`}>
                                        Vesp: {coverage.vespertino ? 'Cubierto' : 'Libre'}
                                      </span>
                                      {/* Nocturno */}
                                      <span className={`px-2 py-0.5 rounded-md font-bold ${
                                        coverage.nocturno
                                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300'
                                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                                      }`}>
                                        Noct: {coverage.nocturno ? 'Cubierto' : 'Libre'}
                                      </span>
                                    </div>

                                    {/* Botón de Asignación Individual */}
                                    <button
                                      type="button"
                                      onClick={() => handleAssignSinglePatient(dev)}
                                      className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1"
                                    >
                                      <Plus size={12} />
                                      <span>Asignar a este turno</span>
                                    </button>
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* ──────────────────────────────────────────────────────── */}
                    {/* SUB-VISTA 3: HISTORIAL DE ASIGNACIONES ANTERIORES       */}
                    {/* ──────────────────────────────────────────────────────── */}
                    {assignmentSubTab === 'history' && (
                      <div className="space-y-4">
                        {historyAssignmentsForSelectedNurse.length === 0 ? (
                          <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
                            <HistoryIcon size={24} className="mx-auto text-slate-400" />
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                              Sin historial de rotaciones archivadas
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Cuando se reasignen o retiren pacientes de este enfermero, se conservarán aquí para auditoría.
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                  <th className="py-2.5 px-3">Paciente Asistido</th>
                                  <th className="py-2.5 px-3">Turno / Semana</th>
                                  <th className="py-2.5 px-3">Asignado el</th>
                                  <th className="py-2.5 px-3">Retirado el</th>
                                  <th className="py-2.5 px-3">Motivo / Causa</th>
                                  <th className="py-2.5 px-3">Supervisor</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                {historyAssignmentsForSelectedNurse.map(item => (
                                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                    <td className="py-3 px-3">
                                      <div>
                                        <p className="font-bold text-slate-800 dark:text-white">
                                          {item.patientName}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-mono">
                                          {item.roomNumber} · {item.floor}
                                        </p>
                                      </div>
                                    </td>

                                    <td className="py-3 px-3">
                                      <span className="font-bold uppercase text-[10px] text-slate-700 dark:text-slate-200 block">
                                        {item.shiftType}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        Semana: {item.weekStartDate}
                                      </span>
                                    </td>

                                    <td className="py-3 px-3 font-mono text-[10px] text-slate-500">
                                      {new Date(item.assignedAt).toLocaleDateString()}
                                    </td>

                                    <td className="py-3 px-3 font-mono text-[10px] text-red-600 dark:text-red-400">
                                      {item.withdrawnAt ? new Date(item.withdrawnAt).toLocaleDateString() : '—'}
                                    </td>

                                    <td className="py-3 px-3 text-[11px] text-slate-600 dark:text-slate-300 italic">
                                      {item.withdrawnReason || 'Rotación de turno.'}
                                    </td>

                                    <td className="py-3 px-3 text-[11px] text-slate-400">
                                      {item.assignedByUserName || 'Lic. Laura Martínez'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-12 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-2">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      Selecciona un enfermero del directorio de la izquierda para comenzar.
                    </p>
                  </div>
                )}
              </div>
            </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: RETIRAR ASIGNACIÓN CON REGISTRO HISTÓRICO         */}
      {/* ──────────────────────────────────────────────────────── */}
      {withdrawModalOpen && assignmentToWithdraw && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                  <UserMinus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">
                    Retirar Asignación de Paciente
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Se conservará el registro en el historial para auditoría
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWithdrawModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
              <p className="text-xs font-bold text-slate-800 dark:text-white">
                Paciente: <span className="text-emerald-600 dark:text-emerald-400">{assignmentToWithdraw.patientName}</span>
              </p>
              <p className="text-[11px] text-slate-500">
                Enfermero: {assignmentToWithdraw.nurseName} · Turno {shiftConfigs[assignmentToWithdraw.shiftType]?.name || assignmentToWithdraw.shiftType}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                Ubicación: {assignmentToWithdraw.roomNumber} · {assignmentToWithdraw.floor}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                Motivo del Retiro / Reasignación
              </label>
              <div className="space-y-1.5">
                {[
                  'Rotación periódica de personal asistencial',
                  'Cambio de turno o descanso programado',
                  'Reubicación de pabellón o habitación',
                  'Ajuste de carga de trabajo de enfermería',
                ].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setWithdrawReason(r)
                      setCustomWithdrawReason('')
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      withdrawReason === r && !customWithdrawReason
                        ? 'border-hn-800 bg-hn-50 text-hn-900 dark:bg-hn-500/20 dark:text-white dark:border-sky-500 font-bold'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Otro motivo específico (opcional)..."
                value={customWithdrawReason}
                onChange={e => setCustomWithdrawReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-medium"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWithdrawModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmWithdraw}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <UserMinus size={14} />
                <span>Confirmar Retiro</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: REASIGNAR PACIENTE A OTRO ENFERMERO EN ESTE TURNO */}
      {/* ──────────────────────────────────────────────────────── */}
      {reassignModal.open && reassignModal.assignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                  <ArrowRight size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">
                    Reasignar Paciente
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Transferencia de cuidado conservando historial para auditoría
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReassignModal({ open: false, assignment: null, targetNurseId: '' })}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
              <p className="text-xs font-bold text-slate-800 dark:text-white">
                Paciente: <span className="text-emerald-600 dark:text-emerald-400">{reassignModal.assignment.patientName}</span>
              </p>
              <p className="text-[11px] text-slate-500">
                Enfermero actual: {reassignModal.assignment.nurseName} · Turno {managedShiftConfig.name}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                Semana: {formatWeekLabel(selectedWeekMonday)}
              </p>
            </div>

            {scheduledNursesInShift.filter(n => n.id !== reassignModal.assignment!.nurseId).length === 0 ? (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700/50 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold">No hay otros enfermeros programados</p>
                <p className="text-[11px]">
                  No hay más enfermeros con turno {managedShiftConfig.name} programado en esta semana para realizar la reasignación.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Selecciona el Nuevo Enfermero Responsable (Turno {managedShiftConfig.name})
                </label>
                <select
                  value={reassignModal.targetNurseId}
                  onChange={e => setReassignModal({ ...reassignModal, targetNurseId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  {scheduledNursesInShift
                    .filter(n => n.id !== reassignModal.assignment!.nurseId)
                    .map(n => (
                      <option key={n.id} value={n.id}>
                        {n.fullName} ({n.email})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReassignModal({ open: false, assignment: null, targetNurseId: '' })}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              {scheduledNursesInShift.filter(n => n.id !== reassignModal.assignment!.nurseId).length > 0 && (
                <button
                  type="button"
                  onClick={handleConfirmReassign}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>Confirmar Reasignación</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL 1: REGISTRAR / EDITAR USUARIO (CON TURNO INICIAL)  */}
      {/* ──────────────────────────────────────────────────────── */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">
                    {editingUser ? 'Modificar Usuario Médico' : 'Registrar Nuevo Usuario'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Control de cuentas y credenciales institucionales
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUserModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nombre Completo
                </label>
                <div className="relative">
                  <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Ej. Dr. Mario Delgado"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="mdelgado@healthnet.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Teléfono Móvil (Avisos de Emergencia)
                </label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="+52 664 123 4567"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                  Asignación de Rol de Acceso (RBAC)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('nurse')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      role === 'nurse'
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <HeartHandshake size={18} className="mx-auto mb-1 text-emerald-600" />
                    <span className="block text-xs font-bold">Enfermero</span>
                    <span className="block text-[9px] text-slate-400">Atención y Alertas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('doctor')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      role === 'doctor'
                        ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Stethoscope size={18} className="mx-auto mb-1 text-sky-600" />
                    <span className="block text-xs font-bold">Doctor</span>
                    <span className="block text-[9px] text-slate-400">Historial Clínico</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      role === 'admin'
                        ? 'border-purple-500 bg-purple-50/70 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Shield size={18} className="mx-auto mb-1 text-purple-600" />
                    <span className="block text-xs font-bold">Administrador</span>
                    <span className="block text-[9px] text-slate-400">Control Total</span>
                  </button>
                </div>
              </div>

              {/* Sección Condicional: Turno Inicial si el rol es Enfermero */}
              {role === 'nurse' && (
                <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-200 uppercase">
                      Turno Inicial de Trabajo
                    </label>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                      Rotación configurable
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(['matutino', 'vespertino', 'nocturno'] as const).map(st => {
                      const cfg = shiftConfigs[st]
                      const isSelected = defaultShift === st
                      const style = getShiftStyle(st)
                      const Icon = st === 'matutino' ? Sun : st === 'vespertino' ? Sunset : Moon
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setDefaultShift(st)}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? `${style.bg} ${style.border} ${style.text} font-bold ring-2 ring-hn-800/20 dark:ring-sky-500/20 shadow-sm`
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <Icon size={14} className="mx-auto mb-1 opacity-80" />
                          <span className="block text-xs font-bold">{cfg.name}</span>
                          <span className="block text-[10px] font-mono opacity-80">
                            {cfg.startTime} - {cfg.endTime}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Se creará la asignación de turno de forma automática para la semana en curso, pudiendo rotarse en cualquier momento desde la pestaña de turnos.
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-hn-800 hover:bg-hn-900 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Save size={14} />
                  <span>{editingUser ? 'Guardar Cambios' : 'Registrar Cuenta'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL 2: PROGRAMAR O MODIFICAR TURNO SEMANAL            */}
      {/* ──────────────────────────────────────────────────────── */}
      {shiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">
                    {editingShift ? 'Modificar Turno Semanal' : 'Programar Turno Semanal'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Asigna la rotación y horario correspondiente para la semana seleccionada
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShiftModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Alerta de Conflicto / Incompatibilidad */}
            {shiftConflictError && (
              <div className="mb-4 p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-start gap-2.5">
                <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{shiftConflictError}</span>
              </div>
            )}

            <form onSubmit={handleSaveShift} className="space-y-4">
              {/* Selección del Enfermero */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  1. Enfermero Profesional
                </label>
                <select
                  disabled={Boolean(editingShift)}
                  value={modalNurseId}
                  onChange={e => setModalNurseId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-hn-800/30 disabled:opacity-75"
                >
                  {activeNurses.map(n => (
                    <option key={n.id} value={n.id}>
                      {n.fullName} ({n.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Semana Seleccionada */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  2. Semana de Programación
                </label>
                <select
                  disabled={Boolean(editingShift)}
                  value={modalWeekStartDate}
                  onChange={e => setModalWeekStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-hn-800/30 disabled:opacity-75"
                >
                  {weekOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} {opt.isCurrent ? '(Actual)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Turno a Cubrir */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                  3. Turno a Cubrir
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['matutino', 'vespertino', 'nocturno'] as const).map(st => {
                    const cfg = shiftConfigs[st]
                    const isSelected = modalShiftType === st
                    const style = getShiftStyle(st)
                    const Icon = st === 'matutino' ? Sun : st === 'vespertino' ? Sunset : Moon
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setModalShiftType(st)}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? `${style.bg} ${style.border} ${style.text} font-bold ring-2 ring-hn-800/20 dark:ring-sky-500/20 shadow-sm`
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <Icon size={18} className="mx-auto mb-1 opacity-80" />
                        <span className="block text-xs font-black">{cfg.name}</span>
                        <span className="block text-[10px] font-mono opacity-80">
                          {cfg.startTime} - {cfg.endTime}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Días de Trabajo */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                    4. Días de Trabajo Cubiertos
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setModalDays(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'])}
                      className="text-[10px] font-bold text-hn-800 dark:text-sky-400 hover:underline cursor-pointer"
                    >
                      Lun-Vie
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setModalDays(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'])}
                      className="text-[10px] font-bold text-hn-800 dark:text-sky-400 hover:underline cursor-pointer"
                    >
                      Todos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => {
                    const active = modalDays.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleModalDay(d)}
                        className={`py-2 rounded-xl text-[11px] font-bold text-center transition-all cursor-pointer border ${
                          active
                            ? 'bg-hn-800 text-white border-hn-900 shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {d.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Observaciones o Notas */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  5. Notas Clínicas / Motivo de Rotación (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={modalNotes}
                  onChange={e => setModalNotes(e.target.value)}
                  placeholder="Ej. Rotación quincenal acordada; cubre guardia de piso 2."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hn-800/30 font-medium"
                />
              </div>

              {/* Botones de Acción */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShiftModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-hn-800 hover:bg-hn-900 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Save size={14} />
                  <span>{editingShift ? 'Guardar Cambios' : 'Confirmar Programación'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL 3: CONFIGURAR HORARIOS DE TURNOS DEL ESTABLECIMIENTO*/}
      {/* ──────────────────────────────────────────────────────── */}
      {configHoursModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">
                    Configuración de Horarios de Turnos
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Ajusta los horarios institucionales según las necesidades del establecimiento
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfigHoursModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveConfigHours} className="space-y-4">
              {(['matutino', 'vespertino', 'nocturno'] as const).map(st => {
                const cfg = tempShiftConfigs[st]
                const Icon = st === 'matutino' ? Sun : st === 'vespertino' ? Sunset : Moon
                const style = getShiftStyle(st)

                return (
                  <div key={st} className={`p-4 rounded-2xl border ${style.border} ${style.bg} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className={style.text} />
                        <span className="text-xs font-black uppercase text-slate-800 dark:text-white">
                          Turno {cfg.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">Configurable</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Hora de Inicio
                        </label>
                        <input
                          type="time"
                          required
                          value={cfg.startTime}
                          onChange={e =>
                            setTempShiftConfigs({
                              ...tempShiftConfigs,
                              [st]: { ...cfg, startTime: e.target.value },
                            })
                          }
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Hora de Fin
                        </label>
                        <input
                          type="time"
                          required
                          value={cfg.endTime}
                          onChange={e =>
                            setTempShiftConfigs({
                              ...tempShiftConfigs,
                              [st]: { ...cfg, endTime: e.target.value },
                            })
                          }
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfigHoursModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-hn-800 hover:bg-hn-900 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Save size={14} />
                  <span>Guardar Horarios</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: CONFIRMACIÓN DE SUSPENSIÓN DE CUENTA (ADMIN)      */}
      {/* ──────────────────────────────────────────────────────── */}
      {suspensionModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 flex items-center justify-center font-black">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-white leading-tight">
                  ¿Suspender cuenta de usuario?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Control de Acceso y Credenciales RBAC
                </p>
              </div>
            </div>

            {/* Identificación clara del usuario */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 mb-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Usuario:</span>
                <span className="font-bold text-slate-800 dark:text-white">{suspensionModalTarget.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Correo Institucional:</span>
                <span className="font-mono font-bold text-hn-700 dark:text-sky-300">{suspensionModalTarget.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Rol en el Sistema:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300 uppercase">
                  {suspensionModalTarget.role === 'admin' ? 'Administrador' : suspensionModalTarget.role === 'doctor' ? 'Médico Especialista' : 'Enfermero'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Identificador (ID):</span>
                <span className="font-mono text-slate-500 text-[10px]">{suspensionModalTarget.id}</span>
              </div>
            </div>

            {/* Advertencia y Protección de Datos */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs leading-relaxed space-y-1.5 mb-4">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
                Consecuencias de la suspensión:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                <li>El usuario <strong>no podrá iniciar sesión</strong> en HealthNet mientras esté suspendido.</li>
                <li><strong>No se eliminará información:</strong> su historial clínico, turnos y asignaciones se conservan íntegros.</li>
                <li>Esta acción quedará registrada en la bitácora de auditoría con tu usuario, fecha y hora.</li>
              </ul>
            </div>

            {/* Motivo de la suspensión */}
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Motivo u Observación de la Suspensión
              </label>
              <input
                type="text"
                value={suspensionReason}
                onChange={e => setSuspensionReason(e.target.value)}
                placeholder="Ej. Incapacidad médica, baja temporal, revisión administrativa..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSuspensionModalTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md shadow-red-900/10 flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <UserX size={14} />
                <span>Confirmar Suspensión</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
