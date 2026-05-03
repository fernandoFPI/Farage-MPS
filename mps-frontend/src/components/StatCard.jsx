const colorMap = {
  blue:   { bg: 'bg-blue-50   dark:bg-blue-900/20',   icon: 'text-blue-500   dark:text-blue-400' },
  green:  { bg: 'bg-green-50  dark:bg-green-900/20',  icon: 'text-green-500  dark:text-green-400' },
  amber:  { bg: 'bg-amber-50  dark:bg-amber-900/20',  icon: 'text-amber-500  dark:text-amber-400' },
  red:    { bg: 'bg-red-50    dark:bg-red-900/20',    icon: 'text-red-500    dark:text-red-400' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-500 dark:text-purple-400' },
  teal:   { bg: 'bg-teal-50   dark:bg-teal-900/20',   icon: 'text-teal-500   dark:text-teal-400' },
  gray:   { bg: 'bg-gray-100  dark:bg-gray-800',      icon: 'text-gray-500   dark:text-gray-400' },
}

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'blue' }) {
  const c = colorMap[color] ?? colorMap.blue
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div className={`inline-flex rounded-lg p-2 ${c.bg}`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
      </div>
      <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">{value ?? '—'}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
    </div>
  )
}
