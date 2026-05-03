import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import RouterConfig from './router'
import './i18n'

const queryClient = new QueryClient()

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
