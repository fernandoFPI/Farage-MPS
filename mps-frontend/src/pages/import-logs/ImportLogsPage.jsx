import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useXsmLogs } from '../../api/hooks/useXsmImport'
import { usePrinterImportLogs } from '../../api/hooks/usePrinterImport'
import { useReadingImportLogs } from '../../api/hooks/useReadingImport'
import { useDocTitle } from '../../hooks/useDocTitle'
import PageHeader from '../../components/PageHeader'
import { fmtDate } from '../../utils/format'

function ExpandButton({ expanded, onClick }) {
  return (
    <button onClick={onClick} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  )
}

function LogsTable({ columns, rows, isLoading, expanded, toggle }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${col.className ?? ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {isLoading ? (
            ['72%', '55%', '80%'].map((w, i) => (
              <tr key={i}>
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                    <div className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" style={{ width: w }} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-gray-400">
                No data found
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <>
                <tr
                  key={row.id}
                  className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    (row.errors?.length ?? 0) > 0 ? 'bg-red-50/40 dark:bg-red-950/10' : ''
                  }`}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${col.className ?? ''}`}
                    >
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
                {expanded.has(row.id) && (row.errors?.length ?? 0) > 0 && (
                  <tr key={`${row.id}-errors`} className="bg-red-50/60 dark:bg-red-950/20">
                    <td colSpan={columns.length} className="px-6 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                        Errors
                      </p>
                      <ul className="space-y-1">
                        {row.errors.map((err, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                            <span className="mt-0.5 shrink-0">•</span>
                            <span>{typeof err === 'string' ? err : JSON.stringify(err)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function ImportLogsPage() {
  const { t } = useTranslation()
  useDocTitle(t('nav.importLogs'))

  const [tab, setTab] = useState('xsm')
  const [xsmExpanded, setXsmExpanded] = useState(new Set())
  const [printerExpanded, setPrinterExpanded] = useState(new Set())
  const [readingExpanded, setReadingExpanded] = useState(new Set())

  const { data: xsmLogs = [], isLoading: xsmLoading } = useXsmLogs()
  const { data: printerLogs = [], isLoading: printerLoading } = usePrinterImportLogs()
  const { data: readingLogs = [], isLoading: readingLoading } = useReadingImportLogs()

  function toggleXsm(id) {
    setXsmExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function togglePrinter(id) {
    setPrinterExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleReading(id) {
    setReadingExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const xsmColumns = [
    {
      key: 'expand', label: '', className: 'w-8',
      render: row => {
        if (!(row.errors?.length > 0)) return null
        return <ExpandButton expanded={xsmExpanded.has(row.id)} onClick={() => toggleXsm(row.id)} />
      },
    },
    {
      key: 'fileName', label: t('importLogs.fileName'),
      render: r => <span className="font-medium text-gray-900 dark:text-gray-100">{r.fileName ?? r.filename ?? '—'}</span>,
    },
    { key: 'createdAt', label: t('importLogs.importedAt'), render: r => fmtDate(r.createdAt ?? r.importedAt) },
    { key: 'totalRows',    label: t('importLogs.totalRows'),    className: 'hidden sm:table-cell text-center', render: r => r.totalRows ?? '—' },
    { key: 'matchedRows',  label: t('importLogs.matchedRows'),  className: 'hidden sm:table-cell text-center',
      render: r => <span className="text-green-600 dark:text-green-400">{r.matchedRows ?? '—'}</span> },
    { key: 'flaggedRows',  label: t('importLogs.flaggedRows'),  className: 'hidden md:table-cell text-center',
      render: r => r.flaggedRows > 0
        ? <span className="text-amber-600 dark:text-amber-400">{r.flaggedRows}</span>
        : <span className="text-gray-400">{r.flaggedRows ?? 0}</span> },
    { key: 'unmatchedRows', label: t('importLogs.unmatchedRows'), className: 'hidden md:table-cell text-center',
      render: r => r.unmatchedRows > 0
        ? <span className="text-red-600 dark:text-red-400">{r.unmatchedRows}</span>
        : <span className="text-gray-400">{r.unmatchedRows ?? 0}</span> },
    {
      key: 'errors', label: t('importLogs.errors'), className: 'text-center',
      render: r => {
        const count = r.errors?.length ?? 0
        if (count === 0) return <span className="text-xs text-gray-400">{t('importLogs.noErrors')}</span>
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {count}
          </span>
        )
      },
    },
  ]

  const printerColumns = [
    {
      key: 'expand', label: '', className: 'w-8',
      render: row => {
        if (!(row.errors?.length > 0)) return null
        return <ExpandButton expanded={printerExpanded.has(row.id)} onClick={() => togglePrinter(row.id)} />
      },
    },
    {
      key: 'filename', label: t('importLogs.fileName'),
      render: r => <span className="font-medium text-gray-900 dark:text-gray-100">{r.filename ?? '—'}</span>,
    },
    { key: 'importedAt', label: t('importLogs.importedAt'), render: r => fmtDate(r.importedAt) },
    { key: 'totalRows',   label: t('importLogs.totalRows'),   className: 'hidden sm:table-cell text-center', render: r => r.totalRows ?? '—' },
    { key: 'createdRows', label: t('printers.createdRows'),   className: 'hidden sm:table-cell text-center',
      render: r => <span className="text-green-600 dark:text-green-400">{r.createdRows ?? '—'}</span> },
    { key: 'skippedRows', label: t('printers.skippedRows'),   className: 'hidden md:table-cell text-center',
      render: r => <span className="text-gray-500 dark:text-gray-400">{r.skippedRows ?? 0}</span> },
    { key: 'failedRows',  label: t('printers.failedRows'),    className: 'hidden md:table-cell text-center',
      render: r => r.failedRows > 0
        ? <span className="text-red-600 dark:text-red-400">{r.failedRows}</span>
        : <span className="text-gray-400">{r.failedRows ?? 0}</span> },
    {
      key: 'importedByName', label: 'Imported By', className: 'hidden lg:table-cell',
      render: r => <span className="text-gray-600 dark:text-gray-400">{r.importedByName ?? '—'}</span>,
    },
    {
      key: 'errors', label: t('importLogs.errors'), className: 'text-center',
      render: r => {
        const count = r.errors?.length ?? 0
        if (count === 0) return <span className="text-xs text-gray-400">{t('importLogs.noErrors')}</span>
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {count}
          </span>
        )
      },
    },
  ]

  const readingColumns = [
    {
      key: 'expand', label: '', className: 'w-8',
      render: row => {
        if (!(row.errors?.length > 0)) return null
        return <ExpandButton expanded={readingExpanded.has(row.id)} onClick={() => toggleReading(row.id)} />
      },
    },
    {
      key: 'filename', label: t('importLogs.fileName'),
      render: r => <span className="font-medium text-gray-900 dark:text-gray-100">{r.filename ?? '—'}</span>,
    },
    { key: 'importedAt', label: t('importLogs.importedAt'), render: r => fmtDate(r.importedAt) },
    { key: 'totalRows',    label: t('importLogs.totalRows'),              className: 'hidden sm:table-cell text-center', render: r => r.totalRows ?? '—' },
    { key: 'createdRows',  label: t('meterReadings.createdRows'),         className: 'hidden sm:table-cell text-center',
      render: r => <span className="text-green-600 dark:text-green-400">{r.createdRows ?? '—'}</span> },
    { key: 'skippedRows',  label: t('meterReadings.skippedRows'),         className: 'hidden md:table-cell text-center',
      render: r => <span className="text-gray-500 dark:text-gray-400">{r.skippedRows ?? 0}</span> },
    { key: 'failedRows',   label: t('meterReadings.failedRows'),          className: 'hidden md:table-cell text-center',
      render: r => r.failedRows > 0
        ? <span className="text-red-600 dark:text-red-400">{r.failedRows}</span>
        : <span className="text-gray-400">{r.failedRows ?? 0}</span> },
    { key: 'cyclesCreated', label: t('meterReadings.cyclesCreated'),      className: 'hidden lg:table-cell text-center',
      render: r => <span className="text-blue-600 dark:text-blue-400">{r.cyclesCreated ?? 0}</span> },
    {
      key: 'importedByName', label: 'Imported By',                        className: 'hidden lg:table-cell',
      render: r => <span className="text-gray-600 dark:text-gray-400">{r.importedByName ?? '—'}</span>,
    },
    {
      key: 'errors', label: t('importLogs.errors'),                       className: 'text-center',
      render: r => {
        const count = r.errors?.length ?? 0
        if (count === 0) return <span className="text-xs text-gray-400">{t('importLogs.noErrors')}</span>
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {count}
          </span>
        )
      },
    },
  ]

  const readingRowsWithExpanded = readingLogs.map(row => ({
    ...row,
    _expandedContent: readingExpanded.has(row.id) && (row.errors?.length ?? 0) > 0 ? (
      <tr key={`${row.id}-errors`} className="bg-red-50/60 dark:bg-red-950/20">
        <td colSpan={readingColumns.length} className="px-6 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            {t('importLogs.errors')}
          </p>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="py-1 text-start text-gray-500 dark:text-gray-400 font-semibold w-10">{t('printers.row')}</th>
                <th className="py-1 text-start text-gray-500 dark:text-gray-400 font-semibold w-36">{t('printers.serialNumber')}</th>
                <th className="py-1 text-start text-gray-500 dark:text-gray-400 font-semibold w-28">{t('meterReadings.readAt')}</th>
                <th className="py-1 text-start text-gray-500 dark:text-gray-400 font-semibold">{t('xsmImport.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {row.errors.map((err, i) => (
                <tr key={i}>
                  <td className="py-0.5 text-gray-400 dark:text-gray-500">{typeof err === 'object' ? (err.row ?? '—') : '—'}</td>
                  <td className="py-0.5 font-mono text-gray-700 dark:text-gray-300">{typeof err === 'object' ? err.serialNumber : '—'}</td>
                  <td className="py-0.5 text-gray-500 dark:text-gray-400">{typeof err === 'object' ? err.readDate : '—'}</td>
                  <td className="py-0.5 text-red-700 dark:text-red-300">{typeof err === 'object' ? err.reason : err}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </td>
      </tr>
    ) : null,
  }))

  // Override expanded rows for printer logs to show a structured table
  const printerRowsWithExpandedErrors = printerLogs.map(row => ({
    ...row,
    _expandedContent: printerExpanded.has(row.id) && (row.errors?.length ?? 0) > 0 ? (
      <tr key={`${row.id}-errors`} className="bg-red-50/60 dark:bg-red-950/20">
        <td colSpan={printerColumns.length} className="px-6 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            {t('importLogs.errors')}
          </p>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="py-1 text-start text-gray-500 dark:text-gray-400 font-semibold w-12">{t('printers.row')}</th>
                <th className="py-1 text-start text-gray-500 dark:text-gray-400 font-semibold w-36">{t('printers.serialNumber')}</th>
                <th className="py-1 text-start text-gray-500 dark:text-gray-400 font-semibold w-24">{t('billingCycles.contract') ?? 'Contract'}</th>
                <th className="py-1 text-start text-gray-500 dark:text-gray-400 font-semibold">{t('xsmImport.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {row.errors.map((err, i) => (
                <tr key={i}>
                  <td className="py-0.5 text-gray-500 dark:text-gray-400">{typeof err === 'object' ? err.row : '—'}</td>
                  <td className="py-0.5 font-mono text-gray-700 dark:text-gray-300">{typeof err === 'object' ? err.serialNumber : '—'}</td>
                  <td className="py-0.5 text-gray-600 dark:text-gray-400">{typeof err === 'object' ? err.contractNumber : '—'}</td>
                  <td className="py-0.5 text-red-700 dark:text-red-300">{typeof err === 'object' ? err.reason : err}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </td>
      </tr>
    ) : null,
  }))

  return (
    <div className="space-y-4">
      <PageHeader title={t('importLogs.title')} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {[
          { key: 'xsm',     label: t('importLogs.xsmImportLogs') },
          { key: 'printer', label: t('importLogs.printerImportLogs') },
          { key: 'reading', label: t('importLogs.readingImportLogs') },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* XSM Tab */}
      {tab === 'xsm' && (
        <LogsTable
          columns={xsmColumns}
          rows={xsmLogs}
          isLoading={xsmLoading}
          expanded={xsmExpanded}
          toggle={toggleXsm}
        />
      )}

      {/* Reading Import Tab */}
      {tab === 'reading' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {readingColumns.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${col.className ?? ''}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {readingLoading ? (
                ['72%', '55%', '80%'].map((w, i) => (
                  <tr key={i}>
                    {readingColumns.map(col => (
                      <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                        <div className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : readingLogs.length === 0 ? (
                <tr>
                  <td colSpan={readingColumns.length} className="px-4 py-10 text-center text-sm text-gray-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                readingRowsWithExpanded.map(({ _expandedContent, ...row }) => (
                  <>
                    <tr
                      key={row.id}
                      className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                        (row.errors?.length ?? 0) > 0 ? 'bg-red-50/40 dark:bg-red-950/10' : ''
                      }`}
                    >
                      {readingColumns.map(col => (
                        <td
                          key={col.key}
                          className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${col.className ?? ''}`}
                        >
                          {col.render ? col.render(row) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                    {_expandedContent}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Printer Import Tab */}
      {tab === 'printer' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {printerColumns.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${col.className ?? ''}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {printerLoading ? (
                ['72%', '55%', '80%'].map((w, i) => (
                  <tr key={i}>
                    {printerColumns.map(col => (
                      <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                        <div className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : printerLogs.length === 0 ? (
                <tr>
                  <td colSpan={printerColumns.length} className="px-4 py-10 text-center text-sm text-gray-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                printerRowsWithExpandedErrors.map(({ _expandedContent, ...row }) => (
                  <>
                    <tr
                      key={row.id}
                      className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                        (row.errors?.length ?? 0) > 0 ? 'bg-red-50/40 dark:bg-red-950/10' : ''
                      }`}
                    >
                      {printerColumns.map(col => (
                        <td
                          key={col.key}
                          className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${col.className ?? ''}`}
                        >
                          {col.render ? col.render(row) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                    {_expandedContent}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
