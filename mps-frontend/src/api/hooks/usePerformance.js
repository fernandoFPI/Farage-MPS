import { useQuery } from '@tanstack/react-query'
import client from '../client'

export function useEngineersPerformance() {
  return useQuery({
    queryKey: ['performance', 'engineers'],
    queryFn: () => client.get('/api/performance/engineers').then(r => r.data),
  })
}

export function useEngineerPerformance(id, params = {}) {
  return useQuery({
    queryKey: ['performance', 'engineers', id, params],
    queryFn: () => client.get(`/api/performance/engineers/${id}`, { params }).then(r => r.data),
    enabled: !!id,
  })
}
