import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useMeterReadings(params = {}) {
  return useQuery({
    queryKey: ['meter-readings', params],
    queryFn: () => client.get('/api/meter-readings', { params }).then(r => r.data),
  })
}

export function useMeterReading(id) {
  return useQuery({
    queryKey: ['meter-readings', id],
    queryFn: () => client.get(`/api/meter-readings/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useSubmitReading() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => client.post('/api/meter-readings', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meter-readings'] }),
  })
}

export function useUpdateReading() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => client.put(`/api/meter-readings/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meter-readings'] }),
  })
}

export function useDeleteReading() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/meter-readings/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meter-readings'] }),
  })
}

export function useReadingPhotos(id) {
  return useQuery({
    queryKey: ['meter-readings', id, 'photos'],
    queryFn: () => client.get(`/api/meter-readings/${id}/photos`).then(r => r.data),
    enabled: !!id,
  })
}

export function useBulkDeleteReadings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, confirmDelete }) =>
      client.delete('/api/meter-readings/bulk', { data: { ids, confirmDelete } }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meter-readings'] })
      qc.invalidateQueries({ queryKey: ['billing-cycles'] })
    },
  })
}

export function usePreviousReading(printerId, beforeDate) {
  return useQuery({
    queryKey: ['meter-readings', 'previous', printerId, beforeDate],
    queryFn: () => client.get('/api/meter-readings/previous', { params: { printerId, beforeDate } }).then(r => r.data),
    enabled: !!printerId && !!beforeDate,
  })
}
