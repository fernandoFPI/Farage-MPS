import { useTranslation } from 'react-i18next'
import Modal from './Modal'

export default function ConfirmDialog({
  open, onClose, onConfirm, title, description, loading,
  confirmLabel, confirmClassName,
}) {
  const { t } = useTranslation()
  const btnCls = confirmClassName ?? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} disabled={loading} className={btnCls}>
            {loading ? t('common.loading') : (confirmLabel ?? t('common.confirm'))}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{description}</p>
    </Modal>
  )
}
