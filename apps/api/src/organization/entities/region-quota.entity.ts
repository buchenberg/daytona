import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { Organization } from './organization.entity'
import { SandboxClass } from '../../sandbox/enums/sandbox-class.enum'
import { GpuType } from '../../sandbox/enums/gpu-type.enum'

const DEFAULT_MAX_CPU_PER_GPU = 16
const DEFAULT_MAX_MEMORY_PER_GPU = 192
const DEFAULT_MAX_DISK_PER_GPU = 512

@Entity()
export class RegionQuota {
  @PrimaryColumn()
  organizationId: string

  @PrimaryColumn()
  regionId: string

  @PrimaryColumn({ type: 'character varying', default: SandboxClass.CONTAINER })
  sandboxClass: SandboxClass

  /**
   * The dedicated region that sandboxes for this organization and base region are actually placed on
   * (e.g. `us` -> `RL01`). `null` means sandboxes stay on the base region (`regionId`).
   */
  @Column({
    type: 'character varying',
    nullable: true,
    name: 'effective_region_id',
  })
  effectiveRegionId: string | null

  @ManyToOne(() => Organization, (organization) => organization.regionQuotas, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization

  @Column({
    type: 'int',
    default: 10,
    name: 'total_cpu_quota',
  })
  totalCpuQuota: number

  @Column({
    type: 'int',
    default: 10,
    name: 'total_memory_quota',
  })
  totalMemoryQuota: number

  @Column({
    type: 'int',
    default: 30,
    name: 'total_disk_quota',
  })
  totalDiskQuota: number

  @Column({
    type: 'int',
    default: 0,
    name: 'total_gpu_quota',
  })
  totalGpuQuota: number

  /**
   * List of GPU types permitted in this region.
   * `null` = no restriction.
   */
  @Column({
    type: 'text',
    array: true,
    nullable: true,
    name: 'allowed_gpu_types',
  })
  allowedGpuTypes: GpuType[] | null

  @Column({
    type: 'int',
    nullable: true,
    name: 'max_cpu_per_sandbox',
  })
  maxCpuPerSandbox: number | null

  @Column({
    type: 'int',
    nullable: true,
    name: 'max_memory_per_sandbox',
  })
  maxMemoryPerSandbox: number | null

  @Column({
    type: 'int',
    nullable: true,
    name: 'max_disk_per_sandbox',
  })
  maxDiskPerSandbox: number | null

  /**
   * The maximum disk size allowed for non-ephemeral sandboxes.
   * If `null`, fallback to `maxDiskPerSandbox`.
   * If `0`, non-ephemeral sandboxes are not permitted in this region.
   */
  @Column({
    type: 'int',
    nullable: true,
    name: 'max_disk_per_non_ephemeral_sandbox',
  })
  maxDiskPerNonEphemeralSandbox: number | null

  /**
   * CPU maximum per requested GPU unit; a GPU sandbox may use up to
   * `maxCpuPerGpu * gpu` CPUs. If `null`, fallback to `maxCpuPerSandbox`.
   */
  @Column({
    type: 'int',
    nullable: true,
    default: DEFAULT_MAX_CPU_PER_GPU,
    name: 'max_cpu_per_gpu',
  })
  maxCpuPerGpu: number | null

  /**
   * Memory maximum per requested GPU unit; a GPU sandbox may use up to
   * `maxMemoryPerGpu * gpu` GiB. If `null`, fallback to `maxMemoryPerSandbox`.
   */
  @Column({
    type: 'int',
    nullable: true,
    default: DEFAULT_MAX_MEMORY_PER_GPU,
    name: 'max_memory_per_gpu',
  })
  maxMemoryPerGpu: number | null

  /**
   * Disk maximum per requested GPU unit; a GPU sandbox may use up to
   * `maxDiskPerGpu * gpu` GiB. If `null`, fallback to `maxDiskPerSandbox`.
   */
  @Column({
    type: 'int',
    nullable: true,
    default: DEFAULT_MAX_DISK_PER_GPU,
    name: 'max_disk_per_gpu',
  })
  maxDiskPerGpu: number | null

  @CreateDateColumn({
    type: 'timestamp with time zone',
  })
  createdAt: Date

  @UpdateDateColumn({
    type: 'timestamp with time zone',
  })
  updatedAt: Date

  constructor(params?: {
    organizationId: string
    regionId: string
    sandboxClass: SandboxClass
    totalCpuQuota: number
    totalMemoryQuota: number
    totalDiskQuota: number
    totalGpuQuota?: number
    allowedGpuTypes?: GpuType[] | null
    maxCpuPerSandbox?: number | null
    maxMemoryPerSandbox?: number | null
    maxDiskPerSandbox?: number | null
    maxDiskPerNonEphemeralSandbox?: number | null
    maxCpuPerGpu?: number | null
    maxMemoryPerGpu?: number | null
    maxDiskPerGpu?: number | null
    effectiveRegionId?: string | null
  }) {
    if (!params) return
    this.organizationId = params.organizationId
    this.regionId = params.regionId
    this.sandboxClass = params.sandboxClass
    this.effectiveRegionId = params.effectiveRegionId ?? null
    this.totalCpuQuota = params.totalCpuQuota
    this.totalMemoryQuota = params.totalMemoryQuota
    this.totalDiskQuota = params.totalDiskQuota
    this.totalGpuQuota = params.totalGpuQuota ?? 0
    this.allowedGpuTypes = params.allowedGpuTypes ?? null
    this.maxCpuPerSandbox = params.maxCpuPerSandbox ?? null
    this.maxMemoryPerSandbox = params.maxMemoryPerSandbox ?? null
    this.maxDiskPerSandbox = params.maxDiskPerSandbox ?? null
    this.maxDiskPerNonEphemeralSandbox = params.maxDiskPerNonEphemeralSandbox ?? null
    this.maxCpuPerGpu = params.maxCpuPerGpu ?? DEFAULT_MAX_CPU_PER_GPU
    this.maxMemoryPerGpu = params.maxMemoryPerGpu ?? DEFAULT_MAX_MEMORY_PER_GPU
    this.maxDiskPerGpu = params.maxDiskPerGpu ?? DEFAULT_MAX_DISK_PER_GPU
  }
}
