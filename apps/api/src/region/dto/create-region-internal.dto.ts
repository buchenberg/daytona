import { RegionType } from '../enums/region-type.enum'

export class CreateRegionInternalDto {
  id?: string
  name: string
  enforceQuotas: boolean
  regionType: RegionType
  proxyUrl?: string | null
  sshGatewayUrl?: string | null
  snapshotManagerUrl?: string | null
}
