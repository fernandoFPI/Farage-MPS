import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useContracts(params = {}) {
  return useQuery({
    queryKey: ['contracts', params],
    queryFn: () => client.get('/api/contracts', { params }).then(r => r.data),
  })
}

export function useContract(id) {
  return useQuery({
    queryKey: ['contracts', id],
    queryFn: () => client.get(`/api/contracts/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => client.post('/api/contracts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  })
}

export function useUpdateContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => client.put(`/api/contracts/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  })
}

export function useDeleteContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/contracts/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  })
}
