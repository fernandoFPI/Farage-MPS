import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useReadingImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData) =>
      client.post('/api/meter-readings/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meter-readings'] })
      qc.invalidateQueries({ queryKey: ['billing-cycles'] })
      qc.invalidateQueries({ queryKey: ['reading-import-logs'] })
    },
  })
}

export function useReadingImportLogs() {
  return useQuery({
    queryKey: ['reading-import-logs'],
    queryFn: () => client.get('/api/meter-readings/import/logs').then(r => r.data),
  })
}

export function useReadingImportLog(id) {
  return useQuery({
    queryKey: ['reading-import-logs', id],
    queryFn: () => client.get(`/api/meter-readings/import/logs/${id}`).then(r => r.data),
    enabled: !!id,
  })
}
