/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { type CommandConfig, useRegisterCommands } from '@/components/CommandPalette'
import { CreateSecretSheet } from '@/components/CreateSecretSheet'
import { DeleteSecretDialog } from '@/components/DeleteSecretDialog'
import { PageContent, PageFooter, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { SecretTable } from '@/components/SecretTable'
import { UpdateSecretDialog } from '@/components/UpdateSecretDialog'
import { useSecretsQuery } from '@/hooks/queries/useSecretsQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { OrganizationRolePermissionsEnum, Secret } from '@daytona/api-client'
import { PlusIcon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

const Secrets: React.FC = () => {
  const createSecretSheetRef = useRef<{ open: () => void }>(null)
  const [secretToEdit, setSecretToEdit] = useState<Secret | null>(null)
  const [secretToDelete, setSecretToDelete] = useState<Secret | null>(null)

  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()
  const secretsQuery = useSecretsQuery(selectedOrganization?.id)

  const managePermitted = useMemo(
    () => authenticatedUserHasPermission(OrganizationRolePermissionsEnum.MANAGE_SECRETS),
    [authenticatedUserHasPermission],
  )

  const rootCommands: CommandConfig[] = useMemo(() => {
    if (!managePermitted) {
      return []
    }

    return [
      {
        id: 'create-secret',
        label: 'Create Secret',
        icon: <PlusIcon className="w-4 h-4" />,
        onSelect: () => createSecretSheetRef.current?.open(),
      },
    ]
  }, [managePermitted])

  useRegisterCommands(rootCommands, { groupId: 'secret-actions', groupLabel: 'Secret actions', groupOrder: 0 })

  return (
    <PageLayout contained>
      <PageHeader />

      <PageContent size="full" className="overflow-hidden">
        <PageIntro
          title="Secrets"
          actions={
            managePermitted ? (
              <CreateSecretSheet organizationId={selectedOrganization?.id} ref={createSecretSheetRef} />
            ) : undefined
          }
        />
        <SecretTable
          data={secretsQuery.data ?? []}
          loading={secretsQuery.isLoading || secretsQuery.isRefetching}
          onEdit={(secret) => setSecretToEdit(secret)}
          onDelete={(secret) => setSecretToDelete(secret)}
        />

        <UpdateSecretDialog
          secret={secretToEdit}
          open={!!secretToEdit}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setSecretToEdit(null)
            }
          }}
          organizationId={selectedOrganization?.id}
        />

        <DeleteSecretDialog
          secret={secretToDelete}
          open={!!secretToDelete}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setSecretToDelete(null)
            }
          }}
          organizationId={selectedOrganization?.id}
        />
      </PageContent>
      <PageFooter />
    </PageLayout>
  )
}

export default Secrets
