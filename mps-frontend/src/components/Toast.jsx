import { createContext, useContext, useState, useCallback } from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react'

const ToastContext = createContext(null)

const variants = {
  success: {
    container: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/60',
    icon: CheckCircle,
    iconCls: 'text-green-600 dark:text-green-400',
    titleCls: 'text-green-900 dark:text-green-100',
    descCls: 'text-green-700 dark:text-green-300',
  },
  warning: {
    container: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60',
    icon: AlertTriangle,
    iconCls: 'text-amber-600 dark:text-amber-400',
    titleCls: 'text-amber-900 dark:text-amber-100',
    descCls: 'text-amber-700 dark:text-amber-300',
  },
  error: {
    container: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/60',
    icon: AlertCircle,
    iconCls: 'text-red-600 dark:text-red-400',
    titleCls: 'text-red-900 dark:text-red-100',
    descCls: 'text-red-700 dark:text-red-300',
  },
  info: {
    container: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60',
    icon: Info,
    iconCls: 'text-blue-600 dark:text-blue-400',
    titleCls: 'text-blue-900 dark:text-blue-100',
    descCls: 'text-blue-700 dark:text-blue-300',
  },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback(({ title, description, variant = 'info', duration = 5000 }) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, title, description, variant, duration }])
  }, [])

  function dismiss(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map(toast => {
          const v = variants[toast.variant] ?? variants.info
          const Icon = v.icon
          return (
            <ToastPrimitive.Root
              key={toast.id}
              duration={toast.duration}
              onOpenChange={(open) => { if (!open) dismiss(toast.id) }}
              className={[
                'flex items-start gap-3 rounded-xl border p-4 shadow-lg',
                'data-[state=open]:animate-in data-[state=open]:slide-in-from-end-full',
                'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-end-full',
                v.container,
              ].join(' ')}
            >
              <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${v.iconCls}`} />
              <div className="flex-1 min-w-0">
                <ToastPrimitive.Title className={`text-sm font-semibold ${v.titleCls}`}>
                  {toast.title}
                </ToastPrimitive.Title>
                {toast.description && (
                  <ToastPrimitive.Description className={`mt-0.5 text-xs leading-relaxed ${v.descCls}`}>
                    {toast.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                onClick={() => dismiss(toast.id)}
                className={`flex-shrink-0 rounded p-1 transition-opacity hover:opacity-70 ${v.iconCls}`}
              >
                <X className="h-3.5 w-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}
        <ToastPrimitive.Viewport className="fixed bottom-4 end-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
