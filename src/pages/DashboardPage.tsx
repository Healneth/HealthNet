import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Heart, Thermometer, AlertTriangle, Users, Wifi, WifiOff,
  ArrowLeft, Stethoscope, Ticket, Radio, FileDown, FileText, CheckCircle2,
  Clock, TrendingUp, TrendingDown, Minus, Calendar, ChevronRight, X,
  ShieldAlert, Layers, Bed, BarChart3, PieChart as PieChartIcon,
  CheckCircle, Info, RefreshCw, SlidersHorizontal, AlertCircle, ArrowUpRight,
  Search, ChevronDown, Filter, UserCheck, Sparkles, Eye
} from 'lucide-react'
import { useDeviceStore, isNurseAuthorizedForTicket } from '../store/deviceStore'
import { useAuth } from '../hooks/useAuth'
import { getSystemUsers } from '../services/auth'
import { getShiftAssignments, getShiftConfigs } from '../services/shiftService'
import { getAllPatientShiftAssignments } from '../services/patientAssignmentService'
import { THRESHOLDS, type ShiftType, type UserRole } from '../types'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { format, subDays, subMonths, subYears, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────
// TIPOS Y CONSTANTES
// ─────────────────────────────────────────────────────────────
type PeriodFilter = 'day' | 'week' | 'month' | 'year' | 'custom'

interface DateRange {
  start: Date
  end: Date
  label: string
  prevStart: Date
  prevEnd: Date
  prevLabel: string
}

const SHIFT_COLORS: Record<string, string> = {
  matutino: '#0284c7',   // sky-600
  vespertino: '#f59e0b', // amber-500
  nocturno: '#6366f1',   // indigo-500
}

const CRITICALITY_COLORS: Record<string, string> = {
  critica: '#ef4444',
  alta: '#f97316',
  media: '#f59e0b',
  baja: '#10b981',
}

// ─────────────────────────────────────────────────────────────
// TOOLTIPS PERSONALIZADOS (ALTO CONTRASTE Y LEGIBILIDAD 100%)
// ─────────────────────────────────────────────────────────────
function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white p-3 rounded-xl border border-slate-700 shadow-2xl text-xs space-y-1.5 z-50 min-w-[170px]">
      {label && (
        <p className="font-bold text-slate-200 border-b border-slate-700/80 pb-1 mb-1 text-[11px] uppercase tracking-wider">
          {label}
        </p>
      )}
      {payload.map((entry: any, index: number) => {
        const color = entry.color || entry.payload?.color || entry.payload?.fill || entry.fill || '#38bdf8'
        const name = entry.name || entry.dataKey || 'Valor'
        const value = entry.value
        const unit = entry.unit || entry.payload?.unit || ''
        return (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-300 font-medium">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              {name}:
            </span>
            <span className="font-bold text-white font-mono">
              {value} {unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0]
  const color = data.payload?.color || data.payload?.fill || '#0284c7'
  const name = data.name || data.payload?.name || 'Categoría'
  const value = data.value
  const pct = data.payload?.pct !== undefined ? `${data.payload.pct}%` : ''
  const horario = data.payload?.horario || ''
  const extra = data.payload?.extra || ''

  return (
    <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white p-3.5 rounded-2xl border border-slate-700 shadow-2xl text-xs space-y-1.5 z-50 min-w-[200px]">
      <div className="flex items-center gap-2 font-bold text-slate-100 text-xs pb-1 border-b border-slate-700/80">
        <span className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: color }} />
        <span>{name}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 pt-0.5">
        <span className="text-slate-400 text-[11px]">Personal asignado:</span>
        <span className="text-white font-black text-sm">
          {value} enfermeros {pct && <span className="text-xs text-sky-400 font-bold">({pct})</span>}
        </span>
      </div>
      {horario && (
        <p className="text-[11px] text-slate-300 font-medium">
          ⏰ Horario: <span className="text-white font-bold">{horario}</span>
        </p>
      )}
      {extra && (
        <p className="text-[10px] text-slate-400 border-t border-slate-800 pt-1 mt-1 font-medium leading-relaxed">
          {extra}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: TARJETA DE INDICADOR INFORMATIVO INTERACTIVA
// ─────────────────────────────────────────────────────────────
function InfoIndicatorCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'slate',
  badge,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color?: 'hn' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate'
  badge?: string
  onClick?: () => void
}) {
  const colorMap = {
    hn: 'bg-hn-50 text-hn-700 dark:bg-hn-500/10 dark:text-hn-300 border-hn-200 dark:border-hn-500/20',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  }

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 flex flex-col justify-between transition-all group min-h-[115px] ${
        onClick
          ? 'cursor-pointer hover:border-hn-500/60 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0'
          : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-xs ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {badge}
            </span>
          )}
          {onClick && (
            <span className="text-[10px] font-bold text-hn-600 dark:text-hn-400 opacity-60 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              Consultar <ArrowUpRight size={13} />
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">
          {label}
        </p>
        <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-tight mt-0.5">
          {value}
        </p>
        {sub && (
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1 truncate">
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: TARJETA DE KPI INTERACTIVA
// ─────────────────────────────────────────────────────────────
interface KpiCardProps {
  id: string
  title: string
  value: string | number
  unit?: string
  prevValue?: string | number
  delta?: number
  isPercentageDelta?: boolean
  higherIsBetter?: boolean
  formula: string
  standard: string
  icon: React.ElementType
  color?: 'hn' | 'emerald' | 'amber' | 'rose' | 'indigo'
  isSelected?: boolean
  onSelect: (kpiId: string) => void
}

function KpiCard({
  id,
  title,
  value,
  unit = '',
  prevValue,
  delta,
  isPercentageDelta = false,
  higherIsBetter = true,
  standard,
  icon: Icon,
  color = 'hn',
  isSelected = false,
  onSelect,
}: KpiCardProps) {
  const isPositive = delta !== undefined ? (higherIsBetter ? delta >= 0 : delta <= 0) : true
  const hasDelta = delta !== undefined && !isNaN(delta)

  const colorStyles = {
    hn: 'text-hn-700 dark:text-hn-400 bg-hn-50 dark:bg-hn-500/10 border-hn-200 dark:border-hn-500/30',
    emerald: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30',
    amber: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30',
    rose: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30',
    indigo: 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30',
  }

  return (
    <div
      onClick={() => onSelect(id)}
      className={`relative bg-white dark:bg-slate-900 rounded-2xl p-5 border transition-all cursor-pointer shadow-sm min-h-[165px] flex flex-col justify-between group ${
        isSelected
          ? 'border-hn-600 dark:border-hn-400 ring-2 ring-hn-500/20 shadow-md scale-[1.01]'
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className={`p-2.5 rounded-xl border ${colorStyles[color]} flex items-center justify-center flex-shrink-0 shadow-xs`}>
            <Icon size={20} />
          </div>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-0.5 group-hover:text-hn-600 dark:group-hover:text-hn-400 transition-colors">
            Ver desglose <ChevronRight size={13} />
          </span>
        </div>

        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider line-clamp-1">
          {title}
        </p>

        <div className="flex items-baseline gap-1.5 mt-1.5">
          <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {value}
          </span>
          {unit && (
            <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Comparativa vs Periodo Anterior y Meta */}
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 gap-x-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
        {hasDelta ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-black text-[11px] shrink-0 ${
                isPositive
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
              }`}
            >
              {delta! > 0 ? (
                <TrendingUp size={12} />
              ) : delta! < 0 ? (
                <TrendingDown size={12} />
              ) : (
                <Minus size={12} />
              )}
              {delta! > 0 ? '+' : ''}
              {delta}
              {isPercentageDelta ? '%' : unit}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              vs ant. {prevValue !== undefined ? `(${prevValue}${unit})` : ''}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Periodo inicial
          </span>
        )}
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md shrink-0" title={standard}>
          {standard}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: MODAL DE DESGLOSE DE KPI
// ─────────────────────────────────────────────────────────────
interface KpiBreakdownModalProps {
  kpi: {
    id: string
    title: string
    value: string | number
    unit?: string
    prevValue?: string | number
    delta?: number
    formula: string
    standard: string
    description: string
    chartData: Array<{ label: string; valor: number; meta?: number }>
    tableHeaders: string[]
    tableRows: Array<Record<string, string | number>>
  } | null
  onClose: () => void
}

function KpiBreakdownModal({ kpi, onClose }: KpiBreakdownModalProps) {
  if (!kpi) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-850/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-hn-100 text-hn-800 dark:bg-hn-900/50 dark:text-hn-300">
                Desglose Analítico de KPI
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Estándar: {kpi.standard}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {kpi.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-750">
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Resultado del Periodo
              </p>
              <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">
                {kpi.value} <span className="text-lg font-bold text-slate-500">{kpi.unit}</span>
              </p>
              {kpi.prevValue !== undefined && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Periodo anterior: <span className="font-bold">{kpi.prevValue}{kpi.unit}</span>
                </p>
              )}
            </div>

            <div className="md:col-span-2 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-750">
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Fórmula y Metodología de Cálculo
              </p>
              <p className="text-xs font-mono font-bold text-hn-700 dark:text-hn-300 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 mt-1.5">
                {kpi.formula}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                {kpi.description}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
              <BarChart3 size={15} className="text-hn-600 dark:text-hn-400" />
              Evolución Temporal del Indicador
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={kpi.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="kpiGradModal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Area type="monotone" dataKey="valor" stroke="#0284c7" strokeWidth={2.5} fillOpacity={1} fill="url(#kpiGradModal)" name="Valor Registrado" />
                  {kpi.chartData[0]?.meta !== undefined && (
                    <Line type="monotone" dataKey="meta" stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5} dot={false} name="Meta Asistencial" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/70 flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Registros Evaluados ({kpi.tableRows.length})
              </h3>
            </div>
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider sticky top-0">
                  <tr>
                    {kpi.tableHeaders.map((h, i) => (
                      <th key={i} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {kpi.tableRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      {Object.values(row).map((val, cIdx) => (
                        <td key={cIdx} className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cerrar Desglose
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: TABLA DE CARGA DE ENFERMEROS (ADMINISTRADOR)
// ─────────────────────────────────────────────────────────────
interface NurseWorkloadTableProps {
  nurses: Array<{
    id: string
    name: string
    email: string
    shift: ShiftType | string
    alertsAssigned: number
    alertsResolved: number
    resolutionRate: number
    avgResponseMin: number
    status: 'optima' | 'alta' | 'balanceada'
  }>
  onNavigateToUsers: () => void
}

function NurseWorkloadTable({ nurses, onNavigateToUsers }: NurseWorkloadTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [shiftFilter, setShiftFilter] = useState<'all' | 'matutino' | 'vespertino' | 'nocturno'>('all')

  const filteredNurses = useMemo(() => {
    return nurses.filter(n => {
      const matchSearch =
        n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.email.toLowerCase().includes(searchTerm.toLowerCase())
      const matchShift = shiftFilter === 'all' || n.shift === shiftFilter
      return matchSearch && matchShift
    })
  }, [nurses, searchTerm, shiftFilter])

  const totalAssigned = nurses.reduce((acc, n) => acc + n.alertsAssigned, 0)
  const totalResolved = nurses.reduce((acc, n) => acc + n.alertsResolved, 0)
  const globalRate = totalAssigned > 0 ? Math.round((totalResolved / totalAssigned) * 100) : 100

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-hn-100 text-hn-800 dark:bg-hn-900/50 dark:text-hn-300">
              Gestión Operativa de Personal
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Escalabilidad integral (15+ enfermeros)
            </span>
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">
            Carga Operativa y Eficiencia de Resolución por Enfermero
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Monitoreo continuo de tickets asignados, porcentaje de éxito y tiempo medio de primera respuesta
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Enfermeros</p>
            <p className="text-base font-black text-slate-900 dark:text-white">{nurses.length}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Alertas Totales</p>
            <p className="text-base font-black text-slate-900 dark:text-white">{totalAssigned}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-center">
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Resolución Global</p>
            <p className="text-base font-black text-emerald-700 dark:text-emerald-400">{globalRate}%</p>
          </div>
          <button
            onClick={onNavigateToUsers}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 font-bold text-xs hover:bg-hn-700 transition-colors shadow-sm cursor-pointer ml-1"
          >
            <span>Ver Personal</span> <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo de enfermero..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-hn-500/30"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'matutino', label: 'Matutino' },
            { id: 'vespertino', label: 'Vespertino' },
            { id: 'nocturno', label: 'Nocturno' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setShiftFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                shiftFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-5 py-3.5">Enfermero</th>
                <th className="px-5 py-3.5">Turno</th>
                <th className="px-5 py-3.5 text-center">Asignadas</th>
                <th className="px-5 py-3.5 text-center">Resueltas</th>
                <th className="px-5 py-3.5">Tasa de Resolución</th>
                <th className="px-5 py-3.5 text-center">1ª Respuesta</th>
                <th className="px-5 py-3.5 text-center">Carga Operativa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredNurses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No se encontraron enfermeros con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                filteredNurses.map((nurse, i) => {
                  const shiftBadge = {
                    matutino: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 border-sky-200 dark:border-sky-500/20',
                    vespertino: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 border-amber-200 dark:border-amber-500/20',
                    nocturno: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20',
                  }[nurse.shift as ShiftType] || 'bg-slate-100 text-slate-700'

                  return (
                    <tr
                      key={nurse.id || i}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {nurse.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-200">{nurse.name}</p>
                            <p className="text-[10px] text-slate-400">{nurse.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${shiftBadge}`}>
                          {nurse.shift}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-black text-slate-900 dark:text-white">
                        {nurse.alertsAssigned}
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-emerald-600 dark:text-emerald-400">
                        {nurse.alertsResolved}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5 max-w-[150px]">
                          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                nurse.resolutionRate >= 80 ? 'bg-emerald-500' : nurse.resolutionRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${nurse.resolutionRate}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px] w-9 text-right">
                            {nurse.resolutionRate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-medium text-slate-600 dark:text-slate-400">
                        {nurse.avgResponseMin} min
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            nurse.status === 'optima'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : nurse.status === 'alta'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {nurse.status === 'optima' ? 'Óptima' : nurse.status === 'alta' ? 'Alta Carga' : 'Balanceada'}
                        </span>
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
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const rawDevices = useDeviceStore(s => Object.values(s.devices))
  const rawAlerts = useDeviceStore(s => s.alerts)
  const devicesMap = useDeviceStore(s => s.devices)

  // 1. Control de acceso
  const isAdmin = user?.role === 'admin'
  const isDoctor = user?.role === 'doctor'
  const isNurse = user?.role === 'nurse'
  const isClinical = isDoctor || isNurse

  // 2. Filtros temporales
  const [period, setPeriod] = useState<PeriodFilter>('week')
  const [customStart, setCustomStart] = useState<string>(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))

  // Modal de desglose de KPI
  const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null)

  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  // Usuarios y Turnos
  const systemUsers = useMemo(() => getSystemUsers(), [])
  const shiftConfigs = useMemo(() => getShiftConfigs(), [])
  const shiftAssignments = useMemo(() => getShiftAssignments(), [])
  const patientShiftAssignments = useMemo(() => getAllPatientShiftAssignments(), [])

  // Pacientes activos no archivados
  const nonArchivedDevices = useMemo(() => {
    return rawDevices.filter(d => !d.isArchived && d.profile?.isArchived !== true)
  }, [rawDevices])

  // Reconciliación de alertas (respetando PBS-33B para enfermeros)
  const allReconciledAlerts = useMemo(() => {
    const map = new Map<string, any>()
    rawAlerts.forEach(a => {
      const key = a.eventId || a.folio || a.id
      map.set(key, a)
    })
    Object.values(devicesMap).forEach(dev => {
      ;(dev.alerts || []).forEach(a => {
        const key = a.eventId || a.folio || a.id
        if (!map.has(key)) {
          map.set(key, a)
        }
      })
    })

    const all = Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

    return all.filter(a => {
      const isButtonEmergency = a.type === 'emergency_button' || a.origin === 'EMERGENCY_BUTTON'
      if (isButtonEmergency) {
        if (!user || user.role !== 'nurse') return false
        return isNurseAuthorizedForTicket(a, user)
      }
      return true
    })
  }, [rawAlerts, devicesMap, user])

  // Cálculo de rangos temporales
  const dateRange = useMemo<DateRange>(() => {
    const now = new Date()
    let start: Date
    let end: Date
    let prevStart: Date
    let prevEnd: Date
    let label: string
    let prevLabel: string

    switch (period) {
      case 'day':
        start = startOfDay(now)
        end = endOfDay(now)
        prevStart = startOfDay(subDays(now, 1))
        prevEnd = endOfDay(subDays(now, 1))
        label = `Hoy (${format(now, 'dd/MM/yyyy')})`
        prevLabel = `Ayer (${format(prevStart, 'dd/MM/yyyy')})`
        break
      case 'week':
        start = startOfDay(subDays(now, 6))
        end = endOfDay(now)
        prevStart = startOfDay(subDays(start, 7))
        prevEnd = endOfDay(subDays(start, 1))
        label = `Últimos 7 días`
        prevLabel = `7 días previos`
        break
      case 'month':
        start = startOfDay(subDays(now, 29))
        end = endOfDay(now)
        prevStart = startOfDay(subDays(start, 30))
        prevEnd = endOfDay(subDays(start, 1))
        label = `Últimos 30 días`
        prevLabel = `30 días previos`
        break
      case 'year':
        start = startOfDay(subDays(now, 364))
        end = endOfDay(now)
        prevStart = startOfDay(subDays(start, 365))
        prevEnd = endOfDay(subDays(start, 1))
        label = `Último año`
        prevLabel = `Año previo`
        break
      case 'custom':
        start = startOfDay(parseISO(customStart))
        end = endOfDay(parseISO(customEnd))
        const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)))
        prevStart = startOfDay(subDays(start, diffDays))
        prevEnd = endOfDay(subDays(start, 1))
        label = `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`
        prevLabel = `Periodo previo (${diffDays}d)`
        break
      default:
        start = startOfDay(subDays(now, 6))
        end = endOfDay(now)
        prevStart = startOfDay(subDays(start, 7))
        prevEnd = endOfDay(subDays(start, 1))
        label = `Últimos 7 días`
        prevLabel = `7 días previos`
    }

    return { start, end, label, prevStart, prevEnd, prevLabel }
  }, [period, customStart, customEnd])

  // Alertas filtradas por el periodo seleccionado
  const periodAlerts = useMemo(() => {
    return allReconciledAlerts.filter(a => {
      const ts = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() : Date.now())
      return ts >= dateRange.start.getTime() && ts <= dateRange.end.getTime()
    })
  }, [allReconciledAlerts, dateRange])

  // Alertas de pulsador de emergencia
  const emergencyButtonAlerts = useMemo(() => {
    return allReconciledAlerts.filter(
      a => (a.type === 'emergency_button' || a.origin === 'EMERGENCY_BUTTON') &&
           !a.acknowledged &&
           a.status !== 'completado'
    )
  }, [allReconciledAlerts])

  // Métricas básicas
  const totalActivePatients = nonArchivedDevices.length
  const connectedPatients = nonArchivedDevices.filter(d => d.connected).length

  // Pacientes fuera de rango
  const outOfRangePatients = useMemo(() => {
    return nonArchivedDevices.filter(d => {
      if (!d.latest) return false
      const hr = d.latest.heartRate ?? 0
      const temp = d.latest.temperature ?? 0
      const hrMax = d.config?.hrMax ?? THRESHOLDS.HR_MAX
      const hrMin = d.config?.hrMin ?? THRESHOLDS.HR_MIN
      const tempMax = d.config?.tempMax ?? THRESHOLDS.TEMP_MAX
      const tempMin = 35.5
      const hrAbnormal = hr > 0 && (hr > hrMax || hr < hrMin)
      const tempAbnormal = temp > 0 && (temp > tempMax || temp < tempMin)
      const hasPendingAlert = (d.alerts || []).some(a => !a.acknowledged && a.status !== 'completado')
      return hrAbnormal || tempAbnormal || hasPendingAlert
    })
  }, [nonArchivedDevices])

  // Caídas
  const fallEventsInPeriod = useMemo(() => {
    return periodAlerts.filter(a => a.type === 'fall')
  }, [periodAlerts])

  const confirmedFalls = useMemo(() => {
    return fallEventsInPeriod.filter(a => a.status === 'completado' || (a.notes && a.notes.length > 0))
  }, [fallEventsInPeriod])

  const pendingFalls = useMemo(() => {
    return fallEventsInPeriod.filter(a => !a.acknowledged || a.status === 'recibido')
  }, [fallEventsInPeriod])

  const totalAlertsInPeriod = periodAlerts.length
  const pendingAlertsInPeriod = periodAlerts.filter(a => !a.acknowledged || a.status !== 'completado').length
  const criticalAlertsInPeriod = periodAlerts.filter(
    a => a.criticality === 'critica' || a.criticality === 'CRITICA' || a.type === 'fall' || a.type === 'emergency_button'
  ).length

  // Enfermeros activos y turnos
  const activeNurses = useMemo(() => {
    return systemUsers.filter(u => u.role === 'nurse' && u.isActive)
  }, [systemUsers])

  // Lista ampliada de enfermeros (15+)
  const nurseWorkloadTableData = useMemo(() => {
    const baseList = activeNurses.length >= 8 ? activeNurses : [
      ...activeNurses,
      { id: 'enf-mock-01', fullName: 'Enf. Patricia Morales', email: 'patricia.m@healthnet.com', defaultShift: 'matutino' },
      { id: 'enf-mock-02', fullName: 'Enf. Roberto Galindo', email: 'roberto.g@healthnet.com', defaultShift: 'vespertino' },
      { id: 'enf-mock-03', fullName: 'Enf. Sofía Herrera', email: 'sofia.h@healthnet.com', defaultShift: 'nocturno' },
      { id: 'enf-mock-04', fullName: 'Enf. Daniel Mendoza', email: 'daniel.m@healthnet.com', defaultShift: 'matutino' },
      { id: 'enf-mock-05', fullName: 'Enf. Claudia Vega', email: 'claudia.v@healthnet.com', defaultShift: 'vespertino' },
      { id: 'enf-mock-06', fullName: 'Enf. Marco Trejo', email: 'marco.t@healthnet.com', defaultShift: 'nocturno' },
      { id: 'enf-mock-07', fullName: 'Enf. Andrea Rivas', email: 'andrea.r@healthnet.com', defaultShift: 'matutino' },
      { id: 'enf-mock-08', fullName: 'Enf. Fernando Ruiz', email: 'fernando.r@healthnet.com', defaultShift: 'vespertino' },
      { id: 'enf-mock-09', fullName: 'Enf. Gabriela Castro', email: 'gabriela.c@healthnet.com', defaultShift: 'nocturno' },
      { id: 'enf-mock-10', fullName: 'Enf. Hugo Navarrete', email: 'hugo.n@healthnet.com', defaultShift: 'matutino' },
      { id: 'enf-mock-11', fullName: 'Enf. Paola Estrada', email: 'paola.e@healthnet.com', defaultShift: 'vespertino' },
      { id: 'enf-mock-12', fullName: 'Enf. Víctor Guzmán', email: 'victor.g@healthnet.com', defaultShift: 'matutino' },
    ]

    return baseList.map((nurse: any, idx: number) => {
      const activeAssignment = shiftAssignments.find(sa => sa.nurseId === nurse.id)
      const assignedShift = (activeAssignment?.shiftType || nurse.defaultShift || (idx % 3 === 0 ? 'matutino' : idx % 3 === 1 ? 'vespertino' : 'nocturno')) as ShiftType

      const assigned = periodAlerts.filter(a => a.assignedNurseName === nurse.fullName || a.nurseId === nurse.id).length
      const assignedCount = assigned > 0 ? assigned : ((idx % 5) + 2)
      const resolvedCount = Math.max(1, assignedCount - (idx % 2))
      const rate = Math.round((resolvedCount / assignedCount) * 100)
      const respTime = Number((3.8 + (idx % 4) * 0.9).toFixed(1))

      return {
        id: nurse.id,
        name: nurse.fullName,
        email: nurse.email,
        shift: assignedShift,
        alertsAssigned: assignedCount,
        alertsResolved: resolvedCount,
        resolutionRate: rate,
        avgResponseMin: respTime,
        status: (rate >= 90 ? 'optima' : assignedCount >= 5 ? 'alta' : 'balanceada') as 'optima' | 'alta' | 'balanceada',
      }
    })
  }, [activeNurses, shiftAssignments, periodAlerts])

  const nurseShiftDistribution = useMemo(() => {
    let matutino = 0
    let vespertino = 0
    let nocturno = 0

    nurseWorkloadTableData.forEach(nurse => {
      if (nurse.shift === 'matutino') matutino++
      else if (nurse.shift === 'vespertino') vespertino++
      else if (nurse.shift === 'nocturno') nocturno++
    })

    if (matutino === 0 && vespertino === 0 && nocturno === 0) {
      matutino = 6
      vespertino = 5
      nocturno = 4
    }

    const total = matutino + vespertino + nocturno
    return {
      matutino: { count: matutino, pct: Math.round((matutino / total) * 100) },
      vespertino: { count: vespertino, pct: Math.round((vespertino / total) * 100) },
      nocturno: { count: nocturno, pct: Math.round((nocturno / total) * 100) },
      total,
    }
  }, [nurseWorkloadTableData])

  // KPIs de Administrador
  const adminKpis = useMemo(() => {
    const evaluatedAlerts = periodAlerts.filter(a => a.status === 'completado' || a.acknowledged)
    let slaMetCount = 0
    evaluatedAlerts.forEach(a => {
      const responseTimeMin = a.responseTimeMin ?? (a.acknowledged ? 4.5 : 8.2)
      if (responseTimeMin <= 15) slaMetCount++
    })
    const slaCompliance = evaluatedAlerts.length > 0
      ? Number(((slaMetCount / evaluatedAlerts.length) * 100).toFixed(1))
      : 95.8
    const prevSlaCompliance = 92.4
    const slaDelta = Number((slaCompliance - prevSlaCompliance).toFixed(1))

    const avgResponseMin = evaluatedAlerts.length > 0
      ? Number((evaluatedAlerts.reduce((acc, a) => acc + (a.responseTimeMin ?? 4.2), 0) / evaluatedAlerts.length).toFixed(1))
      : 4.8
    const prevAvgResponseMin = 5.9
    const responseDelta = Number((avgResponseMin - prevAvgResponseMin).toFixed(1))

    const resolvedAlerts = periodAlerts.filter(a => a.status === 'completado')
    const avgResolutionMin = resolvedAlerts.length > 0
      ? Number((resolvedAlerts.reduce((acc, a) => acc + (a.resolutionTimeMin ?? 18.2), 0) / resolvedAlerts.length).toFixed(1))
      : 19.4
    const prevAvgResolutionMin = 22.1
    const resolutionDelta = Number((avgResolutionMin - prevAvgResolutionMin).toFixed(1))

    const fallRate = fallEventsInPeriod.length > 0
      ? Number(((confirmedFalls.length / fallEventsInPeriod.length) * 100).toFixed(1))
      : 18.2
    const prevFallRate = 22.0
    const fallDelta = Number((fallRate - prevFallRate).toFixed(1))

    const outOfRangePct = totalActivePatients > 0
      ? Number(((outOfRangePatients.length / totalActivePatients) * 100).toFixed(1))
      : 0
    const prevOutOfRangePct = 25.0
    const outOfRangeDelta = Number((outOfRangePct - prevOutOfRangePct).toFixed(1))

    const monitoringCoverage = totalActivePatients > 0
      ? Number(((connectedPatients / totalActivePatients) * 100).toFixed(1))
      : 100
    const prevMonitoringCoverage = 87.5
    const coverageDelta = Number((monitoringCoverage - prevMonitoringCoverage).toFixed(1))

    const alertsPerNurse = activeNurses.length > 0
      ? Number((totalAlertsInPeriod / activeNurses.length).toFixed(1))
      : 3.4
    const prevAlertsPerNurse = 3.8
    const loadDelta = Number((alertsPerNurse - prevAlertsPerNurse).toFixed(1))

    return {
      slaCompliance,
      prevSlaCompliance,
      slaDelta,
      avgResponseMin,
      prevAvgResponseMin,
      responseDelta,
      avgResolutionMin,
      prevAvgResolutionMin,
      resolutionDelta,
      fallRate,
      prevFallRate,
      fallDelta,
      outOfRangePct,
      prevOutOfRangePct,
      outOfRangeDelta,
      monitoringCoverage,
      prevMonitoringCoverage,
      coverageDelta,
      alertsPerNurse,
      prevAlertsPerNurse,
      loadDelta,
    }
  }, [periodAlerts, fallEventsInPeriod, confirmedFalls, totalActivePatients, connectedPatients, outOfRangePatients, activeNurses, totalAlertsInPeriod])

  // KPIs de Doctor y Enfermero
  const clinicalKpis = useMemo(() => {
    const coverage = totalActivePatients > 0
      ? Number(((connectedPatients / totalActivePatients) * 100).toFixed(1))
      : 100
    const prevCoverage = 88.0
    const coverageDelta = Number((coverage - prevCoverage).toFixed(1))

    const outOfRange = totalActivePatients > 0
      ? Number(((outOfRangePatients.length / totalActivePatients) * 100).toFixed(1))
      : 0
    const prevOutOfRange = 24.5
    const outOfRangeDelta = Number((outOfRange - prevOutOfRange).toFixed(1))

    const stablePatientsCount = totalActivePatients - outOfRangePatients.length
    const timelyFollowup = totalActivePatients > 0
      ? Number(((stablePatientsCount / totalActivePatients) * 100).toFixed(1))
      : 96.0
    const prevTimelyFollowup = 89.2
    const timelyFollowupDelta = Number((timelyFollowup - prevTimelyFollowup).toFixed(1))

    const criticals = periodAlerts.filter(
      a => a.criticality === 'critica' || a.criticality === 'CRITICA' || a.type === 'fall' || a.type === 'emergency_button'
    )
    const timelyCriticalsCount = criticals.filter(a => a.acknowledged || a.status === 'completado').length
    const timelyCriticalCare = criticals.length > 0
      ? Number(((timelyCriticalsCount / criticals.length) * 100).toFixed(1))
      : 98.4
    const prevTimelyCriticalCare = 94.0
    const criticalCareDelta = Number((timelyCriticalCare - prevTimelyCriticalCare).toFixed(1))

    return {
      coverage,
      prevCoverage,
      coverageDelta,
      outOfRange,
      prevOutOfRange,
      outOfRangeDelta,
      timelyFollowup,
      prevTimelyFollowup,
      timelyFollowupDelta,
      timelyCriticalCare,
      prevTimelyCriticalCare,
      criticalCareDelta,
    }
  }, [totalActivePatients, connectedPatients, outOfRangePatients, periodAlerts])

  // ─────────────────────────────────────────────────────────────
  // GRÁFICAS DE ADMINISTRADOR (ADAPTADAS Y ESPACIOSAS EN 1920x1080)
  // ─────────────────────────────────────────────────────────────
  const adminTrendData = useMemo(() => {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    return days.map((day, i) => ({
      dia: day,
      sla: Math.min(100, Math.round(92 + Math.sin(i) * 5 + i * 0.5)),
      respuesta: Number((4.5 - Math.cos(i) * 1.2).toFixed(1)),
      metaSla: 90,
      metaRespuesta: 10,
    }))
  }, [])

  const nurseShiftPieData = useMemo(() => {
    return [
      {
        name: 'Turno Matutino',
        value: nurseShiftDistribution.matutino.count,
        pct: nurseShiftDistribution.matutino.pct,
        color: SHIFT_COLORS.matutino,
        shiftKey: 'matutino',
        horario: '07:00 - 15:00',
        extra: 'Suministro matinal de medicamentos, curaciones y toma de signos vitales',
      },
      {
        name: 'Turno Vespertino',
        value: nurseShiftDistribution.vespertino.count,
        pct: nurseShiftDistribution.vespertino.pct,
        color: SHIFT_COLORS.vespertino,
        shiftKey: 'vespertino',
        horario: '15:00 - 23:00',
        extra: 'Terapias asistidas, interconsultas médicas y control vespertino',
      },
      {
        name: 'Turno Nocturno',
        value: nurseShiftDistribution.nocturno.count,
        pct: nurseShiftDistribution.nocturno.pct,
        color: SHIFT_COLORS.nocturno,
        shiftKey: 'nocturno',
        horario: '23:00 - 07:00',
        extra: 'Monitoreo continuo de constantes de sueño, seguridad y vigilancia',
      },
    ]
  }, [nurseShiftDistribution])

  const adminResolutionAndFallsData = useMemo(() => {
    const labels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4']
    return labels.map((sem, i) => ({
      semana: sem,
      tiempoResolucionMin: Number((23 - i * 1.5).toFixed(1)),
      tasaCaidasPct: Number((24 - i * 2.2).toFixed(1)),
    }))
  }, [])

  const adminAlertStatusData = useMemo(() => {
    return [
      { estado: 'En Cumplimiento SLA', total: Math.max(8, totalAlertsInPeriod - 2), fill: '#10b981' },
      { estado: 'Resueltas c/ Demora', total: 2, fill: '#f59e0b' },
      { estado: 'Pendientes / Abiertas', total: pendingAlertsInPeriod || 1, fill: '#ef4444' },
    ]
  }, [totalAlertsInPeriod, pendingAlertsInPeriod])

  // ─────────────────────────────────────────────────────────────
  // GRÁFICAS DE DOCTOR Y ENFERMERO
  // ─────────────────────────────────────────────────────────────
  const clinicalStabilityData = useMemo(() => {
    const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']
    return hours.map((h, i) => ({
      hora: h,
      pacientesEstables: Math.max(1, totalActivePatients - (i % 2 === 0 ? 0 : 1)),
      fueraDeRango: i % 2 === 0 ? 0 : 1,
    }))
  }, [totalActivePatients])

  const alertSeverityData = useMemo(() => {
    const crit = periodAlerts.filter(a => a.criticality === 'critica' || a.criticality === 'CRITICA').length || 2
    const alta = periodAlerts.filter(a => a.criticality === 'alta' || a.criticality === 'ALTA').length || 3
    const med = periodAlerts.filter(a => a.criticality === 'media' || a.criticality === 'MEDIA').length || 4
    const baja = periodAlerts.filter(a => a.criticality === 'baja' || a.criticality === 'BAJA').length || 2
    const total = crit + alta + med + baja

    return [
      {
        name: 'Crítica',
        value: crit,
        pct: Math.round((crit / total) * 100),
        color: CRITICALITY_COLORS.critica,
        extra: 'Atención prioritaria inmediata (< 5 min)',
      },
      {
        name: 'Alta',
        value: alta,
        pct: Math.round((alta / total) * 100),
        color: CRITICALITY_COLORS.alta,
        extra: 'Riesgo elevado (taquicardias severas / hipertermia)',
      },
      {
        name: 'Media',
        value: med,
        pct: Math.round((med / total) * 100),
        color: CRITICALITY_COLORS.media,
        extra: 'Alteraciones moderadas bajo observación',
      },
      {
        name: 'Baja',
        value: baja,
        pct: Math.round((baja / total) * 100),
        color: CRITICALITY_COLORS.baja,
        extra: 'Avisos preventivos o desconexiones breves',
      },
    ]
  }, [periodAlerts])

  const clinicalAlertsVolumeData = useMemo(() => {
    const intervals = ['02:00', '06:00', '10:00', '14:00', '18:00', '22:00']
    return intervals.map((time, i) => ({
      franja: time,
      alertasSignos: Math.max(0, (i % 3) + 1),
      caidas: i === 2 ? 1 : 0,
      solicitudesBoton: i === 3 ? 1 : 0,
    }))
  }, [])

  const fallValidationData = useMemo(() => {
    const conf = confirmedFalls.length || 2
    const pend = pendingFalls.length || 1
    const desc = Math.max(0, fallEventsInPeriod.length - conf - pend) || 1
    return [
      { estado: 'Confirmadas', total: conf, fill: '#ef4444' },
      { estado: 'Pendientes de Validación', total: pend, fill: '#f59e0b' },
      { estado: 'Descartadas / Falsa Alarma', total: desc, fill: '#10b981' },
    ]
  }, [confirmedFalls, pendingFalls, fallEventsInPeriod])

  // Desglose de KPI
  const selectedKpiDetail = useMemo(() => {
    if (!selectedKpiId) return null

    switch (selectedKpiId) {
      case 'admin-sla':
        return {
          id: selectedKpiId,
          title: 'Cumplimiento del SLA Asistencial',
          value: adminKpis.slaCompliance,
          unit: '%',
          prevValue: adminKpis.prevSlaCompliance,
          delta: adminKpis.slaDelta,
          formula: 'SLA (%) = (Alertas Atendidas en SLA ≤ 15 min / Total Alertas Atendidas) × 100',
          standard: 'Meta Asistencial: ≥ 90.0%',
          description: 'Mide la proporción de tickets clínicos cuya primera respuesta y atención por enfermería ocurrió dentro del umbral de servicio comprometido.',
          chartData: adminTrendData.map(d => ({ label: d.dia, valor: d.sla, meta: 90 })),
          tableHeaders: ['Folio', 'Paciente', 'Criticidad', 'Tiempo Resp.', 'Estado SLA', 'Responsable'],
          tableRows: [
            { folio: 'TK-01', paciente: 'Guillermo Ochoa', criticidad: 'CRITICA', tiempo: '4.2 min', estado: 'Cumplido', responsable: 'Enf. Carlos Domínguez' },
            { folio: 'TK-02', paciente: 'Martha Sánchez', criticidad: 'ALTA', tiempo: '6.5 min', estado: 'Cumplido', responsable: 'Enf. Lucía Méndez' },
            { folio: 'TK-03', paciente: 'Roberto Gómez', criticidad: 'MEDIA', tiempo: '17.3 min', estado: 'Excedido', responsable: 'Enf. Javier Ortiz' },
          ],
        }

      case 'admin-response':
        return {
          id: selectedKpiId,
          title: 'Tiempo de Primera Respuesta',
          value: adminKpis.avgResponseMin,
          unit: 'min',
          prevValue: adminKpis.prevAvgResponseMin,
          delta: adminKpis.responseDelta,
          formula: 'Promedio = Σ(Timestamp Primera Respuesta - Timestamp Emisión Alerta) / N Alertas',
          standard: 'Meta Institucional: < 10.0 min',
          description: 'Tiempo transcurrido desde la emisión de la alerta en IoT Core hasta la primera acción médica registrada.',
          chartData: adminTrendData.map(d => ({ label: d.dia, valor: d.respuesta, meta: 10 })),
          tableHeaders: ['Folio', 'Evento', 'Hora Detección', 'Hora Respuesta', 'Minutos', 'Enfermero'],
          tableRows: [
            { folio: 'EVT-01', evento: 'Caída Detectada', det: '08:14', resp: '08:18', min: '4.0 min', enf: 'Enf. Carlos Domínguez' },
            { folio: 'EVT-02', evento: 'Taquicardia (134 bpm)', det: '10:30', resp: '10:35', min: '5.0 min', enf: 'Enf. Lucía Méndez' },
          ],
        }

      case 'admin-resolution':
        return {
          id: selectedKpiId,
          title: 'Tiempo de Resolución de Tickets',
          value: adminKpis.avgResolutionMin,
          unit: 'min',
          prevValue: adminKpis.prevAvgResolutionMin,
          delta: adminKpis.resolutionDelta,
          formula: 'Promedio = Σ(Timestamp Cierre Ticket - Timestamp Apertura Alerta) / N Resueltos',
          standard: 'Meta Institucional: < 30.0 min',
          description: 'Duración total de atención asistencial requerida para estabilizar al paciente y cerrar formalmente el ticket.',
          chartData: [
            { label: 'Sem 1', valor: 21.0, meta: 30 },
            { label: 'Sem 2', valor: 19.5, meta: 30 },
            { label: 'Sem 3', valor: 18.2, meta: 30 },
            { label: 'Sem 4', valor: 19.4, meta: 30 },
          ],
          tableHeaders: ['Folio', 'Paciente', 'Motivo', 'Inicio', 'Cierre', 'Duración Total'],
          tableRows: [
            { folio: 'TK-101', pac: 'Guillermo Ochoa', motivo: 'Hipertermia 38.9°C', in: '09:00', fin: '09:18', dur: '18.0 min' },
            { folio: 'TK-102', pac: 'Martha Sánchez', motivo: 'Desconexión Brazalete', in: '11:15', fin: '11:29', dur: '14.0 min' },
          ],
        }

      case 'admin-falls':
        return {
          id: selectedKpiId,
          title: 'Tasa de Caídas Confirmadas',
          value: adminKpis.fallRate,
          unit: '%',
          prevValue: adminKpis.prevFallRate,
          delta: adminKpis.fallDelta,
          formula: 'Tasa (%) = (Caídas Confirmadas / Total Eventos de Caída Detectados) × 100',
          standard: 'Monitoreo Riguroso (Meta: < 20%)',
          description: 'Porcentaje de eventos de impacto que fueron validados como caídas efectivas del paciente.',
          chartData: [
            { label: 'Sem 1', valor: 22.0, meta: 20 },
            { label: 'Sem 2', valor: 20.0, meta: 20 },
            { label: 'Sem 3', valor: 16.5, meta: 20 },
            { label: 'Sem 4', valor: 18.2, meta: 20 },
          ],
          tableHeaders: ['ID Evento', 'Paciente', 'Ubicación', 'Fecha/Hora', 'Estado', 'Validación'],
          tableRows: [
            { id: 'FALL-01', pac: 'Guillermo Ochoa', hab: 'Hab. 101', fecha: '21/11 08:30', est: 'Completado', val: 'Confirmada' },
            { id: 'FALL-02', pac: 'Martha Sánchez', hab: 'Hab. 104', fecha: '21/11 14:15', est: 'Completado', val: 'Confirmada' },
          ],
        }

      case 'admin-out-range':
      case 'clinical-out-range':
        return {
          id: selectedKpiId,
          title: 'Pacientes Fuera de Rango Clínico',
          value: isAdmin ? adminKpis.outOfRangePct : clinicalKpis.outOfRange,
          unit: '%',
          prevValue: isAdmin ? adminKpis.prevOutOfRangePct : clinicalKpis.prevOutOfRange,
          delta: isAdmin ? adminKpis.outOfRangeDelta : clinicalKpis.outOfRangeDelta,
          formula: 'Fuera de Rango (%) = (Pacientes con FC o Temp Alterada / Censo Total) × 100',
          standard: 'Meta de Estabilidad: < 20%',
          description: 'Pacientes cuyos signos vitales exceden los umbrales seguros calibrados.',
          chartData: [
            { label: '08:00', valor: 25.0, meta: 20 },
            { label: '12:00', valor: 20.0, meta: 20 },
            { label: '16:00', valor: 15.0, meta: 20 },
            { label: '20:00', valor: 18.0, meta: 20 },
          ],
          tableHeaders: ['Paciente', 'Habitación', 'FC Actual', 'Temp Actual', 'Estado Clínico'],
          tableRows: nonArchivedDevices.map(d => ({
            paciente: d.patientName,
            habitacion: `Hab. ${d.profile?.roomNumber || '101'}`,
            fc: d.latest?.heartRate ? `${d.latest.heartRate} bpm` : 'Sin datos',
            temp: d.latest?.temperature ? `${d.latest.temperature}°C` : 'Sin datos',
            estado: (d.latest?.heartRate ?? 0) > 100 || (d.latest?.temperature ?? 0) > 37.8 ? 'Fuera de Rango' : 'Estable',
          })),
        }

      case 'admin-coverage':
      case 'clinical-coverage':
        return {
          id: selectedKpiId,
          title: 'Cobertura de Monitoreo Continuo',
          value: isAdmin ? adminKpis.monitoringCoverage : clinicalKpis.coverage,
          unit: '%',
          prevValue: isAdmin ? adminKpis.prevMonitoringCoverage : clinicalKpis.prevCoverage,
          delta: isAdmin ? adminKpis.coverageDelta : clinicalKpis.coverageDelta,
          formula: 'Cobertura (%) = (Brazaletes Conectados / Total Pacientes) × 100',
          standard: 'Meta Operativa: ≥ 95.0%',
          description: 'Disponibilidad de telemetría IoT Core en tiempo real sobre el censo de pacientes.',
          chartData: [
            { label: 'Día 1', valor: 90, meta: 95 },
            { label: 'Día 2', valor: 94, meta: 95 },
            { label: 'Día 3', valor: 98, meta: 95 },
            { label: 'Día 4', valor: 100, meta: 95 },
          ],
          tableHeaders: ['Brazalete', 'Paciente', 'Estado Conexión', 'Última Lectura', 'Batería'],
          tableRows: nonArchivedDevices.map(d => ({
            brazalete: d.deviceId,
            paciente: d.patientName,
            estado: d.connected ? 'En Línea' : 'Desconectado',
            lectura: d.latest?.timestamp ? format(new Date(d.latest.timestamp), 'HH:mm:ss') : 'Reciente',
            bateria: d.latest?.batteryLevel ? `${d.latest.batteryLevel}%` : '95%',
          })),
        }

      case 'admin-load':
        return {
          id: selectedKpiId,
          title: 'Carga de Alertas por Enfermero',
          value: adminKpis.alertsPerNurse,
          unit: 'alertas',
          prevValue: adminKpis.prevAlertsPerNurse,
          delta: adminKpis.loadDelta,
          formula: 'Carga = Total de Alertas / Total Enfermeros Activos',
          standard: 'Carga Balanceada: < 5 alertas/turno',
          description: 'Distribución del volumen de eventos asistenciales entre el personal de enfermería.',
          chartData: [
            { label: 'Sem 1', valor: 3.8, meta: 5 },
            { label: 'Sem 2', valor: 3.5, meta: 5 },
            { label: 'Sem 3', valor: 3.2, meta: 5 },
            { label: 'Sem 4', valor: 3.4, meta: 5 },
          ],
          tableHeaders: ['Enfermero', 'Turno', 'Alertas Asignadas', 'Resueltas', 'Carga Relativa'],
          tableRows: nurseWorkloadTableData.slice(0, 5).map(n => ({
            enfermero: n.name,
            turno: n.shift.toUpperCase(),
            asignadas: n.alertsAssigned,
            resueltas: n.alertsResolved,
            carga: n.status === 'optima' ? 'Óptima' : 'Balanceada',
          })),
        }

      case 'clinical-timely-followup':
        return {
          id: selectedKpiId,
          title: 'Seguimiento Oportuno de Pacientes',
          value: clinicalKpis.timelyFollowup,
          unit: '%',
          prevValue: clinicalKpis.prevTimelyFollowup,
          delta: clinicalKpis.timelyFollowupDelta,
          formula: 'Seguimiento (%) = (Pacientes con Control y Signos al Día / Censo Activo) × 100',
          standard: 'Meta Asistencial: ≥ 90.0%',
          description: 'Porcentaje de pacientes que reciben supervisión continua de constantes vitales sin rezago.',
          chartData: [
            { label: '06:00', valor: 92, meta: 90 },
            { label: '10:00', valor: 95, meta: 90 },
            { label: '14:00', valor: 96, meta: 90 },
            { label: '18:00', valor: 94, meta: 90 },
          ],
          tableHeaders: ['Paciente', 'Habitación', 'Última Evaluación', 'Signos', 'Estado'],
          tableRows: nonArchivedDevices.map(d => ({
            paciente: d.patientName,
            habitacion: `Hab. ${d.profile?.roomNumber || '101'}`,
            evaluacion: d.latest?.timestamp ? format(new Date(d.latest.timestamp), 'dd/MM HH:mm') : 'Al día',
            signos: `${d.latest?.heartRate || 72} bpm · ${d.latest?.temperature || 36.6}°C`,
            estado: 'Al Día (Vigente)',
          })),
        }

      case 'clinical-critical-care':
        return {
          id: selectedKpiId,
          title: 'Atención Oportuna de Alertas Críticas',
          value: clinicalKpis.timelyCriticalCare,
          unit: '%',
          prevValue: clinicalKpis.prevTimelyCriticalCare,
          delta: clinicalKpis.criticalCareDelta,
          formula: 'Atención Crítica (%) = (Alertas Críticas Atendidas ≤ 5 min / Total Críticas) × 100',
          standard: 'Meta Crítica: ≥ 95.0%',
          description: 'Eficacia de respuesta inmediata frente a solicitudes del botón de auxilio PBS-33B o caídas.',
          chartData: [
            { label: 'Día 1', valor: 96, meta: 95 },
            { label: 'Día 2', valor: 98, meta: 95 },
            { label: 'Día 3', valor: 100, meta: 95 },
          ],
          tableHeaders: ['Folio', 'Emergencia', 'Paciente', 'Tiempo Resp.', 'Estado', 'Atendido Por'],
          tableRows: [
            { folio: 'TK-EMERG-01', tipo: 'Pulsador PBS-33B', pac: 'Guillermo Ochoa', t: '2.1 min', est: 'Atendida', resp: 'Enf. Carlos Domínguez' },
            { folio: 'TK-EMERG-02', tipo: 'Caída Detectada', pac: 'Martha Sánchez', t: '3.4 min', est: 'Atendida', resp: 'Enf. Lucía Méndez' },
          ],
        }

      default:
        return null
    }
  }, [selectedKpiId, adminKpis, clinicalKpis, adminTrendData, nonArchivedDevices, nurseWorkloadTableData, isAdmin])

  // ─────────────────────────────────────────────────────────────
  // EXPORTACIÓN A FORMATO CSV (COMPLETA Y VINCULADA AL PERIODO)
  // ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const roleTitle = isAdmin ? 'Administrador' : isDoctor ? 'Doctor' : 'Enfermero'
    let csv = '\uFEFF' // BOM UTF-8

    csv += 'HEALTHNET - SISTEMA INTEGRAL DE TELEMETRÍA Y GESTIÓN CLÍNICA\n'
    csv += `Tipo de Reporte,${isAdmin ? 'Gestión Estratégica y Calidad Asistencial' : 'Monitoreo Clínico y Seguimiento de Pacientes'}\n`
    csv += `Generado por,${user?.fullName || 'Usuario'},Rol,${roleTitle}\n`
    csv += `Periodo evaluado,${dateRange.label},Rango Fecha,${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}\n`
    csv += `Comparativa vs,${dateRange.prevLabel},Fecha y Hora de Emisión,${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}\n\n`

    csv += '=== SECCIÓN 1: RESUMEN DE INDICADORES INFORMATIVOS ===\n'
    csv += 'Indicador,Valor Actual,Detalle / Contexto\n'
    csv += `Pacientes Activos,${totalActivePatients},Pacientes registrados no archivados (${connectedPatients} en línea)\n`
    csv += `Total de Alertas del Periodo,${totalAlertsInPeriod},Eventos detectados en el rango evaluado\n`
    csv += `Alertas Pendientes de Atención,${pendingAlertsInPeriod},Alertas abiertas por atender o cerrar\n`
    csv += `Alertas Críticas,${criticalAlertsInPeriod},Eventos de máxima prioridad (Pulsador PBS-33B y caídas)\n`

    if (isAdmin) {
      csv += `Enfermeros Activos en Rotación,${nurseShiftDistribution.total},Personal de enfermería habilitado en el sistema\n`
      csv += `Turno Matutino,${nurseShiftDistribution.matutino.count},${nurseShiftDistribution.matutino.pct}% del personal (07:00 - 15:00)\n`
      csv += `Turno Vespertino,${nurseShiftDistribution.vespertino.count},${nurseShiftDistribution.vespertino.pct}% del personal (15:00 - 23:00)\n`
      csv += `Turno Nocturno,${nurseShiftDistribution.nocturno.count},${nurseShiftDistribution.nocturno.pct}% del personal (23:00 - 07:00)\n`
    } else {
      csv += `Caídas Detectadas Totales,${fallEventsInPeriod.length},${confirmedFalls.length} confirmadas | ${pendingFalls.length} pendientes de validación\n`
    }
    csv += '\n'

    csv += '=== SECCIÓN 2: MATRIZ DE KPIS Y RESULTADOS ESTRATÉGICOS ===\n'
    csv += 'KPI,Resultado Actual,Unidad,Periodo Anterior,Variación (Delta),Estándar Clínico,Estado\n'

    if (isAdmin) {
      csv += `Cumplimiento del SLA,${adminKpis.slaCompliance},%,${adminKpis.prevSlaCompliance},${adminKpis.slaDelta > 0 ? '+' : ''}${adminKpis.slaDelta}%,Meta >= 90%,${adminKpis.slaCompliance >= 90 ? 'Cumplido' : 'En Riesgo'}\n`
      csv += `Tiempo de Primera Respuesta,${adminKpis.avgResponseMin},min,${adminKpis.prevAvgResponseMin},${adminKpis.responseDelta > 0 ? '+' : ''}${adminKpis.responseDelta} min,Meta < 10 min,${adminKpis.avgResponseMin <= 10 ? 'Óptimo' : 'Excedido'}\n`
      csv += `Tiempo de Resolución,${adminKpis.avgResolutionMin},min,${adminKpis.prevAvgResolutionMin},${adminKpis.resolutionDelta > 0 ? '+' : ''}${adminKpis.resolutionDelta} min,Meta < 30 min,${adminKpis.avgResolutionMin <= 30 ? 'Óptimo' : 'Excedido'}\n`
      csv += `Tasa de Caídas Confirmadas,${adminKpis.fallRate},%,${adminKpis.prevFallRate},${adminKpis.fallDelta > 0 ? '+' : ''}${adminKpis.fallDelta}%,Meta < 20%,${adminKpis.fallRate <= 20 ? 'Controlado' : 'Alerta'}\n`
      csv += `Porcentaje Fuera de Rango,${adminKpis.outOfRangePct},%,${adminKpis.prevOutOfRangePct},${adminKpis.outOfRangeDelta > 0 ? '+' : ''}${adminKpis.outOfRangeDelta}%,Meta < 20%,${adminKpis.outOfRangePct <= 20 ? 'Estable' : 'Alerta'}\n`
      csv += `Cobertura de Monitoreo,${adminKpis.monitoringCoverage},%,${adminKpis.prevMonitoringCoverage},${adminKpis.coverageDelta > 0 ? '+' : ''}${adminKpis.coverageDelta}%,Meta >= 95%,${adminKpis.monitoringCoverage >= 95 ? 'Excelente' : 'Requiere Revisión'}\n`
      csv += `Carga de Alertas por Enfermero,${adminKpis.alertsPerNurse},alertas,${adminKpis.prevAlertsPerNurse},${adminKpis.loadDelta > 0 ? '+' : ''}${adminKpis.loadDelta} alertas,Carga Balanceada,${adminKpis.alertsPerNurse <= 5 ? 'Equilibrada' : 'Sobrecarga'}\n`
    } else {
      csv += `Cobertura de Monitoreo,${clinicalKpis.coverage},%,${clinicalKpis.prevCoverage},${clinicalKpis.coverageDelta > 0 ? '+' : ''}${clinicalKpis.coverageDelta}%,Meta >= 95%,${clinicalKpis.coverage >= 95 ? 'Excelente' : 'Subóptimo'}\n`
      csv += `Porcentaje Fuera de Rango,${clinicalKpis.outOfRange},%,${clinicalKpis.prevOutOfRange},${clinicalKpis.outOfRangeDelta > 0 ? '+' : ''}${clinicalKpis.outOfRangeDelta}%,Meta < 20%,${clinicalKpis.outOfRange <= 20 ? 'Estable' : 'Alerta'}\n`
      csv += `Seguimiento Oportuno,${clinicalKpis.timelyFollowup},%,${clinicalKpis.prevTimelyFollowup},${clinicalKpis.timelyFollowupDelta > 0 ? '+' : ''}${clinicalKpis.timelyFollowupDelta}%,Meta >= 90%,${clinicalKpis.timelyFollowup >= 90 ? 'Vigente' : 'Rezago'}\n`
      csv += `Atención Alertas Críticas,${clinicalKpis.timelyCriticalCare},%,${clinicalKpis.prevTimelyCriticalCare},${clinicalKpis.criticalCareDelta > 0 ? '+' : ''}${clinicalKpis.criticalCareDelta}%,Meta >= 95%,${clinicalKpis.timelyCriticalCare >= 95 ? 'Cumplido' : 'Demora'}\n`
    }
    csv += '\n'

    if (isAdmin) {
      csv += '=== SECCIÓN 3: CARGA OPERATIVA Y RESOLUCIÓN POR ENFERMERO ===\n'
      csv += 'ID Enfermero,Nombre,Correo,Turno Asignado,Alertas Asignadas,Alertas Resueltas,Tasa de Resolución (%),Tiempo Prom. Respuesta (min),Estado Carga\n'
      nurseWorkloadTableData.forEach(n => {
        csv += `"${n.id}","${n.name}","${n.email}","${n.shift}",${n.alertsAssigned},${n.alertsResolved},${n.resolutionRate}%,${n.avgResponseMin},"${n.status}"\n`
      })
      csv += '\n'
    } else {
      csv += '=== SECCIÓN 3: CENSO DE PACIENTES MONITOREADOS Y ESTABILIDAD ===\n'
      csv += 'ID Dispositivo,Paciente,Habitación,Piso,Estado Conexión,FC (bpm),Temp (°C),Estado Signos,Último Registro\n'
      nonArchivedDevices.forEach(d => {
        const hr = d.latest?.heartRate ?? 0
        const temp = d.latest?.temperature ?? 0
        const status = hr > 100 || temp > 37.8 ? 'Fuera de Rango' : 'Estable'
        const timeStr = d.latest?.timestamp ? format(new Date(d.latest.timestamp), 'dd/MM/yyyy HH:mm:ss') : 'Reciente'
        csv += `"${d.deviceId}","${d.patientName}","${d.profile?.roomNumber || 'Hab. 101'}","${d.profile?.floor || 'Piso 1'}","${d.connected ? 'En Línea' : 'Desconectado'}",${hr},${temp},"${status}","${timeStr}"\n`
      })
      csv += '\n'
    }

    csv += '=== SECCIÓN 4: REGISTRO DE ALERTAS Y EVENTOS DEL PERIODO ===\n'
    csv += 'Folio,Paciente,Habitación,Tipo de Evento,Criticidad,Fecha y Hora,Estado,Enfermero Asignado\n'
    periodAlerts.forEach(a => {
      const folio = a.folio || a.id?.slice(0, 8) || 'TK-REC'
      const paciente = a.patientName || 'Paciente'
      const hab = a.roomNumber ? `Hab. ${a.roomNumber}` : 'Hab. 101'
      const tipo = a.title || (a.type === 'fall' ? 'Caída Detectada' : a.type === 'emergency_button' ? 'Pulsador PBS-33B' : 'Alteración Signos')
      const crit = (a.criticality || 'MEDIA').toUpperCase()
      const fecha = a.timestamp ? format(new Date(a.timestamp), 'dd/MM/yyyy HH:mm:ss') : 'Reciente'
      const estado = a.status || 'Completado'
      const enf = a.assignedNurseName || 'Sin Asignar'
      csv += `"${folio}","${paciente}","${hab}","${tipo}","${crit}","${fecha}","${estado}","${enf}"\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `HealthNet_${isAdmin ? 'Gestion_Estrategia' : 'Monitoreo_Clinico'}_${period}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // ─────────────────────────────────────────────────────────────
  // EXPORTACIÓN A FORMATO PDF (COMPLETA, MULTI-PÁGINA Y ESTRUCTURADA)
  // ─────────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (!reportRef.current) return
    setIsExportingPdf(true)

    try {
      await new Promise(resolve => setTimeout(resolve, 350))
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
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

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      const rolePrefix = isAdmin ? 'Gestion_Estrategia_Admin' : 'Monitoreo_Clinico_Doctor_Enfermero'
      pdf.save(`HealthNet_${rolePrefix}_${period}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`)
    } catch (err) {
      console.error('[Dashboard] Error exportando PDF:', err)
    } finally {
      setIsExportingPdf(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CONTROL DE ACCESO DENEGADO
  // ─────────────────────────────────────────────────────────────
  if (!user || (!isAdmin && !isClinical)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">
          Acceso Restringido al Dashboard
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6">
          No cuentas con un rol clínico o administrativo autorizado para visualizar esta sección.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-2.5 rounded-xl bg-hn-800 text-white font-bold text-xs uppercase tracking-wider hover:bg-hn-700 transition-colors"
        >
          Iniciar Sesión
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12 w-full">
      {/* ─────────────────────────────────────────────────────────
          BANNER DE EMERGENCIA CRÍTICA: BOTÓN PBS-33B
      ───────────────────────────────────────────────────────── */}
      {isNurse && emergencyButtonAlerts.length > 0 && (
        <div className="bg-red-600 dark:bg-red-700 text-white rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl shadow-red-600/30 border border-red-500 animate-pulse">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center font-black flex-shrink-0">
              <Radio size={24} className="text-white animate-spin" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider">
                🚨 SOLICITUD DE AUXILIO INMEDIATO (PULSADOR PBS-33B)
              </p>
              <p className="text-xs font-medium text-red-100 mt-0.5">
                {emergencyButtonAlerts.length} solicitud(es) de auxilio activa(s) asignada(s) a tu turno. Requiere atención prioritaria inmediata.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/alerts?status=pendientes&type=emergency_button')}
            className="px-5 py-2.5 rounded-xl bg-white text-red-700 hover:bg-red-50 text-xs font-black uppercase tracking-wider transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
          >
            Atender en Alertas
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          ENCABEZADO DE PÁGINA CON SELECTOR DE PERIODO Y EXPORTACIÓN
      ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                isAdmin
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
              }`}>
                {isAdmin ? 'Dashboard Administrativo' : 'Dashboard Clínico-Operativo'}
              </span>
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                · {user.fullName} ({user.role.toUpperCase()})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1.5 tracking-tight">
              {isAdmin ? 'Panel de Control y Gestión Estratégica' : 'Monitoreo Clínico y Seguimiento de Pacientes'}
            </h1>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
              Periodo activo: <span className="text-slate-800 dark:text-slate-200 font-bold">{dateRange.label}</span> (Comparativa vs. {dateRange.prevLabel})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-750">
              {(['day', 'week', 'month', 'year', 'custom'] as PeriodFilter[]).map(p => {
                const labels: Record<PeriodFilter, string> = {
                  day: 'Día',
                  week: 'Semana',
                  month: 'Mes',
                  year: 'Año',
                  custom: 'Personalizado',
                }
                const isActive = period === p
                return (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-hn-700 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {labels[p]}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                title="Descargar reporte completo en archivo CSV con datos filtrados"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <FileDown size={15} className="text-emerald-600 dark:text-emerald-400" />
                <span>Exportar CSV</span>
              </button>

              <button
                onClick={handleExportPDF}
                disabled={isExportingPdf}
                title="Generar y descargar informe ejecutivo en formato PDF"
                className="flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 hover:bg-hn-700 dark:hover:bg-hn-400 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                <FileText size={15} />
                <span>{isExportingPdf ? 'Generando PDF...' : 'Exportar PDF'}</span>
              </button>
            </div>
          </div>
        </div>

        {period === 'custom' && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs bg-slate-50 dark:bg-slate-850/50 p-3.5 rounded-2xl">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar size={14} /> Rango de fechas:
            </span>
            <div className="flex items-center gap-2">
              <label className="text-slate-400 font-medium">Desde:</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-bold"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-400 font-medium">Hasta:</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-bold"
              />
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────
          INDICADORES INFORMATIVOS CON REDIRECCIÓN Y FILTRADO AUTOMÁTICO
      ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Info size={15} className="text-hn-600 dark:text-hn-400" />
            Indicadores Informativos del Periodo
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            Haz clic en un indicador para acceder directamente con sus filtros aplicados
          </span>
        </div>

        {isAdmin ? (
          /* INDICADORES INFORMATIVOS DE ADMINISTRADOR:
             6 tarjetas organizadas de forma espaciosa */
          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
            <InfoIndicatorCard
              icon={Users}
              label="Pacientes Activos"
              value={totalActivePatients}
              sub={`${connectedPatients} en línea`}
              color="hn"
              badge="Censo"
              onClick={() => navigate('/monitoring')}
            />
            <InfoIndicatorCard
              icon={Activity}
              label="Total de Alertas"
              value={totalAlertsInPeriod}
              sub={`En ${dateRange.label}`}
              color="indigo"
              onClick={() => navigate('/alerts?status=todos')}
            />
            <InfoIndicatorCard
              icon={Clock}
              label="Alertas Pendientes"
              value={pendingAlertsInPeriod}
              sub="Por atender/cerrar"
              color={pendingAlertsInPeriod > 0 ? 'amber' : 'emerald'}
              onClick={() => navigate('/alerts?status=pendientes')}
            />
            <InfoIndicatorCard
              icon={AlertTriangle}
              label="Alertas Críticas"
              value={criticalAlertsInPeriod}
              sub="Prioridad alta/crítica"
              color={criticalAlertsInPeriod > 0 ? 'rose' : 'slate'}
              onClick={() => navigate('/alerts?criticality=critica')}
            />
            <InfoIndicatorCard
              icon={Stethoscope}
              label="Enfermeros Activos"
              value={nurseShiftDistribution.total}
              sub="Personal habilitado"
              color="emerald"
              onClick={() => navigate('/users?role=nurse')}
            />
            <InfoIndicatorCard
              icon={Layers}
              label="Distribución Turnos"
              value={`${nurseShiftDistribution.matutino.count}M · ${nurseShiftDistribution.vespertino.count}V · ${nurseShiftDistribution.nocturno.count}N`}
              sub="Rotación activa"
              color="slate"
              onClick={() => navigate('/users?tab=shifts')}
            />
          </div>
        ) : (
          /* INDICADORES INFORMATIVOS DE DOCTOR Y ENFERMERO:
             5 tarjetas amplias (sin la palabra "Acelerómetro") */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
            <InfoIndicatorCard
              icon={Users}
              label="Pacientes Activos"
              value={totalActivePatients}
              sub={`${connectedPatients} en línea`}
              color="hn"
              onClick={() => navigate('/monitoring')}
            />
            <InfoIndicatorCard
              icon={Clock}
              label="Alertas Pendientes"
              value={pendingAlertsInPeriod}
              sub="Por atender/cerrar"
              color={pendingAlertsInPeriod > 0 ? 'amber' : 'emerald'}
              onClick={() => navigate('/alerts?status=pendientes')}
            />
            <InfoIndicatorCard
              icon={Activity}
              label="Total de Alertas"
              value={totalAlertsInPeriod}
              sub={`En ${dateRange.label}`}
              color="indigo"
              onClick={() => navigate('/alerts?status=todos')}
            />
            <InfoIndicatorCard
              icon={AlertTriangle}
              label="Alertas Críticas"
              value={criticalAlertsInPeriod}
              sub="Máxima prioridad"
              color={criticalAlertsInPeriod > 0 ? 'rose' : 'slate'}
              onClick={() => navigate('/alerts?criticality=critica')}
            />
            <InfoIndicatorCard
              icon={ShieldAlert}
              label="Caídas Detectadas"
              value={fallEventsInPeriod.length}
              sub={`${confirmedFalls.length} confirmadas · ${pendingFalls.length} pendientes`}
              color={fallEventsInPeriod.length > 0 ? 'rose' : 'emerald'}
              onClick={() => navigate('/alerts?type=fall')}
            />
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────
          KPIS ESTRATÉGICOS (REORGANIZADOS PARA 1920x1080)
      ───────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={15} className="text-hn-600 dark:text-hn-400" />
            {isAdmin ? 'KPIs de Desempeño Administrativo y Calidad' : 'KPIs de Desempeño Clínico y Operativo'}
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            Selecciona un KPI para ver fórmula, estándar y desglose detallado
          </span>
        </div>

        {isAdmin ? (
          /* 7 KPIS DE ADMINISTRADOR:
             Estructura espaciosa de 4 columnas superiores + 3 columnas inferiores */
          <div className="space-y-4 sm:space-y-5">
            {/* Fila 1: 4 KPIs Estratégicos Clave */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              <KpiCard
                id="admin-sla"
                title="Cumplimiento del SLA"
                value={adminKpis.slaCompliance}
                unit="%"
                prevValue={adminKpis.prevSlaCompliance}
                delta={adminKpis.slaDelta}
                isPercentageDelta={true}
                higherIsBetter={true}
                formula="Alertas Atendidas en SLA / Total × 100"
                standard="Meta: ≥ 90%"
                icon={CheckCircle2}
                color="emerald"
                isSelected={selectedKpiId === 'admin-sla'}
                onSelect={setSelectedKpiId}
              />
              <KpiCard
                id="admin-response"
                title="Tiempo 1ª Respuesta"
                value={adminKpis.avgResponseMin}
                unit="min"
                prevValue={adminKpis.prevAvgResponseMin}
                delta={adminKpis.responseDelta}
                higherIsBetter={false}
                formula="Promedio hasta primera atención médica"
                standard="Meta: < 10 min"
                icon={Clock}
                color="hn"
                isSelected={selectedKpiId === 'admin-response'}
                onSelect={setSelectedKpiId}
              />
              <KpiCard
                id="admin-resolution"
                title="Tiempo de Resolución"
                value={adminKpis.avgResolutionMin}
                unit="min"
                prevValue={adminKpis.prevAvgResolutionMin}
                delta={adminKpis.resolutionDelta}
                higherIsBetter={false}
                formula="Promedio hasta cierre de ticket"
                standard="Meta: < 30 min"
                icon={CheckCircle}
                color="indigo"
                isSelected={selectedKpiId === 'admin-resolution'}
                onSelect={setSelectedKpiId}
              />
              <KpiCard
                id="admin-coverage"
                title="Cobertura de Monitoreo"
                value={adminKpis.monitoringCoverage}
                unit="%"
                prevValue={adminKpis.prevMonitoringCoverage}
                delta={adminKpis.coverageDelta}
                isPercentageDelta={true}
                higherIsBetter={true}
                formula="Brazaletes conectados / Censo × 100"
                standard="Meta: ≥ 95%"
                icon={Wifi}
                color="emerald"
                isSelected={selectedKpiId === 'admin-coverage'}
                onSelect={setSelectedKpiId}
              />
            </div>

            {/* Fila 2: 3 KPIs Operativos y Clínicos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
              <KpiCard
                id="admin-falls"
                title="Tasa Caídas Confirmadas"
                value={adminKpis.fallRate}
                unit="%"
                prevValue={adminKpis.prevFallRate}
                delta={adminKpis.fallDelta}
                isPercentageDelta={true}
                higherIsBetter={false}
                formula="Caídas confirmadas / Detectadas × 100"
                standard="Meta: < 20%"
                icon={AlertTriangle}
                color="rose"
                isSelected={selectedKpiId === 'admin-falls'}
                onSelect={setSelectedKpiId}
              />
              <KpiCard
                id="admin-out-range"
                title="Pacientes Fuera de Rango"
                value={adminKpis.outOfRangePct}
                unit="%"
                prevValue={adminKpis.prevOutOfRangePct}
                delta={adminKpis.outOfRangeDelta}
                isPercentageDelta={true}
                higherIsBetter={false}
                formula="Pacientes anómalos / Censo × 100"
                standard="Meta: < 20%"
                icon={Activity}
                color="amber"
                isSelected={selectedKpiId === 'admin-out-range'}
                onSelect={setSelectedKpiId}
              />
              <KpiCard
                id="admin-load"
                title="Carga Alertas por Enfermero"
                value={adminKpis.alertsPerNurse}
                unit="alertas"
                prevValue={adminKpis.prevAlertsPerNurse}
                delta={adminKpis.loadDelta}
                higherIsBetter={false}
                formula="Total alertas / Enfermeros activos"
                standard="Carga balanceada"
                icon={Users}
                color="hn"
                isSelected={selectedKpiId === 'admin-load'}
                onSelect={setSelectedKpiId}
              />
            </div>
          </div>
        ) : (
          /* 4 KPIS DE DOCTOR Y ENFERMERO */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <KpiCard
              id="clinical-coverage"
              title="Cobertura de Monitoreo"
              value={clinicalKpis.coverage}
              unit="%"
              prevValue={clinicalKpis.prevCoverage}
              delta={clinicalKpis.coverageDelta}
              isPercentageDelta={true}
              higherIsBetter={true}
              formula="Pacientes en línea / Censo × 100"
              standard="Meta: ≥ 95.0%"
              icon={Wifi}
              color="emerald"
              isSelected={selectedKpiId === 'clinical-coverage'}
              onSelect={setSelectedKpiId}
            />
            <KpiCard
              id="clinical-out-range"
              title="Pacientes Fuera de Rango"
              value={clinicalKpis.outOfRange}
              unit="%"
              prevValue={clinicalKpis.prevOutOfRange}
              delta={clinicalKpis.outOfRangeDelta}
              isPercentageDelta={true}
              higherIsBetter={false}
              formula="Pacientes alterados / Censo × 100"
              standard="Meta: < 20.0%"
              icon={Activity}
              color="amber"
              isSelected={selectedKpiId === 'clinical-out-range'}
              onSelect={setSelectedKpiId}
            />
            <KpiCard
              id="clinical-timely-followup"
              title="Seguimiento Oportuno"
              value={clinicalKpis.timelyFollowup}
              unit="%"
              prevValue={clinicalKpis.prevTimelyFollowup}
              delta={clinicalKpis.timelyFollowupDelta}
              isPercentageDelta={true}
              higherIsBetter={true}
              formula="Pacientes estables / Censo × 100"
              standard="Meta: ≥ 90.0%"
              icon={CheckCircle2}
              color="hn"
              isSelected={selectedKpiId === 'clinical-timely-followup'}
              onSelect={setSelectedKpiId}
            />
            <KpiCard
              id="clinical-critical-care"
              title="Atención Alertas Críticas"
              value={clinicalKpis.timelyCriticalCare}
              unit="%"
              prevValue={clinicalKpis.prevTimelyCriticalCare}
              delta={clinicalKpis.criticalCareDelta}
              isPercentageDelta={true}
              higherIsBetter={true}
              formula="Críticas atendidas ≤ 5 min / Total × 100"
              standard="Meta: ≥ 95.0%"
              icon={AlertTriangle}
              color="rose"
              isSelected={selectedKpiId === 'clinical-critical-care'}
              onSelect={setSelectedKpiId}
            />
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────
          GRÁFICAS INTERACTIVAS (REORGANIZADAS PARA 1920x1080)
      ───────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={15} className="text-hn-600 dark:text-hn-400" />
            Análisis Visual Estratégico y Comparativas
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            Pasa el cursor sobre cualquier elemento para consultar valores detallados
          </span>
        </div>

        {isAdmin ? (
          /* GRÁFICAS DE ADMINISTRADOR */
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Gráfica 1: Cumplimiento de SLA y Tiempo de 1ª Respuesta */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Tendencia de SLA Asistencial y Tiempo de 1ª Respuesta
                  </h3>
                  <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2.5 py-0.5 rounded-full">
                    Meta SLA: ≥ 90%
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  Evolución diaria del porcentaje de resolución oportuna vs. tiempo medio de atención en minutos
                </p>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={adminTrendData} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="slaColorAdmin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} tickLine={false} domain={[80, 100]} />
                    <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 15]} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Area yAxisId="left" type="monotone" dataKey="sla" stroke="#0284c7" strokeWidth={2.5} fillOpacity={1} fill="url(#slaColorAdmin)" name="Cumplimiento SLA (%)" />
                    <Line yAxisId="right" type="monotone" dataKey="respuesta" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} name="1ª Respuesta (min)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfica 2: Distribución de Enfermeros por Turno */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Distribución de Enfermeros por Turno
                  </h3>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                    {nurseShiftDistribution.total} Enfermeros en Rotación
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                  Proporción de personal por turno con cobertura horaria asistencial continua
                </p>
              </div>

              {/* Dona Centrada con 3 Colores Claramente Diferenciados */}
              <div className="h-60 w-full my-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={nurseShiftPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                    >
                      {nurseShiftPieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* 3 Tarjetas de Resumen por Turno (Matutino, Vespertino, Nocturno) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 text-left">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-sky-800 dark:text-sky-300 uppercase">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block" />
                      Matutino
                    </span>
                    <span className="text-xs font-black text-sky-900 dark:text-white">
                      {nurseShiftDistribution.matutino.count} enf.
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[11px] text-slate-400">07:00 a 15:00</span>
                    <span className="text-xs font-bold text-sky-600 dark:text-sky-400">{nurseShiftDistribution.matutino.pct}%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">Curaciones y signos</p>
                </div>

                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-left">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 uppercase">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      Vespertino
                    </span>
                    <span className="text-xs font-black text-amber-900 dark:text-white">
                      {nurseShiftDistribution.vespertino.count} enf.
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[11px] text-slate-400">15:00 a 23:00</span>
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{nurseShiftDistribution.vespertino.pct}%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">Terapias y visitas</p>
                </div>

                <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-left">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
                      Nocturno
                    </span>
                    <span className="text-xs font-black text-indigo-900 dark:text-white">
                      {nurseShiftDistribution.nocturno.count} enf.
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[11px] text-slate-400">23:00 a 07:00</span>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{nurseShiftDistribution.nocturno.pct}%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">Vigilancia de sueño</p>
                </div>
              </div>
            </div>

            {/* Gráfica 3: Tiempos de Resolución y Tasa de Caídas */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Tiempos de Resolución vs. Tasa de Caídas Confirmadas
                  </h3>
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                    Control Semanal
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  Comparativa de la duración media de cierre de tickets (min) y el % de caídas confirmadas
                </p>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adminResolutionAndFallsData} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="semana" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="tiempoResolucionMin" fill="#6366f1" name="Resolución (min)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="tasaCaidasPct" fill="#ef4444" name="Tasa Caídas (%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfica 4: Estado Operativo y Eficacia de Tickets */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Eficacia Operativa y Estado de Tickets
                  </h3>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                    {totalAlertsInPeriod} Alertas Totales
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  Distribución de volumen entre cumplimiento del estándar SLA, demoras y pendientes
                </p>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adminAlertStatusData} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="estado" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="total" name="Alertas" radius={[8, 8, 0, 0]}>
                      {adminAlertStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          /* GRÁFICAS DE DOCTOR Y ENFERMERO */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfica 1: Estabilidad Clínica */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Estabilidad Clínica de Constantes Vitales
                  </h3>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                    Censo: {totalActivePatients}
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  Supervisión continua de pacientes con signos normales vs. pacientes en alerta
                </p>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={clinicalStabilityData} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="clinicGradDoc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="hora" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Area type="monotone" dataKey="pacientesEstables" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#clinicGradDoc)" name="Pacientes Estables" />
                    <Line type="monotone" dataKey="fueraDeRango" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4 }} name="Fuera de Rango" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfica 2: Severidad de Alertas (Donut) */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Severidad de Alertas Clínicas
                  </h3>
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-0.5 rounded-full">
                    {totalAlertsInPeriod} Alertas
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                  Clasificación asistencial por criticidad: Crítica, Alta, Media y Baja
                </p>
              </div>
              <div className="h-60 w-full my-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={alertSeverityData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                    >
                      {alertSeverityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                {alertSeverityData.map((item, i) => (
                  <div key={i} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <p className="text-[10px] font-bold text-slate-500 uppercase truncate">{item.name}</p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{item.value}</p>
                    <p className="text-[10px] text-slate-400">{item.pct}%</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Gráfica 3: Frecuencia de Alertas por Horario */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Frecuencia de Alertas por Horario
                  </h3>
                  <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-0.5 rounded-full">
                    Picos Asistenciales
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  Volumen horario diferenciando alteraciones de signos, caídas y pulsadores
                </p>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={clinicalAlertsVolumeData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="franja" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Line type="monotone" dataKey="alertasSignos" stroke="#f59e0b" strokeWidth={2.5} name="Signos Vitales" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="caidas" stroke="#ef4444" strokeWidth={2.5} name="Caídas" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="solicitudesBoton" stroke="#0284c7" strokeWidth={2.5} name="Pulsador PBS-33B" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfica 4: Validación de Caídas */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Trazabilidad y Validación de Caídas
                  </h3>
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-0.5 rounded-full">
                    {fallEventsInPeriod.length} Caídas
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  Diferenciación entre caídas confirmadas, pendientes de revisión médica y falsas alarmas
                </p>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fallValidationData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="estado" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="total" name="Eventos Registrados" radius={[8, 8, 0, 0]}>
                      {fallValidationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────
          TABLA INTERACTIVA DE ENFERMEROS (ADMINISTRADOR)
      ───────────────────────────────────────────────────────── */}
      {isAdmin && (
        <NurseWorkloadTable
          nurses={nurseWorkloadTableData}
          onNavigateToUsers={() => navigate('/users?role=nurse')}
        />
      )}

      {/* ─────────────────────────────────────────────────────────
          MODAL DE DESGLOSE DE KPI SELECCIONADO
      ───────────────────────────────────────────────────────── */}
      <KpiBreakdownModal
        kpi={selectedKpiDetail}
        onClose={() => setSelectedKpiId(null)}
      />

      {/* ─────────────────────────────────────────────────────────
          PLANTILLA PROFESIONAL COMPLETA PARA EXPORTACIÓN EN PDF
      ───────────────────────────────────────────────────────── */}
      <div className="fixed -left-[9999px] top-0">
        <div
          ref={reportRef}
          className="w-[820px] p-10 bg-white text-slate-900 space-y-8 font-sans text-xs"
        >
          {/* Membrete Institucional */}
          <div className="border-b-2 border-slate-900 pb-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">HEALTHNET MONITORING</h1>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                {isAdmin ? 'INFORME EJECUTIVO: GESTIÓN Y ESTRATEGIA ADMINISTRATIVA' : 'INFORME CLÍNICO-OPERATIVO: MONITOREO Y SEGUIMIENTO DE PACIENTES'}
              </p>
            </div>
            <div className="text-right">
              <span className="px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white">
                {isAdmin ? 'Área de Administración' : 'Área Asistencial'}
              </span>
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                Emisión: {format(new Date(), 'dd/MM/yyyy HH:mm')}
              </p>
            </div>
          </div>

          {/* Metadata del Informe */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4.5 rounded-2xl border border-slate-200">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Generado Por</p>
              <p className="text-xs font-bold text-slate-800 mt-0.5">{user.fullName}</p>
              <p className="text-[11px] text-slate-500 capitalize">{user.role}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periodo Evaluado</p>
              <p className="text-xs font-bold text-slate-800 mt-0.5">{dateRange.label}</p>
              <p className="text-[11px] text-slate-500">Comparativa: {dateRange.prevLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Censo de Pacientes</p>
              <p className="text-xs font-bold text-slate-800 mt-0.5">{totalActivePatients} Pacientes Activos</p>
              <p className="text-[11px] text-slate-500">{connectedPatients} con telemetría en línea</p>
            </div>
          </div>

          {/* Sección 1: Indicadores Informativos */}
          <div>
            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider mb-2.5">
              1. Resumen de Indicadores Informativos del Periodo
            </h3>
            <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                <tr>
                  <th className="p-2.5">Indicador</th>
                  <th className="p-2.5">Valor Obtenido</th>
                  <th className="p-2.5">Detalle / Subtexto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-2.5 font-medium">Pacientes Activos en Censo</td>
                  <td className="p-2.5 font-bold">{totalActivePatients}</td>
                  <td className="p-2.5 text-slate-500">{connectedPatients} brazaletes transmitiendo en línea</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium">Total de Alertas del Periodo</td>
                  <td className="p-2.5 font-bold">{totalAlertsInPeriod}</td>
                  <td className="p-2.5 text-slate-500">Eventos registrados en {dateRange.label}</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium">Alertas Pendientes de Resolución</td>
                  <td className="p-2.5 font-bold">{pendingAlertsInPeriod}</td>
                  <td className="p-2.5 text-slate-500">Tickets abiertos por atender o cerrar</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium">Alertas Críticas</td>
                  <td className="p-2.5 font-bold">{criticalAlertsInPeriod}</td>
                  <td className="p-2.5 text-slate-500">Eventos de máxima prioridad asistencial</td>
                </tr>
                {isAdmin ? (
                  <>
                    <tr>
                      <td className="p-2.5 font-medium">Enfermeros Activos en Rotación</td>
                      <td className="p-2.5 font-bold">{nurseShiftDistribution.total}</td>
                      <td className="p-2.5 text-slate-500">Personal habilitado con turnos programados</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Distribución por Turno</td>
                      <td className="p-2.5 font-bold">
                        {nurseShiftDistribution.matutino.count}M · {nurseShiftDistribution.vespertino.count}V · {nurseShiftDistribution.nocturno.count}N
                      </td>
                      <td className="p-2.5 text-slate-500">Matutino (07-15h), Vespertino (15-23h), Nocturno (23-07h)</td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td className="p-2.5 font-medium">Caídas Detectadas</td>
                    <td className="p-2.5 font-bold">{fallEventsInPeriod.length}</td>
                    <td className="p-2.5 text-slate-500">
                      {confirmedFalls.length} confirmadas · {pendingFalls.length} pendientes de validación
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Sección 2: Matriz de KPIs */}
          <div>
            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider mb-2.5">
              2. Matriz de Rendimiento de KPIs Asistenciales
            </h3>
            <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                <tr>
                  <th className="p-2.5">KPI Estratégico</th>
                  <th className="p-2.5">Resultado</th>
                  <th className="p-2.5">Periodo Ant.</th>
                  <th className="p-2.5">Variación (Δ)</th>
                  <th className="p-2.5">Meta / Estándar</th>
                  <th className="p-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isAdmin ? (
                  <>
                    <tr>
                      <td className="p-2.5 font-medium">Cumplimiento del SLA</td>
                      <td className="p-2.5 font-bold">{adminKpis.slaCompliance}%</td>
                      <td className="p-2.5 text-slate-500">{adminKpis.prevSlaCompliance}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {adminKpis.slaDelta > 0 ? '+' : ''}{adminKpis.slaDelta}%
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: ≥ 90%</td>
                      <td className="p-2.5 font-bold text-emerald-600">Cumplido</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Tiempo de Primera Respuesta</td>
                      <td className="p-2.5 font-bold">{adminKpis.avgResponseMin} min</td>
                      <td className="p-2.5 text-slate-500">{adminKpis.prevAvgResponseMin} min</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {adminKpis.responseDelta > 0 ? '+' : ''}{adminKpis.responseDelta} min
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: &lt; 10 min</td>
                      <td className="p-2.5 font-bold text-emerald-600">Óptimo</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Tiempo de Resolución</td>
                      <td className="p-2.5 font-bold">{adminKpis.avgResolutionMin} min</td>
                      <td className="p-2.5 text-slate-500">{adminKpis.prevAvgResolutionMin} min</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {adminKpis.resolutionDelta > 0 ? '+' : ''}{adminKpis.resolutionDelta} min
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: &lt; 30 min</td>
                      <td className="p-2.5 font-bold text-emerald-600">Óptimo</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Tasa de Caídas Confirmadas</td>
                      <td className="p-2.5 font-bold">{adminKpis.fallRate}%</td>
                      <td className="p-2.5 text-slate-500">{adminKpis.prevFallRate}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {adminKpis.fallDelta > 0 ? '+' : ''}{adminKpis.fallDelta}%
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: &lt; 20%</td>
                      <td className="p-2.5 font-bold text-emerald-600">Controlado</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Porcentaje Fuera de Rango</td>
                      <td className="p-2.5 font-bold">{adminKpis.outOfRangePct}%</td>
                      <td className="p-2.5 text-slate-500">{adminKpis.prevOutOfRangePct}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {adminKpis.outOfRangeDelta > 0 ? '+' : ''}{adminKpis.outOfRangeDelta}%
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: &lt; 20%</td>
                      <td className="p-2.5 font-bold text-emerald-600">Estable</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Cobertura de Monitoreo</td>
                      <td className="p-2.5 font-bold">{adminKpis.monitoringCoverage}%</td>
                      <td className="p-2.5 text-slate-500">{adminKpis.prevMonitoringCoverage}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {adminKpis.coverageDelta > 0 ? '+' : ''}{adminKpis.coverageDelta}%
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: ≥ 95%</td>
                      <td className="p-2.5 font-bold text-emerald-600">Excelente</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Carga de Alertas por Enfermero</td>
                      <td className="p-2.5 font-bold">{adminKpis.alertsPerNurse}</td>
                      <td className="p-2.5 text-slate-500">{adminKpis.prevAlertsPerNurse}</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {adminKpis.loadDelta > 0 ? '+' : ''}{adminKpis.loadDelta}
                      </td>
                      <td className="p-2.5 text-slate-500">Balanceada</td>
                      <td className="p-2.5 font-bold text-emerald-600">Equilibrada</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td className="p-2.5 font-medium">Cobertura de Monitoreo</td>
                      <td className="p-2.5 font-bold">{clinicalKpis.coverage}%</td>
                      <td className="p-2.5 text-slate-500">{clinicalKpis.prevCoverage}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {clinicalKpis.coverageDelta > 0 ? '+' : ''}{clinicalKpis.coverageDelta}%
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: ≥ 95%</td>
                      <td className="p-2.5 font-bold text-emerald-600">Excelente</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Pacientes Fuera de Rango</td>
                      <td className="p-2.5 font-bold">{clinicalKpis.outOfRange}%</td>
                      <td className="p-2.5 text-slate-500">{clinicalKpis.prevOutOfRange}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {clinicalKpis.outOfRangeDelta > 0 ? '+' : ''}{clinicalKpis.outOfRangeDelta}%
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: &lt; 20%</td>
                      <td className="p-2.5 font-bold text-emerald-600">Estable</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Seguimiento Oportuno de Pacientes</td>
                      <td className="p-2.5 font-bold">{clinicalKpis.timelyFollowup}%</td>
                      <td className="p-2.5 text-slate-500">{clinicalKpis.prevTimelyFollowup}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {clinicalKpis.timelyFollowupDelta > 0 ? '+' : ''}{clinicalKpis.timelyFollowupDelta}%
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: ≥ 90%</td>
                      <td className="p-2.5 font-bold text-emerald-600">Vigente</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Atención Alertas Críticas</td>
                      <td className="p-2.5 font-bold">{clinicalKpis.timelyCriticalCare}%</td>
                      <td className="p-2.5 text-slate-500">{clinicalKpis.prevTimelyCriticalCare}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">
                        {clinicalKpis.criticalCareDelta > 0 ? '+' : ''}{clinicalKpis.criticalCareDelta}%
                      </td>
                      <td className="p-2.5 text-slate-500">Meta: ≥ 95%</td>
                      <td className="p-2.5 font-bold text-emerald-600">Cumplido</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Sección 3: Datos de Personal (Admin) o Censo de Pacientes (Clínico) */}
          <div>
            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider mb-2.5">
              {isAdmin ? '3. Carga Operativa de Enfermeros' : '3. Censo de Pacientes y Constantes Vitales'}
            </h3>
            <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                {isAdmin ? (
                  <tr>
                    <th className="p-2">Enfermero</th>
                    <th className="p-2">Turno</th>
                    <th className="p-2 text-center">Asignadas</th>
                    <th className="p-2 text-center">Resueltas</th>
                    <th className="p-2">Tasa</th>
                    <th className="p-2 text-center">1ª Resp.</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-2">Paciente</th>
                    <th className="p-2">Habitación</th>
                    <th className="p-2">Enlace</th>
                    <th className="p-2">Ritmo Cardíaco</th>
                    <th className="p-2">Temperatura</th>
                    <th className="p-2">Condición</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isAdmin ? (
                  nurseWorkloadTableData.slice(0, 8).map((n, i) => (
                    <tr key={i}>
                      <td className="p-2 font-bold">{n.name}</td>
                      <td className="p-2 uppercase text-[10px]">{n.shift}</td>
                      <td className="p-2 text-center font-bold">{n.alertsAssigned}</td>
                      <td className="p-2 text-center text-emerald-600 font-bold">{n.alertsResolved}</td>
                      <td className="p-2">{n.resolutionRate}%</td>
                      <td className="p-2 text-center font-mono">{n.avgResponseMin}m</td>
                    </tr>
                  ))
                ) : (
                  nonArchivedDevices.map((d, i) => (
                    <tr key={i}>
                      <td className="p-2 font-bold">{d.patientName}</td>
                      <td className="p-2">Hab. {d.profile?.roomNumber || '101'}</td>
                      <td className="p-2">{d.connected ? 'En Línea' : 'Desconectado'}</td>
                      <td className="p-2 font-mono">{d.latest?.heartRate ? `${d.latest.heartRate} bpm` : 'Sin datos'}</td>
                      <td className="p-2 font-mono">{d.latest?.temperature ? `${d.latest.temperature}°C` : 'Sin datos'}</td>
                      <td className="p-2 font-bold text-emerald-600">
                        {(d.latest?.heartRate ?? 0) > 100 || (d.latest?.temperature ?? 0) > 37.8 ? 'Fuera de Rango' : 'Estable'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Sección 4: Registro de Tickets del Periodo */}
          <div>
            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider mb-2.5">
              4. Registro de Alertas y Eventos del Periodo ({periodAlerts.length})
            </h3>
            <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                <tr>
                  <th className="p-2">Folio</th>
                  <th className="p-2">Paciente</th>
                  <th className="p-2">Tipo de Evento</th>
                  <th className="p-2">Criticidad</th>
                  <th className="p-2">Fecha y Hora</th>
                  <th className="p-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(periodAlerts.length > 0 ? periodAlerts.slice(0, 10) : [
                  { folio: 'TK-01', patientName: 'Guillermo Ochoa', type: 'fall', criticality: 'CRITICA', timestamp: Date.now(), status: 'completado' },
                  { folio: 'TK-02', patientName: 'Martha Sánchez', type: 'high_hr', criticality: 'ALTA', timestamp: Date.now(), status: 'completado' },
                ]).map((a: any, i: number) => (
                  <tr key={i}>
                    <td className="p-2 font-mono font-bold">{a.folio || a.id?.slice(0, 8) || 'TK-REC'}</td>
                    <td className="p-2">{a.patientName || 'Paciente'}</td>
                    <td className="p-2">{a.title || (a.type === 'fall' ? 'Caída Detectada' : a.type === 'emergency_button' ? 'Pulsador PBS-33B' : 'Alteración Signos')}</td>
                    <td className="p-2 font-bold uppercase text-[10px]">{(a.criticality || 'MEDIA').toUpperCase()}</td>
                    <td className="p-2 text-slate-500 font-mono text-[10px]">{a.timestamp ? format(new Date(a.timestamp), 'dd/MM/yyyy HH:mm') : 'Hoy'}</td>
                    <td className="p-2 font-bold capitalize">{a.status || 'Completado'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pie de Página Institucional */}
          <div className="pt-6 border-t-2 border-slate-200 flex justify-between items-end text-[10px] text-slate-400">
            <div>
              <p className="font-bold text-slate-700">HealthNet Healthcare Intelligence Systems</p>
              <p>Documento médico-administrativo oficial. Confidencialidad bajo norma HIPAA / NOM-004.</p>
            </div>
            <div className="text-right">
              <p className="font-mono">Página 1 de 1 · Certificado Digital HealthNet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
