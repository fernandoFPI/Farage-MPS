import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useContractGroups(params = {}) {
  return useQuery({
    queryKey: ['contract-groups', params],
    queryFn: () => {
      if (params.contractId) {
        return client.get(`/api/contract-groups/by-contract/${params.contractId}`).then(r => r.data)
      }
      return client.get('/api/contract-groups').then(r => r.data)
    },
    enabled: params.contractId !== undefined ? !!params.contractId : true,
  })
}

export function useContractGroup(id) {
  return useQuery({
    queryKey: ['contract-groups', id],
    queryFn: () => client.get(`/api/contract-groups/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useContractGroupSummary(id, periodStart) {
  return useQuery({
    queryKey: ['contract-groups', id, 'summary', periodStart],
    queryFn: () => client.get(`/api/contract-groups/${id}/summary`, { params: { periodStart } }).then(r => r.data),
    enabled: !!id && !!periodStart,
  })
}

export function useCreateContractGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => client.post('/api/contract-groups', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-groups'] }),
  })
}

export function useUpdateContractGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => client.put(`/api/contract-groups/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-groups'] }),
  })
}

export function useDeleteContractGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/contract-groups/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-groups'] }),
  })
}

export function useAddGroupMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, contractId }) =>
      client.post(`/api/contract-groups/${groupId}/members`, { contractId }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-groups'] }),
  })
}

export function useRemoveGroupMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, contractId }) =>
      client.delete(`/api/contract-groups/${groupId}/members/${contractId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-groups'] }),
  })
}
