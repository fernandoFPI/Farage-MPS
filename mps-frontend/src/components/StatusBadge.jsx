const statusColors = {
  active:               'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  true:                 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  open:                 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  confirmed:            'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  per_click:            'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  odoo:                 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  osg:                  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
  pending_confirmation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  minimum_volume:       'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  psg:                  'bg-violet-100 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400',
  xsm:                  'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  disputed:             'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  pending_quarterly:    'bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400',
  invoiced:             'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  inactive:             'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  false:                'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  manual:               'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const fallback = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'

export default function StatusBadge({ status }) {
  const key = String(status).toLowerCase()
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[key] ?? fallback}`}>
      {status}
    </span>
  )
}
