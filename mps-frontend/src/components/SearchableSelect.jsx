import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X, Search } from 'lucide-react'

function HighlightedLabel({ label, search }) {
  if (!search) return <span>{label}</span>
  const idx = label.toLowerCase().indexOf(search.toLowerCase())
  if (idx === -1) return <span>{label}</span>
  return (
    <span>
      {label.slice(0, idx)}
      <mark className="bg-yellow-100 dark:bg-yellow-900 text-inherit rounded px-0.5">
        {label.slice(idx, idx + search.length)}
      </mark>
      {label.slice(idx + search.length)}
    </span>
  )
}

/**
 * Searchable combobox — replaces all filter dropdowns system-wide
 *
 * Props:
 * - options: [{ value, label }] or [{ value, label, group }] for grouped options
 * - value: currently selected value (use null for "nothing selected")
 * - onChange: (value) => void — passes null when cleared
 * - placeholder: shown when nothing selected
 * - searchPlaceholder: shown in search input
 * - clearable: show X to clear (default true)
 * - disabled: boolean
 * - className: applied to the outer container (use for width, e.g. "w-44")
 * - size: 'sm' | 'md' (default 'md')
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  clearable = true,
  disabled = false,
  className = '',
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dropdownPos, setDropdownPos] = useState({})
  const containerRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)

  const updatePos = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 300),
      })
    }
  }, [])

  useEffect(() => {
    const handler = (e) => {
      const inContainer = containerRef.current?.contains(e.target)
      const inDropdown = dropdownRef.current?.contains(e.target)
      if (!inContainer && !inDropdown) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      updatePos()
      window.addEventListener('scroll', updatePos, true)
      window.addEventListener('resize', updatePos)
      return () => {
        window.removeEventListener('scroll', updatePos, true)
        window.removeEventListener('resize', updatePos)
      }
    }
  }, [open, updatePos])

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    String(opt.value ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce((acc, opt) => {
    const group = opt.group || ''
    if (!acc[group]) acc[group] = []
    acc[group].push(opt)
    return acc
  }, {})

  const selectedOption = options.find(o => o.value === value)

  const handleSelect = (optValue) => {
    onChange(optValue)
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange(null)
    setSearch('')
  }

  const sizeClass = size === 'sm'
    ? 'text-xs px-2 py-1.5 min-h-[30px]'
    : 'text-sm px-3 py-2 min-h-[38px]'

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden"
    >
      {/* Search input */}
      <div className="p-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md">
          <Search size={13} className="text-gray-400 flex-shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
            onKeyDown={e => {
              if (e.key === 'Escape') { setOpen(false); setSearch('') }
              if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0].value)
            }}
          />
          {search && (
            <X
              size={12}
              className="text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"
              onClick={() => setSearch('')}
            />
          )}
        </div>
      </div>

      {/* Options list */}
      <div className="max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-400">
            No results found
          </div>
        ) : (
          Object.entries(grouped).map(([group, groupOptions]) => (
            <div key={group}>
              {group && (
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 truncate">
                  {group}
                </div>
              )}
              {groupOptions.map(opt => (
                <button
                  key={opt.value == null ? '__null__' : String(opt.value)}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-brand-50 dark:hover:bg-gray-700 transition-colors ${
                    opt.value === value
                      ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-medium'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  <span className="truncate min-w-0">
                    <HighlightedLabel label={opt.label} search={search} />
                  </span>
                  {opt.value === value && (
                    <span className="text-brand-500 flex-shrink-0 ms-2 ps-1">✓</span>
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            if (!open) updatePos()
            setOpen(o => !o)
          }
        }}
        className={`w-full flex items-center justify-between gap-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg ${sizeClass} text-left hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
      >
        <span className={`truncate ${selectedOption ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {clearable && selectedOption && (
            <span
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer p-0.5 rounded"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {dropdown}
    </div>
  )
}
