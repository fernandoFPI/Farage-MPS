import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import RouterConfig from './router'
import './i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default (3 retries w/ backoff) turns a single rate-limit or server
      // error into a burst of extra requests right when the backend is
      // already struggling. Never retry 4xx (client errors, incl. 429) —
      // only transient/server-side failures are worth one retry.
      retry: (failureCount, error) => {
        const status = error?.response?.status
        if (status && status >= 400 && status < 500) return false
        return failureCount < 1
      },
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterConfig />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
