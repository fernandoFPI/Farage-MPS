import { useQuery } from '@tanstack/react-query'
import client from '../client'

export function useOdooSyncLog() {
  return useQuery({
    queryKey: ['odoo-sync-log'],
    queryFn: () => client.get('/api/odoo/sync-log').then(r => r.data),
    staleTime: 60 * 1000,
  })
}
