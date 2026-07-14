import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'

/** Pending quota requests awaiting approval (the notifications / approvals queue). */
export const usePendingQuotaRequests = (enabled = true) =>
  useQuery({
    queryKey: ['quota-requests', 'pending'],
    queryFn: () => BackofficeApiClient.listPendingQuotaRequests(1, 100),
    enabled,
    refetchInterval: 60 * 1000,
  })

/** The current editor's daily update budget (total / spent / remaining). */
export const useQuotaUpdateBudget = (enabled = true) =>
  useQuery({
    queryKey: ['quota-requests', 'budget'],
    queryFn: () => BackofficeApiClient.getQuotaUpdateBudget(),
    enabled,
    staleTime: 30 * 1000,
  })

/** Regions a quota can target. Static per session. */
export const useQuotaRegions = (enabled = true) =>
  useQuery({
    queryKey: ['quota-requests', 'regions'],
    queryFn: () => BackofficeApiClient.listQuotaRegions(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

/** The default limits a create request grants. Config-driven — changes only on redeploy. */
export const useQuotaCreateDefaults = (enabled = true) =>
  useQuery({
    queryKey: ['quota-requests', 'create-defaults'],
    queryFn: () => BackofficeApiClient.getQuotaCreateDefaults(),
    enabled,
    staleTime: Infinity,
  })
