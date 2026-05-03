import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function usePrinters(params = {}) {
  return useQuery({
    queryKey: ['printers', params],
    queryFn: () => client.get('/api/printers', { params }).then(r => r.data),
  })
}

export function usePrinter(id) {
  return useQuery({
    queryKey: ['printers', id],
    queryFn: () => client.get(`/api/printers/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreatePrinter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => client.post('/api/printers', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['printers'] }),
  })
}

export function useUpdatePrinter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => client.put(`/api/printers/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['printers'] }),
  })
}

export function useDeletePrinter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/printers/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['printers'] }),
  })
}
