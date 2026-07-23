import {
  BeforeInsert,
  BeforeUpdate,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'
import { nanoid } from 'nanoid'
import { RegionType } from '../enums/region-type.enum'

@Entity()
@Index('region_organizationId_name_unique', ['organizationId', 'name'], {
  unique: true,
  where: '"organizationId" IS NOT NULL',
})
@Index('region_organizationId_null_name_unique', ['name'], {
  unique: true,
  where: '"organizationId" IS NULL',
})
@Index('region_proxyApiKeyHash_unique', ['proxyApiKeyHash'], {
  unique: true,
  where: '"proxyApiKeyHash" IS NOT NULL',
})
@Index('region_sshGatewayApiKeyHash_unique', ['sshGatewayApiKeyHash'], {
  unique: true,
  where: '"sshGatewayApiKeyHash" IS NOT NULL',
})
@Index('idx_region_custom', ['organizationId'], {
  where: '"regionType" = \'custom\'',
})
@Check('region_not_shared', '"organizationId" IS NULL OR "regionType" != \'shared\'')
@Check('region_not_custom', '"organizationId" IS NOT NULL OR "regionType" != \'custom\'')
export class Region {
  @PrimaryColumn()
  id: string

  @Column()
  name: string

  @Column({
    type: 'uuid',
    nullable: true,
  })
  organizationId: string | null

  @Column({
    type: 'enum',
    enum: RegionType,
  })
  regionType: RegionType

  @Column({
    type: 'boolean',
    default: true,
  })
  enforceQuotas: boolean

  /**
   * The region that sandboxes spill over to when this (dedicated) region cannot host them
   * (e.g. `RL01` -> `us`). `null` means this region has no fallback.
   */
  @Column({
    type: 'character varying',
    nullable: true,
    name: 'fallback_region_id',
  })
  fallbackRegionId: string | null

  /**
   * When true, sandbox creation on this region may retry on `fallbackRegionId` if a runner
   * returns a spillover-eligible error (e.g. workload the runner cannot run). Applies to all
   * sandboxes on the region. Not exposed through the API.
   */
  @Column({
    default: true,
    name: 'spillover_on_error',
  })
  spilloverOnError: boolean

  @CreateDateColumn({
    type: 'timestamp with time zone',
  })
  createdAt: Date

  @UpdateDateColumn({
    type: 'timestamp with time zone',
  })
  updatedAt: Date

  @Column({ nullable: true })
  proxyUrl: string | null

  @Column({ nullable: true })
  toolboxProxyUrl: string | null

  @Column({ nullable: true })
  proxyApiKeyHash: string | null

  @Column({ nullable: true })
  sshGatewayUrl: string | null

  @Column({ nullable: true })
  sshGatewayApiKeyHash: string | null

  @Column({ nullable: true })
  snapshotManagerUrl: string | null

  @Column({ type: 'integer', nullable: true })
  snapshotEvictionDiskThreshold: number | null

  @Column({ type: 'integer', nullable: true })
  snapshotEvictionDiskThresholdGpu: number | null

  constructor(params?: {
    name: string
    enforceQuotas: boolean
    regionType: RegionType
    id?: string
    organizationId?: string | null
    proxyUrl?: string | null
    toolboxProxyUrl?: string | null
    sshGatewayUrl?: string | null
    proxyApiKeyHash?: string | null
    sshGatewayApiKeyHash?: string | null
    snapshotManagerUrl?: string | null
    fallbackRegionId?: string | null
    spilloverOnError?: boolean
  }) {
    if (!params) return
    this.name = params.name
    this.enforceQuotas = params.enforceQuotas
    this.regionType = params.regionType
    this.fallbackRegionId = params.fallbackRegionId ?? null
    this.spilloverOnError = params.spilloverOnError ?? true

    if (params.id) {
      this.id = params.id
    } else {
      this.id = this.name.toLowerCase() + '_' + nanoid(4)
    }
    if (params.organizationId) {
      this.organizationId = params.organizationId
    }

    this.proxyUrl = params.proxyUrl ?? null
    this.toolboxProxyUrl = params.toolboxProxyUrl ?? params.proxyUrl ?? null
    this.sshGatewayUrl = params.sshGatewayUrl ?? null
    this.proxyApiKeyHash = params.proxyApiKeyHash ?? null
    this.sshGatewayApiKeyHash = params.sshGatewayApiKeyHash ?? null
    this.snapshotManagerUrl = params.snapshotManagerUrl ?? null
  }

  @BeforeInsert()
  @BeforeUpdate()
  validateRegionType() {
    if (this.regionType === RegionType.SHARED) {
      if (this.organizationId) {
        throw new Error('Shared regions cannot be associated with an organization.')
      }
    }
    if (this.regionType === RegionType.CUSTOM) {
      if (!this.organizationId) {
        throw new Error('Custom regions must be associated with an organization.')
      }
    }
  }
}
