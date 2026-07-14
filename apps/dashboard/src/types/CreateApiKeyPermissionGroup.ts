import { CreateApiKeyPermissionsEnum } from '@daytona/api-client'

export interface CreateApiKeyPermissionGroup {
  name: string
  permissions: CreateApiKeyPermissionsEnum[]
}
