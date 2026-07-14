import type { FacetedFilterOption } from '@/components/ui/faceted-filter'
import { useApiKeysQuery } from '@/hooks/queries/useApiKeysQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useMemo } from 'react'

function extractKeySuffix(maskedValue: string): string {
  const lastStar = maskedValue.lastIndexOf('*')
  return lastStar >= 0 ? maskedValue.slice(lastStar + 1) : maskedValue
}

export function useApiKeyFilterOptions(): readonly FacetedFilterOption[] {
  const { selectedOrganization } = useSelectedOrganization()
  const { data: apiKeys } = useApiKeysQuery(selectedOrganization?.id)

  return useMemo(() => {
    if (!apiKeys) {
      return []
    }

    const seenSuffixes = new Set<string>()
    const options: FacetedFilterOption[] = []

    for (const apiKey of apiKeys) {
      const suffix = extractKeySuffix(apiKey.value)
      if (!suffix || seenSuffixes.has(suffix)) {
        continue
      }
      seenSuffixes.add(suffix)

      options.push({
        value: suffix,
        label: apiKey.name,
        description: `...${suffix}`,
      })
    }

    return options
  }, [apiKeys])
}
