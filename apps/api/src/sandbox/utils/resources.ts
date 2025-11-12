import { TypedConfigService } from '../../config/typed-config.service'

export interface Resources {
  cpu: number
  memory: number
  disk: number
}

export function areResourcesLargerThanDefault(configService: TypedConfigService, resources: Resources): boolean {
  const defaultOrganizationQuota = configService.getOrThrow('defaultOrganizationQuota')
  return (
    resources.cpu > defaultOrganizationQuota.maxCpuPerSandbox ||
    resources.memory > defaultOrganizationQuota.maxMemoryPerSandbox ||
    resources.disk > defaultOrganizationQuota.maxDiskPerSandbox
  )
}
