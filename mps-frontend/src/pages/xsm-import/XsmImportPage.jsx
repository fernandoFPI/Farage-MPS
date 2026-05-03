import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { useXsmImport, useXsmLogs } from '../../api/hooks/useXsmImport'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import ErrorAlert from '../../components/ErrorAlert'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { fmtDate, fmtDateTime } from '../../utils/format'

function StatRow({ label, value, colorCls, symbol }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${colorCls}`}>{value}</span>
        {symbol && <span className={`text-sm ${colorCls}`}>{symbol}</span>}
      </div>
    </div>
  )
}

export default function XsmImportPage() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const fileInputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [fileError, setFileError] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [result, setResult] = useState(null)
  const [importError, setImportError] = useState('')
  const [expandedIds, setExpandedIds] = useState(new Set())

  const importMutation = useXsmImport()
  const { data: logs = [], isLoading: logsLoading } = useXsmLogs()

  function handleFile(f) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setFileError(t('xsmImport.wrongFileType'))
      setFile(null)
      return
    }
    setFileError('')
    setFile(f)
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    setIsDragOver(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  function handleFileInput(e) {
    handleFile(e.target.files[0])
    e.target.value = ''
  }

  function clearFile() {
    setFile(null)
    setFileError('')
  }

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function fmt(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function handleImport() {
    if (!file || !periodStart || !periodEnd) return
    setImportError('')
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('periodStart', periodStart)
      formData.append('periodEnd', periodEnd)
      const data = await importMutation.mutateAsync(formData)
      setResult(data)
      showToast({
        title: t('xsmImport.importComplete'),
        description: `${data.matched ?? 0} / ${data.totalRows ?? 0} ${t('xsmImport.matchedRows').toLowerCase()}`,
        variant: 'success',
      })
    } catch (err) {
      setImportError(err.response?.data?.error || err.message)
    }
  }

  const canImport = file && periodStart && periodEnd && !importMutation.isPending

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('xsmImport.title')}
        subtitle={t('xsmImport.subtitle')}
      />

      {/* Upload form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !file && fileInputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
            isDragOver
              ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/10'
              : 'border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/50 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-brand-700',
            file ? 'cursor-default' : 'cursor-pointer',
          ].join(' ')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="sr-only"
            onChange={handleFileInput}
          />

          {file ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 flex-shrink-0 text-green-500" />
              <div className="text-start">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{fmt(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); clearFile() }}
                className="ms-2 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-gray-300 dark:text-gray-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('xsmImport.dropzone')}</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">.xlsx only</p>
              </div>
            </>
          )}
        </div>

        {fileError && <div className="mt-3"><ErrorAlert message={fileError} /></div>}

        {/* Period inputs */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('xsmImport.periodStart')} <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('xsmImport.periodEnd')} <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        {/* Import button */}
        <div className="mt-6">
          <button
            onClick={handleImport}
            disabled={!canImport}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {importMutation.isPending ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('xsmImport.importing')}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {t('xsmImport.importButton')}
              </>
            )}
          </button>
        </div>

        {importError && <div className="mt-4"><ErrorAlert message={importError} /></div>}
      </div>

      {/* Import result card */}
      {result && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">{t('xsmImport.importComplete')}</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <StatRow label={t('xsmImport.totalRows')} value={result.totalRows ?? 0} colorCls="text-gray-700 dark:text-gray-300" />
            <StatRow label={t('xsmImport.matchedRows')} value={result.matched ?? 0} colorCls="text-green-600 dark:text-green-400" symbol="✓" />
            <StatRow label={t('xsmImport.flaggedRows')} value={result.flagged ?? 0} colorCls="text-amber-600 dark:text-amber-400" symbol="⚠" />
            <StatRow label={t('xsmImport.unmatchedRows')} value={result.unmatched ?? 0} colorCls="text-red-600 dark:text-red-400" symbol="✗" />
            <StatRow label={t('xsmImport.skippedRows')} value={result.skipped ?? 0} colorCls="text-gray-500 dark:text-gray-500" symbol="—" />
          </div>

          {result.errors?.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Unmatched details:</p>
              <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-start text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('xsmImport.serialNumber')}</th>
                      <th className="px-4 py-2 text-start text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('xsmImport.reason')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {result.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">{e.serialNumber}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5">
            <button
              onClick={() => { setResult(null); setFile(null); setPeriodStart(''); setPeriodEnd('') }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('xsmImport.importAnother')}
            </button>
          </div>
        </div>
      )}

      {/* Past imports */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('xsmImport.pastImports')}</h2>
        </div>

        {logsLoading ? (
          <LoadingSpinner className="py-12" />
        ) : !logs.length ? (
          <EmptyState title={t('common.noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {['', t('common.createdAt'), 'File', 'Period', t('xsmImport.totalRows'), t('xsmImport.matchedRows'), t('xsmImport.flaggedRows'), t('xsmImport.unmatchedRows'), t('xsmImport.skippedRows')].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map(log => {
                  const expanded = expandedIds.has(log.id)
                  return [
                    <tr
                      key={log.id}
                      onClick={() => toggleExpand(log.id)}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {expanded
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDateTime(log.createdAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[160px] truncate">{log.fileName}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {fmtDate(log.periodStart)} → {fmtDate(log.periodEnd)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{log.totalRows ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 font-medium">{log.matched ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-amber-600 dark:text-amber-400 font-medium">{log.flagged ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 font-medium">{log.unmatched ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500">{log.skipped ?? 0}</td>
                    </tr>,
                    expanded && log.errors?.length > 0 ? (
                      <tr key={`${log.id}-errors`}>
                        <td colSpan={9} className="bg-gray-50 px-6 py-3 dark:bg-gray-800/40">
                          <table className="min-w-full divide-y divide-gray-200 rounded dark:divide-gray-700">
                            <thead>
                              <tr>
                                <th className="py-1.5 text-start text-xs font-semibold text-gray-500 dark:text-gray-400">{t('xsmImport.serialNumber')}</th>
                                <th className="py-1.5 ps-6 text-start text-xs font-semibold text-gray-500 dark:text-gray-400">{t('xsmImport.reason')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {log.errors.map((e, i) => (
                                <tr key={i}>
                                  <td className="py-1.5 text-xs font-mono text-gray-700 dark:text-gray-300">{e.serialNumber}</td>
                                  <td className="py-1.5 ps-6 text-xs text-gray-600 dark:text-gray-400">{e.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : expanded && (
                      <tr key={`${log.id}-no-errors`}>
                        <td colSpan={9} className="bg-gray-50 px-6 py-3 text-xs text-gray-400 dark:bg-gray-800/40 dark:text-gray-500">
                          No errors
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
