import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useBillingCycles(params = {}) {
  return useQuery({
    queryKey: ['billing-cycles', params],
    queryFn: () => client.get('/api/billing-cycles', { params }).then(r => r.data),
  })
}

export function useBillingCycle(id, options = {}) {
  return useQuery({
    queryKey: ['billing-cycles', id],
    queryFn: () => client.get(`/api/billing-cycles/${id}`).then(r => r.data),
    enabled: !!id,
    ...options,
  })
}

export function useCreateBillingCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => client.post('/api/billing-cycles', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

export function useConfirmCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.patch(`/api/billing-cycles/${id}/confirm`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

export function useDisputeCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }) => client.patch(`/api/billing-cycles/${id}/dispute`, { disputeNote: reason }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

export function useReopenCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.patch(`/api/billing-cycles/${id}/reopen`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

export function useBillingCycleSummary(id) {
  return useQuery({
    queryKey: ['billing-cycles', id, 'summary'],
    queryFn: () => client.get(`/api/billing-cycles/${id}/summary`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCancelCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/billing-cycles/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

export function useLockPrinter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, printerId }) =>
      client.post(`/api/billing-cycles/${cycleId}/lock-printer`, { printerId }).then(r => r.data),
    onSuccess: (_data, { cycleId }) => qc.invalidateQueries({ queryKey: ['billing-cycles', cycleId] }),
  })
}

export function useUnlockPrinter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, printerId }) =>
      client.delete(`/api/billing-cycles/${cycleId}/lock-printer/${printerId}`).then(r => r.data),
    onSuccess: (_data, { cycleId }) => qc.invalidateQueries({ queryKey: ['billing-cycles', cycleId] }),
  })
}

export function useSetBaseline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isBaseline }) =>
      client.patch(`/api/billing-cycles/${id}/set-baseline`, { isBaseline }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}
