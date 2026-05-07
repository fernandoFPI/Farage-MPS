import { useQuery } from '@tanstack/react-query'
import client from '../client'

export function useAnalytics(params = {}) {
  return useQuery({
    queryKey: ['analytics', params],
    queryFn: () => client.get('/api/analytics', { params }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
}
