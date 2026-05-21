import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import SearchableSelect from '../../components/SearchableSelect'
import { useConsumableReadings } from '../../api/hooks/useConsumableReadings'
import { useCustomerStorage, useCustomerStorageHistory } from '../../api/hooks/useCustomerStorage'
import { useCustomers } from '../../api/hooks/useCustomers'
import { useBillingCycles } from '../../api/hooks/useBillingCycles'
import { CONSUMABLE_FIELD_MAP, COLOR_CONSUMABLES, BW_CONSUMABLES } from '../../utils/consumables'
import { fmtDate, fmtDateTime } from '../../utils/format'
import LoadingSpinner from '../../components/LoadingSpinner'

// ── Percentage color coding ───────────────────────────────────────────────────
function pctColor(val) {
  if (val == null) return 'text-gray-300 dark:text-gray-600'
  if (val <= 20)   return 'text-red-600 dark:text-red-400 font-semibold'
  if (val <= 40)   return 'text-amber-600 dark:text-amber-400 font-semibold'
  return 'text-green-600 dark:text-green-400'
}

function qtyColor(val) {
  if (val == null || val === 0) return 'text-red-600 dark:text-red-400 font-semibold'
  if (val <= 2)                 return 'text-amber-600 dark:text-amber-400 font-semibold'
  return 'text-green-600 dark:text-green-400'
}

// ── Consumable cell ───────────────────────────────────────────────────────────
function PctCell({ value }) {
  if (value == null) return <span className="text-gray-300 dark:text-gray-600">—</span>
  return <span className={pctColor(value)}>{value}%</span>
}

function QtyCell({ value, isBwOnly, show }) {
  if (!show) return <span className="text-gray-300 dark:text-gray-600">—</span>
  return <span className={qtyColor(value)}>{value ?? 0}</span>
}

// ── Storage history row (lazy loaded) ────────────────────────────────────────
function StorageHistoryPanel({ customerId, printerModel, isBwOnly, t }) {
  const { data: history = [], isLoading } = useCustomerStorageHistory(customerId, printerModel)
  const cols = isBwOnly ? BW_CONSUMABLES : COLOR_CONSUMABLES

  if (isLoading) return <div className="py-3 px-4 text-xs text-gray-400">{t('common.loading')}</div>
  if (history.length === 0) return <div className="py-3 px-4 text-xs text-gray-400">{t('common.noData')}</div>

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 dark:bg-gray-800/50">
          <tr>
            <th className="px-3 py-2 text-start text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">{t('common.createdAt')}</th>
            <th className="px-3 py-2 text-start text-gray-500 dark:text-gray-400 font-semibold">{t('billingCycles.period')}</th>
            {cols.map(c => (
              <th key={c} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">{c === 'wasteToner' ? 'WT' : c}</th>
            ))}
            <th className="px-3 py-2 text-start text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">{t('performance.engineer')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {history.map(h => (
            <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(h.snapshotAt)}</td>
              <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{h.cycleName ?? '—'}</td>
              {cols.map(c => {
                const { qtyKey } = CONSUMABLE_FIELD_MAP[c]
                const val = h[qtyKey]
                return (
                  <td key={c} className="px-2 py-1.5 text-center">
                    <QtyCell value={val} show isBwOnly={isBwOnly} />
                  </td>
                )
              })}
              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{h.submittedByName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Customer storage card ─────────────────────────────────────────────────────
function CustomerStorageCard({ customer, t }) {
  const { data: storage = [], isLoading } = useCustomerStorage(customer.id)
  const [expanded, setExpanded] = useState(false)
  const [expandedModel, setExpandedModel] = useState(null)

  if (isLoading) return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <LoadingSpinner />
    </div>
  )

  if (storage.length === 0) return null

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-start"
      >
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{customer.name}</span>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-gray-400" />
          : <ChevronRight className="h-4 w-4 text-gray-400" />
        }
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {storage.map(s => {
            const cols = s.isBwOnly ? BW_CONSUMABLES : COLOR_CONSUMABLES
            const isModelExpanded = expandedModel === s.printerModel

            return (
              <div key={s.printerModel}>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.printerModel}</span>
                    {s.updatedAt && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {t('consumables.lastUpdated')}: {fmtDate(s.updatedAt)}
                        {s.updatedByName && ` · ${s.updatedByName}`}
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr>
                          {cols.map(c => (
                            <th key={c} className="px-2 py-1 text-center text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">{c === 'wasteToner' ? 'WT' : c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {cols.map(c => {
                            const { qtyKey } = CONSUMABLE_FIELD_MAP[c]
                            return (
                              <td key={c} className="px-2 py-1 text-center">
                                <QtyCell value={s[qtyKey]} show isBwOnly={s.isBwOnly} />
                              </td>
                            )
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpandedModel(isModelExpanded ? null : s.printerModel)}
                    className="mt-2 flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    {isModelExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {t('consumables.viewHistory')}
                  </button>
                </div>

                {isModelExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                    <StorageHistoryPanel
                      customerId={customer.id}
                      printerModel={s.printerModel}
                      isBwOnly={s.isBwOnly}
                      t={t}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab 1: Printer Consumable Levels ─────────────────────────────────────────
function PrinterLevelsTab({ customers, cycles, t }) {
  const [filterCustomer, setFilterCustomer] = useState(null)
  const [filterCycle, setFilterCycle]       = useState(null)
  const [expanded, setExpanded] = useState({})

  const { data: allReadings = [], isLoading } = useConsumableReadings({
    ...(filterCustomer != null && { customerId: filterCustomer }),
    ...(filterCycle != null && { billingCycleId: filterCycle }),
  })

  // Group by customer → cycle
  const grouped = useMemo(() => {
    const g = {}
    for (const r of allReadings) {
      const cust = r.customerName ?? '—'
      const cycle = r.cycleName ?? '—'
      if (!g[cust]) g[cust] = {}
      if (!g[cust][cycle]) g[cust][cycle] = []
      g[cust][cycle].push(r)
    }
    return g
  }, [allReadings])

  const COLOR_COLS = COLOR_CONSUMABLES
  const BW_COLS    = BW_CONSUMABLES

  function toggleExpand(key) {
    setExpanded(e => ({ ...e, [key]: !e[key] }))
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <SearchableSelect
          className="w-44"
          value={filterCustomer}
          onChange={setFilterCustomer}
          options={[
            { value: null, label: t('common.allCustomers') },
            ...customers.map(c => ({ value: c.id, label: c.name })),
          ]}
        />
        <SearchableSelect
          className="w-56"
          value={filterCycle}
          onChange={setFilterCycle}
          options={[
            { value: null, label: t('common.allCycles') },
            ...cycles.map(c => ({ value: c.id, label: c.cycleName ?? c.contractNumber })),
          ]}
        />
      </div>

      {isLoading && <LoadingSpinner />}

      {!isLoading && Object.keys(grouped).length === 0 && (
        <p className="text-center py-12 text-sm text-gray-400">{t('common.noData')}</p>
      )}

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([custName, cycleGroups]) => (
        <div key={custName} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleExpand(custName)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-start"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{custName}</span>
            {expanded[custName]
              ? <ChevronDown className="h-4 w-4 text-gray-400" />
              : <ChevronRight className="h-4 w-4 text-gray-400" />
            }
          </button>

          {expanded[custName] && (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {Object.entries(cycleGroups).map(([cycleName, readings]) => {
                const cycleKey = `${custName}::${cycleName}`
                return (
                  <div key={cycleName}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(cycleKey)}
                      className="w-full flex items-center justify-between px-6 py-2.5 bg-gray-50/50 dark:bg-gray-800/30 text-start"
                    >
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{cycleName}</span>
                      {expanded[cycleKey]
                        ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      }
                    </button>

                    {expanded[cycleKey] && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-800/50">
                            <tr>
                              <th className="px-3 py-2 text-start text-gray-500 dark:text-gray-400 font-semibold">{t('printers.serialNumber')}</th>
                              <th className="px-3 py-2 text-start text-gray-500 dark:text-gray-400 font-semibold">{t('printers.model')}</th>
                              {COLOR_COLS.map(c => (
                                <th key={c} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">{c === 'wasteToner' ? 'WT' : c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {readings.map(r => (
                              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                                <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{r.printerSerial}</td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{r.printerModel}</td>
                                {COLOR_COLS.map(c => {
                                  const { pctKey } = CONSUMABLE_FIELD_MAP[c]
                                  const isNA = r.isBwOnly && !BW_COLS.includes(c)
                                  return (
                                    <td key={c} className="px-2 py-1.5 text-center">
                                      {isNA ? <span className="text-gray-200 dark:text-gray-700">—</span> : <PctCell value={r[pctKey]} />}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Tab 2: Customer Storage ───────────────────────────────────────────────────
function CustomerStorageTab({ customers, filterCustomer, setFilterCustomer, t }) {
  const filteredCustomers = filterCustomer != null
    ? customers.filter(c => c.id === filterCustomer)
    : customers

  return (
    <div className="space-y-4">
      <div>
        <SearchableSelect
          className="w-44"
          value={filterCustomer}
          onChange={setFilterCustomer}
          options={[
            { value: null, label: t('common.allCustomers') },
            ...customers.map(c => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>

      {filteredCustomers.length === 0 && (
        <p className="text-center py-12 text-sm text-gray-400">{t('common.noData')}</p>
      )}

      {filteredCustomers.map(customer => (
        <CustomerStorageCard key={customer.id} customer={customer} t={t} />
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ConsumablesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab]           = useState('levels')
  const [storageCustomer, setStorageCustomer] = useState(null)

  const { data: customers = [] } = useCustomers()
  const { data: cycles = [] }    = useBillingCycles()

  const tabs = [
    { key: 'levels',  label: t('consumables.printerLevels') },
    { key: 'storage', label: t('consumables.customerStorage') },
  ]

  return (
    <div className="max-w-5xl mx-auto pb-8">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('consumables.title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-1 mb-6 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'levels' && (
        <PrinterLevelsTab customers={customers} cycles={cycles} t={t} />
      )}
      {activeTab === 'storage' && (
        <CustomerStorageTab
          customers={customers}
          filterCustomer={storageCustomer}
          setFilterCustomer={setStorageCustomer}
          t={t}
        />
      )}
    </div>
  )
}
