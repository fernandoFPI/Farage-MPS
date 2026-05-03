import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function usePrinterImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData) =>
      client.post('/api/printers/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['printers'] })
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['printer-import-logs'] })
    },
  })
}

export function usePrinterImportLogs() {
  return useQuery({
    queryKey: ['printer-import-logs'],
    queryFn: () => client.get('/api/printers/import/logs').then(r => r.data),
  })
}

export function usePrinterImportLog(id) {
  return useQuery({
    queryKey: ['printer-import-logs', id],
    queryFn: () => client.get(`/api/printers/import/logs/${id}`).then(r => r.data),
    enabled: !!id,
  })
}
