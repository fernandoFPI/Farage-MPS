import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useXsmImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData) =>
      client.post('/api/xsm/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meter-readings'] })
      qc.invalidateQueries({ queryKey: ['billing-cycles'] })
      qc.invalidateQueries({ queryKey: ['xsm-logs'] })
    },
  })
}

export function useXsmLogs(params = {}) {
  return useQuery({
    queryKey: ['xsm-logs', params],
    queryFn: () => client.get('/api/xsm/logs', { params }).then(r => r.data),
  })
}

export function useXsmLog(id) {
  return useQuery({
    queryKey: ['xsm-logs', id],
    queryFn: () => client.get(`/api/xsm/logs/${id}`).then(r => r.data),
    enabled: !!id,
  })
}
