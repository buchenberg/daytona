import { usePendingMutationKeys } from '@/hooks/usePendingMutationKeys'
import { mutationKeys } from './mutationKeys'

type RunnerMutationVariables = {
  runnerId?: string
}

const runnerMutationSelectors = [
  {
    mutationKey: mutationKeys.runners.updateScheduling(),
    getKey: (variables?: RunnerMutationVariables) => variables?.runnerId,
  },
  {
    mutationKey: mutationKeys.runners.remove(),
    getKey: (variables?: RunnerMutationVariables) => variables?.runnerId,
  },
]

export function useMutatingRunners(): Set<string> {
  return usePendingMutationKeys<string, RunnerMutationVariables>(runnerMutationSelectors)
}
