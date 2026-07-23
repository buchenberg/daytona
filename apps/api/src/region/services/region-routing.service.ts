import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, IsNull, Repository } from 'typeorm'
import { OnEvent } from '@nestjs/event-emitter'
import { Region } from '../entities/region.entity'
import { RegionQuota } from '../../organization/entities/region-quota.entity'
import { TypedConfigService } from '../../config/typed-config.service'
import { areResourcesLargerThanDefault, Resources } from '../../sandbox/utils/resources'
import {
  CODE_DEDICATED_REGIONS_PER_ORGANIZATION,
  LARGE_SANDBOX_ORGS,
  LARGE_SANDBOX_SHARED_REGION,
  RL01_REGION,
  META_LARGE_SANDBOX_CPU_CORES,
  META_LARGE_SANDBOX_DISK_GB,
  META_LARGE_SANDBOX_MEMORY_GB,
  META_LARGE_SANDBOX_ORGS,
  META_LARGE_SANDBOX_REGION,
} from '../../sandbox/constants/dedicated-regions.constant'
import { RegionEvents } from '../constants/region-events.constant'

/**
 * Resolves region routing (base region -> dedicated region), region fallback/spillover targets,
 * and spillover-on-error eligibility from the database.
 *
 * The relevant data (a handful of orgs/regions) is tiny and rarely changes, so it is loaded into
 * in-memory caches on startup and refreshed periodically / on region change events. This keeps the
 * public resolver methods synchronous, since they are called on hot paths (runner assignment,
 * snapshot propagation) that only have a region string to work with.
 */
@Injectable()
export class RegionRoutingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegionRoutingService.name)

  private static readonly REFRESH_INTERVAL_MS = 60_000

  // regionId -> fallback (spillover) regionId
  private fallbackByRegion = new Map<string, string>()
  // `${organizationId}:${baseRegionId}` -> effective (dedicated) regionId
  private effectiveByOrgRegion = new Map<string, string>()
  // organizationId -> set of effective (dedicated) regionIds (DB routing only)
  private dedicatedRegionsByOrg = new Map<string, Set<string>>()
  // effective (dedicated) regionId -> set of organizationIds routed to it
  private orgIdsByEffectiveRegion = new Map<string, Set<string>>()
  // regionIds that may spill over to their fallback on runner error
  private spilloverOnErrorRegions = new Set<string>()

  private refreshTimer?: NodeJS.Timeout

  constructor(
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    @InjectRepository(RegionQuota)
    private readonly regionQuotaRepository: Repository<RegionQuota>,
    private readonly configService: TypedConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh()
    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) => this.logger.error(`Failed to refresh region routing cache: ${err.message}`))
    }, RegionRoutingService.REFRESH_INTERVAL_MS)
    // Don't keep the event loop alive just for the refresh timer.
    this.refreshTimer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
    }
  }

  @OnEvent(RegionEvents.CREATED)
  @OnEvent(RegionEvents.DELETED)
  async onRegionChanged(): Promise<void> {
    try {
      await this.refresh()
    } catch (err) {
      this.logger.error(`Failed to refresh region routing cache after region change: ${err.message}`)
    }
  }

  /**
   * Reloads all routing caches from the database.
   */
  async refresh(): Promise<void> {
    const [regions, routingRows] = await Promise.all([
      this.regionRepository.find({
        select: ['id', 'fallbackRegionId', 'spilloverOnError'],
      }),
      this.regionQuotaRepository.find({
        where: { effectiveRegionId: Not(IsNull()) },
        select: ['organizationId', 'regionId', 'effectiveRegionId'],
      }),
    ])

    const fallbackByRegion = new Map<string, string>()
    const spilloverOnErrorRegions = new Set<string>()
    for (const region of regions) {
      if (region.fallbackRegionId) {
        fallbackByRegion.set(region.id, region.fallbackRegionId)
      }
      if (region.spilloverOnError) {
        spilloverOnErrorRegions.add(region.id)
      }
    }

    const effectiveByOrgRegion = new Map<string, string>()
    const dedicatedRegionsByOrg = new Map<string, Set<string>>()
    const orgIdsByEffectiveRegion = new Map<string, Set<string>>()
    for (const row of routingRows) {
      if (!row.effectiveRegionId) {
        continue
      }
      effectiveByOrgRegion.set(this.routingKey(row.organizationId, row.regionId), row.effectiveRegionId)

      if (!dedicatedRegionsByOrg.has(row.organizationId)) {
        dedicatedRegionsByOrg.set(row.organizationId, new Set())
      }
      dedicatedRegionsByOrg.get(row.organizationId).add(row.effectiveRegionId)

      if (!orgIdsByEffectiveRegion.has(row.effectiveRegionId)) {
        orgIdsByEffectiveRegion.set(row.effectiveRegionId, new Set())
      }
      orgIdsByEffectiveRegion.get(row.effectiveRegionId).add(row.organizationId)
    }

    this.fallbackByRegion = fallbackByRegion
    this.effectiveByOrgRegion = effectiveByOrgRegion
    this.dedicatedRegionsByOrg = dedicatedRegionsByOrg
    this.orgIdsByEffectiveRegion = orgIdsByEffectiveRegion
    this.spilloverOnErrorRegions = spilloverOnErrorRegions
  }

  private routingKey(organizationId: string, baseRegionId: string): string {
    return `${organizationId}:${baseRegionId}`
  }

  /**
   * @returns the dedicated region an org's sandbox should be placed on for a base region,
   * or the base region itself when no dedicated routing applies.
   */
  resolveEffectiveRegion(organizationId: string, baseRegionId: string, resources: Resources): string {
    // GPUs are only available in the `us` region. Meta orgs still get their dedicated region;
    // everything else targeting `eu` is transparently placed on `us` (customer-facing region stays `eu`).
    if (resources.gpu > 0) {
      if (
        baseRegionId === 'us' &&
        this.effectiveByOrgRegion.get(this.routingKey(organizationId, 'us')) === RL01_REGION
      ) {
        return RL01_REGION
      }
      if (baseRegionId === 'eu') {
        return 'us'
      }
      return baseRegionId
    }

    // Large sandboxes for these orgs are pinned to a dedicated region with no fallback and no
    // spillover, regardless of the base region. Must take precedence over the DB routing below.
    if (
      META_LARGE_SANDBOX_ORGS.has(organizationId) &&
      (resources.cpu > META_LARGE_SANDBOX_CPU_CORES ||
        resources.memory > META_LARGE_SANDBOX_MEMORY_GB ||
        resources.disk > META_LARGE_SANDBOX_DISK_GB)
    ) {
      return META_LARGE_SANDBOX_REGION
    }

    // DB-backed routing (e.g. us -> RL01).
    const effectiveRegion = this.effectiveByOrgRegion.get(this.routingKey(organizationId, baseRegionId))
    if (effectiveRegion) {
      return effectiveRegion
    }

    if (LARGE_SANDBOX_ORGS.has(organizationId) && areResourcesLargerThanDefault(this.configService, resources)) {
      return LARGE_SANDBOX_SHARED_REGION
    }

    return baseRegionId
  }

  /**
   * @returns the fallback (spillover) region for the given region, or null if none is configured.
   */
  getFallbackRegion(region: string): string | null {
    return this.fallbackByRegion.get(region) ?? null
  }

  /**
   * @returns true if the region has a fallback (spillover) region configured.
   */
  hasFallbackRegion(region: string): boolean {
    return this.fallbackByRegion.has(region)
  }

  getFallbackRegions(regions: string[]): string[] {
    return regions.map((region) => this.getFallbackRegion(region)).filter((region): region is string => region !== null)
  }

  /**
   * @returns true if sandboxes on this region may retry creation on the fallback region on runner errors.
   */
  isSpilloverOnErrorRegion(region: string): boolean {
    return this.spilloverOnErrorRegions.has(region)
  }

  /**
   * @returns all dedicated regions used by an org, combining DB-backed routing with the
   * resource-conditional / propagation-only mappings that remain in code.
   */
  getDedicatedRegionsForOrg(organizationId: string): string[] {
    const regions = new Set<string>(this.dedicatedRegionsByOrg.get(organizationId) ?? [])
    for (const region of CODE_DEDICATED_REGIONS_PER_ORGANIZATION[organizationId] ?? []) {
      regions.add(region)
    }
    return [...regions]
  }

  /**
   * @returns all org IDs that have at least one dedicated region (DB-backed or code-based).
   */
  getDedicatedRegionOrgIds(): string[] {
    return [...new Set([...this.dedicatedRegionsByOrg.keys(), ...Object.keys(CODE_DEDICATED_REGIONS_PER_ORGANIZATION)])]
  }

  /**
   * @returns the org IDs routed to the given dedicated region via DB-backed routing.
   */
  getOrgIdsRoutedTo(regionId: string): string[] {
    return [...(this.orgIdsByEffectiveRegion.get(regionId) ?? [])]
  }
}
