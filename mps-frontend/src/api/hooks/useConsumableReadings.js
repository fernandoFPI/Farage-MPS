import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useConsumableReadings(params = {}) {
  return useQuery({
    queryKey: ['consumable-readings', params],
    queryFn: () => client.get('/api/consumable-readings', { params }).then(r => r.data),
  })
}

export function useConsumableReadingById(id) {
  return useQuery({
    queryKey: ['consumable-readings', id],
    queryFn: () => client.get(`/api/consumable-readings/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useSubmitConsumableReading() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => client.post('/api/consumable-readings', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consumable-readings'] })
    },
  })
}

export function useUpdateConsumableReading() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => client.put(`/api/consumable-readings/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consumable-readings'] })
    },
  })
}
