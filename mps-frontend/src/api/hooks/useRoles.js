import { useQuery } from '@tanstack/react-query'
import client from '../client'

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => client.get('/api/roles').then(r => r.data),
  })
}
