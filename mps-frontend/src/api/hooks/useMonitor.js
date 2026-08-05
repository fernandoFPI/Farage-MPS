import { useQuery } from '@tanstack/react-query';
import client from '../client';

const STALE = 5 * 60 * 1000; // 5 min

export function useMonitorSummary() {
  return useQuery({
    queryKey: ['monitor', 'summary'],
    queryFn: () => client.get('/api/monitor/summary').then(r => r.data),
    staleTime: STALE,
    refetchInterval: STALE,
  });
}

export function useReadingGaps() {
  return useQuery({
    queryKey: ['monitor', 'reading-gaps'],
    queryFn: () => client.get('/api/monitor/reading-gaps').then(r => r.data),
    staleTime: STALE,
    refetchInterval: STALE,
  });
}

export function useCycleGaps(graceDays = 5) {
  return useQuery({
    queryKey: ['monitor', 'cycle-gaps', graceDays],
    queryFn: () => client.get('/api/monitor/cycle-gaps', { params: { graceDays } }).then(r => r.data),
    staleTime: STALE,
    refetchInterval: STALE,
  });
}

export function useOdooMonitorStatus() {
  return useQuery({
    queryKey: ['monitor', 'odoo-status'],
    queryFn: () => client.get('/api/monitor/odoo-status').then(r => r.data),
    staleTime: STALE,
    refetchInterval: STALE,
  });
}
