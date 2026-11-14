import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

// Drafts for a cycle + which locations already have stock submitted for it
export function useTicketContext(cycleId, options = {}) {
  return useQuery({
    queryKey: ['tickets', 'context', cycleId],
    queryFn: () => client.get('/api/tickets/context', { params: { billingCycleId: cycleId } }).then(r => r.data),
    enabled: !!cycleId,
    ...options,
  })
}

// Full draft (includes photos) — fetched on demand when an engineer resumes one
export function fetchTicketDraft(cycleId, printerId) {
  return client.get(`/api/tickets/drafts/${cycleId}/${printerId}`).then(r => r.data)
}

function useInvalidateTicketData() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['tickets'] })
    qc.invalidateQueries({ queryKey: ['billing-cycles'] })
    qc.invalidateQueries({ queryKey: ['meter-readings'] })
    qc.invalidateQueries({ queryKey: ['consumable-readings'] })
    qc.invalidateQueries({ queryKey: ['customer-storage'] })
  }
}

export function useSubmitTicket() {
  const invalidate = useInvalidateTicketData()
  return useMutation({
    mutationFn: (data) => client.post('/api/tickets/submit', data).then(r => r.data),
    onSuccess: invalidate,
  })
}

export function useSaveTicketDraft() {
  const invalidate = useInvalidateTicketData()
  return useMutation({
    mutationFn: (data) => client.put('/api/tickets/drafts', data).then(r => r.data),
    onSuccess: invalidate,
  })
}

export function useDeleteTicketDraft() {
  const invalidate = useInvalidateTicketData()
  return useMutation({
    mutationFn: ({ cycleId, printerId }) =>
      client.delete(`/api/tickets/drafts/${cycleId}/${printerId}`).then(r => r.data),
    onSuccess: invalidate,
  })
}
