import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function EmptyState({ title, description, action }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600" />
      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-gray-100">{title ?? t('common.noData')}</h3>
      {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
