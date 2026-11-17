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

export function useUnconfirmCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.patch(`/api/billing-cycles/${id}/unconfirm`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

// ── Cycle locks (admin) ──────────────────────────────────────────────────────
// A locked cycle serves a frozen snapshot of its figures; unlocking / recalculating are the only
// ways it changes. Every mutation refreshes cycles, summaries and lock queries (all share the
// 'billing-cycles' key prefix).

export function useLockCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.post(`/api/billing-cycles/${id}/lock`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

export function useUnlockCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.post(`/api/billing-cycles/${id}/unlock`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

export function useRecalculateCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.post(`/api/billing-cycles/${id}/recalculate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

// Frozen vs fresh figures for a locked cycle. Never cached: it must reflect the data right now.
export function useRecalculationPreview(id, enabled) {
  return useQuery({
    queryKey: ['billing-cycles', id, 'recalculate-preview'],
    queryFn: () => client.get(`/api/billing-cycles/${id}/recalculate-preview`).then(r => r.data),
    enabled: !!id && !!enabled,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useLockHistory(id, enabled) {
  return useQuery({
    queryKey: ['billing-cycles', id, 'lock-history'],
    queryFn: () => client.get(`/api/billing-cycles/${id}/lock-history`).then(r => r.data),
    enabled: !!id && !!enabled,
  })
}

// How many confirmed/invoiced cycles a bulk lock would cover (optionally for one contract).
export function useLockCandidates(contractId, enabled) {
  return useQuery({
    queryKey: ['billing-cycles', 'lock-candidates', contractId ?? 'all'],
    queryFn: () => client.get('/api/billing-cycles/locks/candidates', { params: contractId ? { contractId } : {} }).then(r => r.data),
    enabled: !!enabled,
    staleTime: 0,
    gcTime: 0,
  })
}

// One chunk of the bulk lock; the caller repeats until `remaining` is 0 or a chunk locks nothing.
export function lockCyclesBulkChunk(body) {
  return client.post('/api/billing-cycles/locks/bulk', body).then(r => r.data)
}

export function useUpdateCyclePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, periodStart, periodEnd }) =>
      client.patch(`/api/billing-cycles/${id}/period`, { periodStart, periodEnd }).then(r => r.data),
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

export function useSubmitStorage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, storageUpdates }) =>
      client.patch(`/api/billing-cycles/${id}/submit-storage`, { storageUpdates }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })
}

export function useCancelledCycles() {
  return useQuery({
    queryKey: ['billing-cycles-cancelled'],
    queryFn: () => client.get('/api/billing-cycles/cancelled').then(r => r.data),
  })
}

export function useDeletedCycles() {
  return useQuery({
    queryKey: ['billing-cycles-deleted'],
    queryFn: () => client.get('/api/billing-cycles/deleted').then(r => r.data),
  })
}

export function useRestoreCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.post(`/api/billing-cycles/${id}/restore`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-cycles-deleted'] })
      qc.invalidateQueries({ queryKey: ['billing-cycles'] })
    },
  })
}

export function useHardDeleteCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/billing-cycles/${id}/purge`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles-cancelled'] }),
  })
}

export function useSetManualBillingAmount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }) =>
      client.patch(`/api/billing-cycles/${id}/manual-billing`, { amount }).then(r => r.data),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: ['billing-cycles', id] }),
  })
}

export function useAuditExport() {
  return useMutation({
    mutationFn: (id) => client.get(`/api/billing-cycles/${id}/audit-export`).then(r => r.data),
  })
}

export function useLatestBillingCycle(contractId) {
  return useQuery({
    queryKey: ['billing-cycles', 'latest', contractId],
    queryFn: () => client.get('/api/billing-cycles/latest', { params: { contractId } }).then(r => r.data),
    enabled: !!contractId,
  })
}

export function useCityStatuses(cycleId) {
  return useQuery({
    queryKey: ['billing-cycles', cycleId, 'cities'],
    queryFn: () => client.get(`/api/billing-cycles/${cycleId}/cities`).then(r => r.data),
    enabled: !!cycleId,
  })
}

export function useConfirmCity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, city }) =>
      client.patch(`/api/billing-cycles/${cycleId}/cities/${encodeURIComponent(city)}/confirm`).then(r => r.data),
    onSuccess: (_data, { cycleId }) => {
      qc.invalidateQueries({ queryKey: ['billing-cycles', cycleId, 'cities'] })
      qc.invalidateQueries({ queryKey: ['billing-cycles', cycleId] })
    },
  })
}

export function useResetCity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, city }) =>
      client.patch(`/api/billing-cycles/${cycleId}/cities/${encodeURIComponent(city)}/reset`).then(r => r.data),
    onSuccess: (_data, { cycleId }) => {
      qc.invalidateQueries({ queryKey: ['billing-cycles', cycleId, 'cities'] })
      qc.invalidateQueries({ queryKey: ['billing-cycles', cycleId] })
    },
  })
}
