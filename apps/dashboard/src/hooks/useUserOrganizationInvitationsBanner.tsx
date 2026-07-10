/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useBanner } from '@/components/Banner'
import { routes } from '@/routes/paths'
import { useUserOrganizationInvitationsQuery } from '@/hooks/queries/useUserOrganizationInvitationsQuery'
import { MailIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'

const USER_ORGANIZATION_INVITATIONS_BANNER_ID = 'user-organization-invitations-banner'

export function useUserOrganizationInvitationsBanner() {
  const { addBanner, removeBanner } = useBanner()
  const { data: invitations = [], isLoading } = useUserOrganizationInvitationsQuery()
  const location = useLocation()
  const navigate = useNavigate()
  const invitationsCount = invitations.length
  const path = location.pathname

  useEffect(() => {
    if (isLoading || invitationsCount === 0) {
      removeBanner(USER_ORGANIZATION_INVITATIONS_BANNER_ID)
      return
    }

    const hasMultipleInvitations = invitationsCount > 1

    addBanner({
      id: USER_ORGANIZATION_INVITATIONS_BANNER_ID,
      variant: 'info',
      title: hasMultipleInvitations ? 'Pending invitations' : 'Pending invitation',
      description: hasMultipleInvitations
        ? `You have ${invitationsCount} organization invitations waiting for your response.`
        : 'You have an organization invitation waiting for your response.',
      icon: <MailIcon className="h-4 w-4 flex-shrink-0 text-current" />,
      action:
        path !== routes.userInvitations.path
          ? {
              label: 'Review',
              onClick: () => navigate(routes.userInvitations.path),
            }
          : undefined,
      isDismissible: false,
    })
  }, [addBanner, invitationsCount, isLoading, navigate, path, removeBanner])
}
