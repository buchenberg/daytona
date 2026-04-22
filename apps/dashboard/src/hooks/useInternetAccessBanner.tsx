/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useBanner } from '@/components/Banner'
import { FeatureFlags } from '@/enums/FeatureFlags'
import { RoutePath } from '@/enums/RoutePath'
import { Organization } from '@daytona/api-client'
import { Globe } from 'lucide-react'
import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const INTERNET_ACCESS_BANNER_ID = 'internet-access-restriction-banner'

type InternetAccessState = Pick<Organization, 'sandboxLimitedNetworkEgress'>

export function useInternetAccessBanner(organization?: InternetAccessState | null) {
  const { addBanner, removeBanner } = useBanner()
  const navigate = useNavigate()
  const previousRestrictedRef = useRef<boolean | undefined>(undefined)
  const featureEnabled = useFeatureFlagEnabled(FeatureFlags.STRIPE_ABUSE_VERIFICATION)

  useEffect(() => {
    const wasRestricted = previousRestrictedRef.current
    const isRestricted = (organization?.sandboxLimitedNetworkEgress ?? false) && !!featureEnabled

    if (wasRestricted && !isRestricted) {
      removeBanner(INTERNET_ACCESS_BANNER_ID)
      previousRestrictedRef.current = isRestricted
      return
    }

    previousRestrictedRef.current = isRestricted

    if (!isRestricted) {
      return
    }

    addBanner({
      id: INTERNET_ACCESS_BANNER_ID,
      variant: 'warning',
      title: 'Restricted Internet Access',
      description: 'Verify your account to unlock unrestricted internet access.',
      icon: <Globe className="h-4 w-4 flex-shrink-0 text-current" />,
      action: {
        label: 'Verify',
        onClick: () => {
          navigate(RoutePath.LIMITS)
          // Scroll to the verification card after navigation commits
          setTimeout(() => {
            document.getElementById('internet-access-verification')?.scrollIntoView({ behavior: 'smooth' })
          }, 100)
        },
      },
      isDismissible: true,
    })
  }, [organization, addBanner, removeBanner, navigate, featureEnabled])
}
