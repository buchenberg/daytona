import { AuditLog } from '@daytona/api-client'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../useApi'
import { useSelectedOrganization } from '../useSelectedOrganization'
import { queryKeys } from './queryKeys'

// No get-by-id endpoint exists, so fetch via the list filtered by `id[eq]`.
// `seedLog` (the clicked row) is initial data so the sheet renders instantly.
export function useAuditLogQuery(auditLogId: string | null, seedLog?: AuditLog) {
  const { auditApi } = useApi()
  const { selectedOrganization } = useSelectedOrganization()

  return useQuery<AuditLog | undefined>({
    queryKey: queryKeys.audit.log(selectedOrganization?.id ?? '', auditLogId ?? ''),
    queryFn: async () => {
      if (!selectedOrganization || !auditLogId) {
        return undefined
      }

      const response = await auditApi.getOrganizationAuditLogs(
        selectedOrganization.id,
        1,
        1,
        undefined, // from
        undefined, // to
        undefined, // nextToken
        undefined, // id
        undefined, // actorId
        undefined, // actorEmail
        undefined, // actorApiKeyPrefix
        undefined, // actorApiKeySuffix
        undefined, // action
        undefined, // targetType
        undefined, // targetId
        undefined, // statusCode
        undefined, // createdAt
        { params: { 'id[eq]': auditLogId } },
      )

      return response.data.items[0]
    },
    enabled: Boolean(selectedOrganization && auditLogId),
    initialData: seedLog,
  })
}
