export const inputCls = [
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900',
  'placeholder-gray-400 transition',
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
  'disabled:bg-gray-50 disabled:text-gray-400',
  'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500',
  'dark:disabled:bg-gray-900',
].join(' ')

export default function FormField({ label, error, required, children }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="ms-1 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
