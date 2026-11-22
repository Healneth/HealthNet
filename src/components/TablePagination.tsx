import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

export interface TablePaginationProps {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (newPageSize: number) => void
  pageSizeOptions?: number[]
  itemName?: string
}

export default function TablePagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 30, 50, 100],
  itemName = 'registros',
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)

  const startRecord = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endRecord = Math.min(totalItems, safePage * pageSize)

  const canGoPrevious = safePage > 1
  const canGoNext = safePage < totalPages

  const handlePrev = () => {
    if (canGoPrevious) {
      onPageChange(safePage - 1)
    }
  }

  const handleNext = () => {
    if (canGoNext) {
      onPageChange(safePage + 1)
    }
  }

  // Generar lista de números de página visibles
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (safePage > 3) pages.push('ellipsis-prev')
      const start = Math.max(2, safePage - 1)
      const end = Math.min(totalPages - 1, safePage + 1)
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i)
      }
      if (safePage < totalPages - 2) pages.push('ellipsis-next')
      if (!pages.includes(totalPages)) pages.push(totalPages)
    }
    return pages
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
      {/* 1. Rango de Registros y Total */}
      <div className="flex items-center gap-2">
        <span className="text-slate-500 dark:text-slate-400">
          Mostrando{' '}
          <strong className="text-slate-800 dark:text-slate-200 font-extrabold">
            {startRecord}
          </strong>{' '}
          -{' '}
          <strong className="text-slate-800 dark:text-slate-200 font-extrabold">
            {endRecord}
          </strong>{' '}
          de{' '}
          <strong className="text-slate-800 dark:text-slate-200 font-extrabold">
            {totalItems}
          </strong>{' '}
          {itemName}
        </span>
      </div>

      {/* 2. Selector de Registros por Página (10, 30, 50, 100) */}
      <div className="flex items-center gap-2">
        <label htmlFor="records-per-page-select" className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Mostrar:
        </label>
        <select
          id="records-per-page-select"
          aria-label="Registros por página"
          value={pageSize}
          onChange={e => {
            const newSize = Number(e.target.value)
            onPageSizeChange(newSize)
          }}
          className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-hn-800/30 cursor-pointer transition-colors"
        >
          {pageSizeOptions.map(option => (
            <option key={option} value={option}>
              {option} por página
            </option>
          ))}
        </select>
      </div>

      {/* 3. Controles de Navegación: ← Anterior | 1 de 10 | Siguiente → */}
      <div className="flex items-center gap-1.5">
        {/* Botón Primera Página (para muchas páginas) */}
        {totalPages > 5 && (
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
            className={`p-1.5 rounded-lg border transition-all ${
              canGoPrevious
                ? 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer active:scale-95'
                : 'border-slate-100 dark:border-slate-800/60 text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50'
            }`}
            title="Primera página"
            aria-label="Primera página"
          >
            <ChevronsLeft size={15} />
          </button>
        )}

        {/* Botón Anterior */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canGoPrevious}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
            canGoPrevious
              ? 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer active:scale-95'
              : 'border-slate-100 dark:border-slate-800/60 text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50'
          }`}
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} />
          <span>Anterior</span>
        </button>

        {/* Indicador de Páginas Numérico / Texto */}
        <div className="hidden md:flex items-center gap-1 px-1">
          {getPageNumbers().map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <span key={`${p}-${idx}`} className="px-1 text-slate-400 select-none">
                  •••
                </span>
              )
            }
            const isActive = p === safePage
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-hn-800 text-white dark:bg-hn-500 dark:text-slate-950 shadow-sm scale-105'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
                }`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`Página ${p}`}
              >
                {p}
              </button>
            )
          })}
        </div>

        {/* En Móvil: Texto "1 de 10" */}
        <div className="md:hidden px-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <span>{safePage} de {totalPages}</span>
        </div>

        {/* Botón Siguiente */}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
            canGoNext
              ? 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer active:scale-95'
              : 'border-slate-100 dark:border-slate-800/60 text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50'
          }`}
          aria-label="Página siguiente"
        >
          <span>Siguiente</span>
          <ChevronRight size={14} />
        </button>

        {/* Botón Última Página */}
        {totalPages > 5 && (
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
            className={`p-1.5 rounded-lg border transition-all ${
              canGoNext
                ? 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer active:scale-95'
                : 'border-slate-100 dark:border-slate-800/60 text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50'
            }`}
            title="Última página"
            aria-label="Última página"
          >
            <ChevronsRight size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
