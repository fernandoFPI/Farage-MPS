import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { X, Upload, Download, CheckCircle, AlertCircle, Minus } from 'lucide-react'
import * as XLSX from 'xlsx'
import { usePrinterImport } from '../../api/hooks/usePrinterImport'

const HEADERS = [
  'Model', 'Type', 'Serial Number', 'City', 'Location',
  'Contract Number', 'Assigned From',
  'Fixed Charge Override', 'BW Price Override', 'Color Price Override',
  'Min BW Override', 'Min Color Override',
  '',
  'Latitude', 'Longitude', 'Service Type (MPS / FSMA)',
]

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Printers')
  XLSX.writeFile(wb, 'printer_import_template.xlsx')
}

function StatRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}

export default function PrinterImportModal({ onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const importMutation = usePrinterImport()
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
            {t('printers.importTitle')}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Download template */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t('printers.downloadTemplate')}
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-colors"
            >
              <Download className="h-4 w-4" />
              {t('printers.downloadTemplate')}
            </button>
          </div>

          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Result card */}
          {result ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('printers.importComplete')}</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                <StatRow label={t('xsmImport.totalRows')}    value={result.summary.totalRows}   color="text-gray-700 dark:text-gray-300" />
                <StatRow label={t('printers.createdRows')}   value={result.summary.createdRows} color="text-green-600 dark:text-green-400" />
                <StatRow label={t('printers.skippedRows')}   value={result.summary.skippedRows} color="text-gray-500 dark:text-gray-400" />
                <StatRow
                  label={t('printers.failedRows')}
                  value={result.summary.failedRows}
                  color={result.summary.failedRows > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}
                />
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
                          <th className="px-3 py-2 text-start text-red-600 dark:text-red-400 font-semibold">{t('printers.row')}</th>
                          <th className="px-3 py-2 text-start text-red-600 dark:text-red-400 font-semibold">{t('printers.serialNumber')}</th>
                          <th className="px-3 py-2 text-start text-red-600 dark:text-red-400 font-semibold">{t('xsmImport.reason')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50 dark:divide-red-950/20">
                        {result.errors.map((err, i) => (
                          <tr key={i} className="bg-white dark:bg-gray-900">
                            <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{err.row}</td>
                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 font-mono">{err.serialNumber}</td>
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
                  {t('printers.importAnother')}
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); navigate('/import-logs') }}
                  className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
                >
                  {t('printers.viewLogs')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t('xsmImport.dropzone').split(' ').slice(0, 2).join(' ')}
                </p>
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

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/30 dark:bg-red-950/20">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — only shown before result */}
        {!result && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={handleImport}
              disabled={!file || isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {isPending ? t('printers.importing') : t('xsmImport.importButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
