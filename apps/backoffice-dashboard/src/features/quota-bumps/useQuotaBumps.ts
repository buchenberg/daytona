import { useQuery } from '@tanstack/react-query'
import BackofficeApiClient from '../../api/BackofficeApiClient'

/** Pending bumps awaiting approval (the notifications / approvals queue). */
export const usePendingQuotaBumps = (enabled = true) =>
  useQuery({
    queryKey: ['quota-bumps', 'pending'],
    queryFn: () => BackofficeApiClient.listPendingQuotaBumps(1, 100),
    enabled,
    refetchInterval: 60 * 1000,
  })

/** The current editor's daily bump budget (total / spent / remaining). */
export const useQuotaBumpBudget = (enabled = true) =>
  useQuery({
    queryKey: ['quota-bumps', 'budget'],
    queryFn: () => BackofficeApiClient.getQuotaBumpBudget(),
    enabled,
    staleTime: 30 * 1000,
  })
