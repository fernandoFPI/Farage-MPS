import { useState, useEffect } from 'react'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import SearchableSelect from '../../components/SearchableSelect'
import { useContracts } from '../../api/hooks/useContracts'
import { useTransferPrinters } from '../../api/hooks/useAssignments'

export default function TransferPrintersModal({ open, onClose, contract }) {
  const printers = contract?.printers ?? []
  const today = new Date().toISOString().slice(0, 10)

  const [selected, setSelected]     = useState(new Set())
  const [toContractId, setTo]       = useState('')
  const [transferDate, setDate]     = useState(today)
  const [error, setError]           = useState('')

  const { data: contracts = [] } = useContracts(
    contract?.customerId ? { customerId: contract.customerId } : {},
  )
  const transfer = useTransferPrinters()

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setSelected(new Set(printers.map(p => p.id)))
      setTo('')
      setDate(today)
      setError('')
    }
  }, [open])

  // Exclude the current contract from the target list
  const targetOptions = contracts
    .filter(c => c.id !== contract?.id)
    .map(c => ({ value: c.id, label: `${c.contractNumber}${c.isActive ? '' : ' (inactive)'}` }))

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === printers.length) setSelected(new Set())
    else setSelected(new Set(printers.map(p => p.id)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (selected.size === 0) return setError('Select at least one printer to transfer.')
    if (!toContractId)       return setError('Select a target contract.')
    if (!transferDate)       return setError('Transfer date is required.')
    setError('')
    try {
      const result = await transfer.mutateAsync({
        toContractId,
        assignmentIds: [...selected],
        transferDate,
      })
      onClose()
      // Brief success — React Query invalidation will refresh the page
      window.alert(`${result.transferred} printer(s) transferred successfully.`)
    } catch (err) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Transfer failed')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Transfer Printers to Another Contract">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorAlert message={error} />}

        {/* Printer checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Printers to transfer
            </label>
            <button type="button" onClick={toggleAll}
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
              {selected.size === printers.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-56 overflow-y-auto">
            {printers.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No printers assigned to this contract.</p>
            ) : printers.map(cp => (
              <label key={cp.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <input
                  type="checkbox"
                  checked={selected.has(cp.id)}
                  onChange={() => toggle(cp.id)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {cp.printer?.serialNumber}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {cp.printer?.model}{cp.printer?.city ? ` · ${cp.printer.city}` : ''}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Target contract */}
        <FormField label="Transfer to contract" required>
          <SearchableSelect
            value={toContractId}
            onChange={setTo}
            options={targetOptions}
            placeholder="Search contracts…"
          />
        </FormField>

        {/* Transfer date */}
        <FormField label="Transfer date (new assignment starts on this date)" required>
          <input
            type="date"
            value={transferDate}
            onChange={e => setDate(e.target.value)}
            className={inputCls}
            required
          />
        </FormField>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          Each selected assignment on <strong>{contract?.contractNumber}</strong> will be closed the day before the transfer date.
          New assignments will be created on the target contract starting on the transfer date, copying the same pricing overrides.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-300">
            Cancel
          </button>
          <button type="submit" disabled={transfer.isPending || selected.size === 0}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {transfer.isPending ? 'Transferring…' : `Transfer ${selected.size} printer${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
