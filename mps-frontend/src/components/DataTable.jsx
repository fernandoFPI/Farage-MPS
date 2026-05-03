import { useTranslation } from 'react-i18next'
import EmptyState from './EmptyState'

const SKELETON_WIDTHS = ['72%', '55%', '80%']

function SkeletonRows({ columns }) {
  return (
    <tbody>
      {SKELETON_WIDTHS.map((w, i) => (
        <tr key={i}>
          {columns.map(col => (
            <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
              <div
                className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700"
                style={{ width: w }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export default function DataTable({ columns, data, loading, emptyMessage, error, onRetry }) {
  const { t } = useTranslation()

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
        <p className="text-sm text-red-600 dark:text-red-400">{error?.message || t('common.loadError')}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {t('common.retry')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${col.className ?? ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        {loading ? (
          <SkeletonRows columns={columns} />
        ) : !data?.length ? (
          <tbody>
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyMessage} />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.map((row, i) => (
              <tr key={row.id ?? i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${col.className ?? ''}`}
                  >
                    {col.render ? col.render(row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  )
}
