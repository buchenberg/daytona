/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useMemo } from 'react'
import { SandboxClass } from '@daytona/api-client'
import { useAvailableSandboxClassesQuery } from '@/hooks/queries/useAvailableSandboxClassesQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'

export function useAvailableSandboxClasses(regionId: string | undefined): SandboxClass[] {
  const { selectedOrganization } = useSelectedOrganization()
  const { data: availableClasses, isPending } = useAvailableSandboxClassesQuery({
    organizationId: selectedOrganization?.id ?? '',
  })

  return useMemo<SandboxClass[]>(() => {
    if (!regionId) return []
    if (isPending || !availableClasses) return []
    const classesForRegion = availableClasses.filter((c) => c.regionId === regionId)
    if (classesForRegion.length > 0) {
      return [...new Set(classesForRegion.map((c) => c.sandboxClass))]
    }
    return Object.values(SandboxClass)
  }, [availableClasses, isPending, regionId])
}

export function useAvailableSandboxClassesForOrganization(): SandboxClass[] {
  const { selectedOrganization } = useSelectedOrganization()
  const { data: availableClasses, isPending } = useAvailableSandboxClassesQuery({
    organizationId: selectedOrganization?.id ?? '',
  })

  return useMemo<SandboxClass[]>(() => {
    if (isPending || !availableClasses) return []
    if (availableClasses.length === 0) return Object.values(SandboxClass)
    return [...new Set(availableClasses.map((c) => c.sandboxClass))]
  }, [availableClasses, isPending])
}
