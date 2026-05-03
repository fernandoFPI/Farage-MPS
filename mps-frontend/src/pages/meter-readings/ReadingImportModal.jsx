import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { X, Upload, CheckCircle, AlertCircle, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useReadingImport } from '../../api/hooks/useReadingImport'

function downloadReadingTemplate() {
  const headers = ['Serial Number', 'Read Date', 'A4 Black', 'A3 Black', 'A4 Color', 'A3 Color', 'XLS']
  const exampleRows = [
    ['3741562277', '2026-02-28', 2064, 1, 5405, 17, 0],
    ['3741562277', '2026-03-28', 2232, 1, 5691, 17, 0],
    ['3749561008', '2026-02-28', 38651, 0, 0, 0, 0],
    ['3749561008', '2026-03-28', 40265, 0, 0, 0, 0],
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows])

  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })]
    if (cell) cell.s = { font: { bold: true } }
  }

  ws['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Readings')
  XLSX.writeFile(wb, 'meter_reading_import_template.xlsx')
}

function StatRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}

export default function ReadingImportModal({ onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const importMutation = useReadingImport()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function handleFile(f) {
    if (!f) return
    if (!f.name.endsWith('.xlsx')) {
      setError(t('xsmImport.wrongFileType'))
      return
    }
    setError('')
    setFile(f)
    setResult(null)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  async function handleImport() {
    if (!file) return
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await importMutation.mutateAsync(fd)
      setResult(res)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError('')
  }

  const isPending = importMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-900 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('meterReadings.importTitle')}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {result ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('meterReadings.importComplete')}</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                <StatRow label={t('meterReadings.totalRows')}    value={result.summary.totalRows}    color="text-gray-700 dark:text-gray-300" />
                <StatRow label={t('meterReadings.createdRows')}  value={result.summary.createdRows}  color="text-green-600 dark:text-green-400" />
                <StatRow label={t('meterReadings.skippedRows')}  value={result.summary.skippedRows}  color="text-gray-500 dark:text-gray-400" />
                <StatRow
                  label={t('meterReadings.failedRows')}
                  value={result.summary.failedRows}
                  color={result.summary.failedRows > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}
                />
                <StatRow label={t('meterReadings.cyclesCreated')} value={result.summary.cyclesCreated} color="text-blue-600 dark:text-blue-400" />
                <StatRow label={t('meterReadings.cyclesMatched')} value={result.summary.cyclesMatched} color="text-gray-500 dark:text-gray-400" />
              </div>

              {result.errors?.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t('importLogs.errors')}
                  </p>
                  <div className="rounded-lg border border-red-100 dark:border-red-900/30 overflow-hidden">
                    <table className="min-w-full text-xs">
                      <thead className="bg-red-50 dark:bg-red-950/20">
                        <tr>
                          <th className="px-3 py-2 text-start text-red-600 dark:text-red-400 font-semibold w-10">{t('printers.row')}</th>
                          <th className="px-3 py-2 text-start text-red-600 dark:text-red-400 font-semibold">{t('printers.serialNumber')}</th>
                          <th className="px-3 py-2 text-start text-red-600 dark:text-red-400 font-semibold">{t('meterReadings.readAt')}</th>
                          <th className="px-3 py-2 text-start text-red-600 dark:text-red-400 font-semibold">{t('xsmImport.reason')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50 dark:divide-red-950/20">
                        {result.errors.map((err, i) => (
                          <tr key={i} className="bg-white dark:bg-gray-900">
                            <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500">{err.row ?? '—'}</td>
                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 font-mono">{err.serialNumber ?? '—'}</td>
                            <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{err.readDate ?? '—'}</td>
                            <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{err.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                >
                  {t('meterReadings.importAnother')}
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); navigate('/import-logs') }}
                  className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
                >
                  {t('meterReadings.viewLogs')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Description */}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('meterReadings.importNote')}
              </p>

              {/* Download template */}
              <button
                type="button"
                onClick={downloadReadingTemplate}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-colors"
              >
                <Download className="h-4 w-4" />
                {t('meterReadings.downloadTemplate')}
              </button>

              <hr className="border-gray-100 dark:border-gray-800" />

              {/* Drop zone */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }}
                />
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                    dragOver
                      ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/10'
                      : 'border-gray-300 hover:border-brand-400 dark:border-gray-600 dark:hover:border-brand-500'
                  }`}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{file.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('xsmImport.dropzone')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Helper notes */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50 px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('meterReadings.importNotes')}
                </p>
                {['importNote1','importNote2','importNote3','importNote4','importNote5'].map(key => (
                  <p key={key} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                    <span className="mt-px text-gray-300 dark:text-gray-600 shrink-0">•</span>
                    {t(`meterReadings.${key}`)}
                  </p>
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/30 dark:bg-red-950/20">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={handleImport}
              disabled={!file || isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {isPending ? t('meterReadings.importing') : t('xsmImport.importButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
