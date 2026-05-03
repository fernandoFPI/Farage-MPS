import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useCycleGroups(params = {}) {
  return useQuery({
    queryKey: ['cycle-groups', params],
    queryFn: () => client.get('/api/cycle-groups', { params }).then(r => r.data),
  })
}

export function useCycleGroup(id) {
  return useQuery({
    queryKey: ['cycle-groups', id],
    queryFn: () => client.get(`/api/cycle-groups/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateCycleGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => client.post('/api/cycle-groups', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cycle-groups'] })
      qc.invalidateQueries({ queryKey: ['billing-cycles'] })
    },
  })
}

export function useDeleteCycleGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/cycle-groups/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cycle-groups'] })
      qc.invalidateQueries({ queryKey: ['billing-cycles'] })
    },
  })
}

export function useBillingCycleGroupSummary(cycleId) {
  return useQuery({
    queryKey: ['billing-cycles', cycleId, 'group-summary'],
    queryFn: () => client.get(`/api/billing-cycles/${cycleId}/group-summary`).then(r => r.data),
    enabled: !!cycleId,
    retry: false,
  })
}
