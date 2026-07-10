/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CurrentUsageCard } from '@/components/CurrentUsageCard'
import { OrganizationUserRoleEnum } from '@daytona/api-client'
import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { TierComparisonTable, TierComparisonTableSkeleton } from '@/components/TierComparisonTable'
import { TierUpgradeCard } from '@/components/TierUpgradeCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { DAYTONA_DOCS_NETWORK_LIMITS_URL, DAYTONA_DOCS_PREVIEW_AUTH_URL } from '@/constants/Links'
import { RoutePath } from '@/enums/RoutePath'
import { useOwnerTierQuery } from '@/hooks/queries/billingQueries'
import { useGpuAccessQuery } from '@/hooks/queries/useGpuAccessQuery'
import { usePaymentMethodsQuery } from '@/hooks/queries/usePaymentMethodsQuery'
import { useTiersQuery } from '@/hooks/queries/useTiersQuery'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { cn } from '@/lib/utils'
import { Globe, RefreshCcw, ShieldAlert, ExternalLinkIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useAuth } from 'react-oidc-context'
import { useNavigate } from 'react-router'

export default function Limits() {
  const { user } = useAuth()
  const { selectedOrganization, authenticatedUserOrganizationMember } = useSelectedOrganization()
  const isOwner = authenticatedUserOrganizationMember?.role === OrganizationUserRoleEnum.OWNER
  const organizationTierQuery = useOwnerTierQuery()
  const tiersQuery = useTiersQuery()

  const organizationTier = organizationTierQuery.data
  const tiers = tiersQuery.data?.slice().sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))

  const config = useConfig()
  const navigate = useNavigate()
  const paymentMethodsQuery = usePaymentMethodsQuery({
    organizationId: selectedOrganization?.id ?? '',
    enabled: Boolean(config.billingApiUrl && selectedOrganization && isOwner),
  })
  const paymentMethods = paymentMethodsQuery.data
  const paymentMethodsUnavailable = paymentMethodsQuery.isError && paymentMethods === undefined
  const hasPaymentMethod = (paymentMethods?.length ?? 0) > 0

  const gpuAccessQuery = useGpuAccessQuery({
    organizationId: selectedOrganization?.id ?? '',
    enabled: Boolean(config.billingApiUrl && selectedOrganization),
  })
  // Only lock the GPU bar on a definitive "no credits" answer, never while loading or on error.
  const gpuLocked = gpuAccessQuery.data?.hasGpuCredits === false

  useEffect(() => {
    if (selectedOrganization && !selectedOrganization.defaultRegionId) {
      navigate(RoutePath.SETTINGS)
    }
  }, [navigate, selectedOrganization])

  const tierDataLoading = organizationTierQuery.isLoading || tiersQuery.isLoading
  const tierDataError = organizationTierQuery.isError || tiersQuery.isError
  const upgradeRequirementsLoading = tierDataLoading || paymentMethodsQuery.isLoading
  const upgradeRequirementsError = paymentMethodsUnavailable && !tierDataError

  const handleRetryTierData = () => {
    if (isOwner) {
      organizationTierQuery.refetch()
    }
    tiersQuery.refetch()
  }

  const handleRetryPaymentMethods = () => {
    paymentMethodsQuery.refetch()
  }

  return (
    <PageLayout>
      <PageHeader />

      <PageContent>
        <PageIntro title="Limits" />
        <CurrentUsageCard organizationTier={organizationTier} gpuLocked={gpuLocked} />

        {config.billingApiUrl && selectedOrganization && (
          <>
            {isOwner &&
              (upgradeRequirementsError ? (
                <Card>
                  <CardContent className="flex p-0">
                    <LimitsSectionErrorState
                      title="Failed to load upgrade requirements"
                      description="Something went wrong while fetching your billing requirements."
                      onRetry={handleRetryPaymentMethods}
                    />
                  </CardContent>
                </Card>
              ) : (
                !upgradeRequirementsLoading &&
                !tierDataError && (
                  <TierUpgradeCard
                    organizationTier={organizationTier}
                    tiers={tiers || []}
                    organization={selectedOrganization}
                    requirementsState={{
                      emailVerified: !!user?.profile?.email_verified,
                      creditCardLinked: hasPaymentMethod,
                    }}
                  />
                )
              ))}

            <Card className="mb-10">
              <CardHeader>
                <CardTitle className="flex items-center mb-2">Limits</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {tierDataLoading ? (
                  <TierComparisonTableSkeleton />
                ) : tierDataError ? (
                  <div className="flex">
                    <LimitsSectionErrorState
                      title="Failed to load tier limits"
                      description="Something went wrong while fetching billing tiers."
                      onRetry={handleRetryTierData}
                    />
                  </div>
                ) : (
                  <TierComparisonTable
                    className="only:mb-4 border-l-0 border-r-0"
                    tiers={tiers || []}
                    currentTier={organizationTier}
                  />
                )}
                <AdditionalFeatures />
              </CardContent>
            </Card>
          </>
        )}
      </PageContent>
    </PageLayout>
  )
}

function LimitsSectionErrorState({
  title,
  description,
  onRetry,
}: {
  title: string
  description: string
  onRetry: () => void
}) {
  return (
    <Empty className="flex-1 border-0 py-8">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCcw className="size-4" />
        Retry
      </Button>
    </Empty>
  )
}

function AdditionalFeatures({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-[auto_1fr] grid-rows-2 text-xs gap-4 p-4', className)}>
      <div className="flex items-center gap-2 font-medium">
        <ShieldAlert size={14} className="text-amber-500" />
        <span>Preview Warning</span>
      </div>

      <div className="text-muted-foreground flex-1">
        Shown on <span className="text-foreground">Tier 1 & 2</span>. Removed for{' '}
        <span className="text-foreground">Tier 3+</span>.{' '}
        <a
          href={DAYTONA_DOCS_PREVIEW_AUTH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline inline-flex items-center gap-1 hover:text-foreground"
        >
          Learn more
          <ExternalLinkIcon size={14} />
        </a>
      </div>

      <div className="flex items-center gap-2 font-medium">
        <Globe size={14} className="text-green-500" />
        <span>Internet Access</span>
      </div>
      <div className="text-muted-foreground flex-1">
        Restricted on <span className="text-foreground">Tier 1 & 2</span>. Full access for{' '}
        <span className="text-foreground">Tier 3+</span>.{' '}
        <a
          href={DAYTONA_DOCS_NETWORK_LIMITS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline inline-flex items-center gap-1 hover:text-foreground"
        >
          Learn more
          <ExternalLinkIcon size={14} />
        </a>
      </div>
    </div>
  )
}
