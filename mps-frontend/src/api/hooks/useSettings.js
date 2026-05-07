import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

// Returns flat key-value object: { show_calculation_details: 'true', ... }
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => client.get('/api/settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      if (Array.isArray(data)) {
        return Object.fromEntries(data.map(s => [s.key, s.value]))
      }
      return data
    },
  })
}

// Returns raw array with metadata: [{ key, value, updatedAt, updatedByName }, ...]
export function useSettingsRaw() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => client.get('/api/settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }) =>
      client.patch(`/api/settings/${key}`, { value }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}
