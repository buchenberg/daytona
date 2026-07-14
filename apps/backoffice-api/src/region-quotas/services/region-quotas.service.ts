import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { Organization } from '@api/organization/entities/organization.entity'
import { SandboxClass } from '@api/sandbox/enums/sandbox-class.enum'
import { Region } from '@api/region/entities/region.entity'
import { UpdateRegionQuotaDto } from '../dto/update-region-quota.dto'
import { PatchRegionQuotaDto } from '../dto/patch-region-quota.dto'
import { CreateRegionQuotaDto } from '../dto/create-region-quota.dto'
import { updateWithPreconditions } from '../../common/preconditions.util'

@Injectable()
export class RegionQuotasService {
  constructor(
    @InjectRepository(RegionQuota)
    private readonly regionQuotaRepository: Repository<RegionQuota>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
  ) {}

  /** Regions a quota can target, for pickers in the dashboard. */
  async listRegions(): Promise<Pick<Region, 'id' | 'name'>[]> {
    return this.regionRepository.find({ select: { id: true, name: true }, order: { name: 'ASC' } })
  }

  /**
   * Create a new region quota for an organization/region pair.
   */
  async create(dto: CreateRegionQuotaDto): Promise<RegionQuota> {
    const organization = await this.organizationRepository.findOne({ where: { id: dto.organizationId } })
    if (!organization) {
      throw new NotFoundException(`Organization ${dto.organizationId} not found`)
    }

    const region = await this.regionRepository.findOne({ where: { id: dto.regionId } })
    if (!region) {
      throw new NotFoundException(`Region ${dto.regionId} not found`)
    }

    const sandboxClass = dto.sandboxClass ?? SandboxClass.CONTAINER

    const existing = await this.regionQuotaRepository.findOne({
      where: { organizationId: dto.organizationId, regionId: dto.regionId, sandboxClass },
    })
    if (existing) {
      throw new ConflictException(
        `Region quota already exists for organization ${dto.organizationId}, region ${dto.regionId} and sandbox class ${sandboxClass}`,
      )
    }

    const perSandboxFieldsExceedTotals: string[] = []
    if (dto.maxCpuPerSandbox != null && dto.maxCpuPerSandbox > dto.totalCpuQuota) {
      perSandboxFieldsExceedTotals.push(
        `maxCpuPerSandbox (${dto.maxCpuPerSandbox}) cannot exceed totalCpuQuota (${dto.totalCpuQuota})`,
      )
    }
    if (dto.maxMemoryPerSandbox != null && dto.maxMemoryPerSandbox > dto.totalMemoryQuota) {
      perSandboxFieldsExceedTotals.push(
        `maxMemoryPerSandbox (${dto.maxMemoryPerSandbox}) cannot exceed totalMemoryQuota (${dto.totalMemoryQuota})`,
      )
    }
    if (dto.maxDiskPerSandbox != null && dto.maxDiskPerSandbox > dto.totalDiskQuota) {
      perSandboxFieldsExceedTotals.push(
        `maxDiskPerSandbox (${dto.maxDiskPerSandbox}) cannot exceed totalDiskQuota (${dto.totalDiskQuota})`,
      )
    }
    if (perSandboxFieldsExceedTotals.length) {
      throw new BadRequestException({ message: perSandboxFieldsExceedTotals })
    }

    const regionQuota = new RegionQuota({
      organizationId: dto.organizationId,
      regionId: dto.regionId,
      sandboxClass,
      totalCpuQuota: dto.totalCpuQuota,
      totalMemoryQuota: dto.totalMemoryQuota,
      totalDiskQuota: dto.totalDiskQuota,
      totalGpuQuota: dto.totalGpuQuota ?? 0,
      maxCpuPerSandbox: dto.maxCpuPerSandbox ?? null,
      maxMemoryPerSandbox: dto.maxMemoryPerSandbox ?? null,
      maxDiskPerSandbox: dto.maxDiskPerSandbox ?? null,
      maxDiskPerNonEphemeralSandbox: dto.maxDiskPerNonEphemeralSandbox ?? null,
    })

    try {
      return await this.regionQuotaRepository.save(regionQuota)
    } catch (error) {
      // PostgreSQL unique violation — primary key conflict between the pre-check and the save.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          `Region quota already exists for organization ${dto.organizationId}, region ${dto.regionId} and sandbox class ${sandboxClass}`,
        )
      }
      throw error
    }
  }

  /**
   * Update a single region quota
   */
  async update(
    organizationId: string,
    regionId: string,
    patchData: PatchRegionQuotaDto,
  ): Promise<{ regionQuota: RegionQuota; warnings: string[] }> {
    const sandboxClass = patchData.sandboxClass ?? SandboxClass.CONTAINER

    const regionQuota = await this.regionQuotaRepository.findOne({
      where: { organizationId, regionId, sandboxClass },
      relations: ['organization'],
    })

    if (!regionQuota) {
      throw new NotFoundException(
        `Region quota not found for organization ${organizationId}, region ${regionId} and sandbox class ${sandboxClass}`,
      )
    }

    const updateData = patchData.updates

    const warnings = this.validateUpdate(regionQuota, updateData)

    // Atomic update: UPDATE ... SET updates WHERE (composite key) AND preconditions
    const updated = await updateWithPreconditions(
      this.regionQuotaRepository,
      { organizationId, regionId, sandboxClass },
      updateData,
      patchData.preconditions,
    )

    return { regionQuota: updated, warnings }
  }

  /**
   * Validate region quota updates and return warnings
   */
  private validateUpdate(regionQuota: RegionQuota, updateData: UpdateRegionQuotaDto): string[] {
    const warnings: string[] = []

    // Warn if reducing quotas significantly
    if (updateData.totalCpuQuota !== undefined && updateData.totalCpuQuota < regionQuota.totalCpuQuota / 2) {
      warnings.push(
        `Reducing totalCpuQuota from ${regionQuota.totalCpuQuota} to ${updateData.totalCpuQuota} (>50% reduction) may affect running sandboxes`,
      )
    }

    if (updateData.totalMemoryQuota !== undefined && updateData.totalMemoryQuota < regionQuota.totalMemoryQuota / 2) {
      warnings.push(
        `Reducing totalMemoryQuota from ${regionQuota.totalMemoryQuota} to ${updateData.totalMemoryQuota} (>50% reduction) may affect running sandboxes`,
      )
    }

    if (updateData.totalDiskQuota !== undefined && updateData.totalDiskQuota < regionQuota.totalDiskQuota / 2) {
      warnings.push(
        `Reducing totalDiskQuota from ${regionQuota.totalDiskQuota} to ${updateData.totalDiskQuota} (>50% reduction) may affect running sandboxes`,
      )
    }

    // Warn if setting very low quotas
    if (updateData.totalCpuQuota !== undefined && updateData.totalCpuQuota < 1) {
      warnings.push('totalCpuQuota is less than 1 - this may prevent any sandboxes from being created')
    }

    if (updateData.totalMemoryQuota !== undefined && updateData.totalMemoryQuota < 1) {
      warnings.push('totalMemoryQuota is less than 1GB - this may prevent any sandboxes from being created')
    }

    if (updateData.totalDiskQuota !== undefined && updateData.totalDiskQuota < 1) {
      warnings.push('totalDiskQuota is less than 1GB - this may prevent any sandboxes from being created')
    }

    // Per-sandbox caps shouldn't exceed the region total
    const maxCpu = updateData.maxCpuPerSandbox ?? regionQuota.maxCpuPerSandbox
    const totalCpu = updateData.totalCpuQuota ?? regionQuota.totalCpuQuota
    if (maxCpu != null && maxCpu > totalCpu) {
      warnings.push(`maxCpuPerSandbox (${maxCpu}) exceeds totalCpuQuota (${totalCpu}); the lower bound applies`)
    }

    const maxMem = updateData.maxMemoryPerSandbox ?? regionQuota.maxMemoryPerSandbox
    const totalMem = updateData.totalMemoryQuota ?? regionQuota.totalMemoryQuota
    if (maxMem != null && maxMem > totalMem) {
      warnings.push(`maxMemoryPerSandbox (${maxMem}) exceeds totalMemoryQuota (${totalMem}); the lower bound applies`)
    }

    const maxDisk = updateData.maxDiskPerSandbox ?? regionQuota.maxDiskPerSandbox
    const totalDisk = updateData.totalDiskQuota ?? regionQuota.totalDiskQuota
    if (maxDisk != null && maxDisk > totalDisk) {
      warnings.push(`maxDiskPerSandbox (${maxDisk}) exceeds totalDiskQuota (${totalDisk}); the lower bound applies`)
    }

    return warnings
  }
}
