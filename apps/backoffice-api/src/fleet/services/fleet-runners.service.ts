import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { FleetRunner } from '../../backoffice-db/entities/fleet-runner.entity'
import {
  ALLOWED_TRANSITIONS,
  MaintenanceRequest,
  OPEN_STATUSES,
} from '../../backoffice-db/entities/maintenance-request.entity'
import {
  DiscrepancyDto,
  DiscrepancyKind,
  FleetFilterOptionsDto,
  FleetRunnerDetailDto,
  FleetRunnerDto,
  FleetRunnerFiltersDto,
  FleetRunnerSearchResponseDto,
  SearchFleetRunnersDto,
} from '../dto'
import { ProdRunnersService } from './prod-runners.service'
import { RunnerEventsService } from './runner-events.service'

// The merged view sorts on fields from two databases, so sorting happens in
// memory over the full (small, ~1k rows) fleet. Keys are comparable values.
const SORT_KEYS: Record<string, (r: FleetRunnerDto) => string | number | null> = {
  name: (r) => r.name,
  env: (r) => r.env,
  provider: (r) => r.provider,
  tenant: (r) => r.tenant,
  provisionedAt: (r) => r.provisionedAt?.getTime() ?? null,
  activeSandboxes: (r) => r.activeSandboxes,
  openRequests: (r) => r.openRequests,
  prodState: (r) => r.prod?.state ?? null,
  availabilityScore: (r) => r.prod?.availabilityScore ?? null,
  cpuUsage: (r) => r.prod?.currentCpuUsagePercentage ?? null,
  memoryUsage: (r) => r.prod?.currentMemoryUsagePercentage ?? null,
  diskUsage: (r) => r.prod?.currentDiskUsagePercentage ?? null,
}

@Injectable()
export class FleetRunnersService {
  constructor(
    @InjectRepository(FleetRunner, 'backoffice')
    private readonly fleetRunners: Repository<FleetRunner>,
    @InjectRepository(MaintenanceRequest, 'backoffice')
    private readonly requests: Repository<MaintenanceRequest>,
    private readonly prod: ProdRunnersService,
    private readonly events: RunnerEventsService,
  ) {}

  async search(dto: SearchFleetRunnersDto): Promise<FleetRunnerSearchResponseDto> {
    const { filters = {}, pagination = {}, sort = {} } = dto
    // The shared SortDto defaults field to 'createdAt', which this merged view
    // doesn't expose — treat it as "unsorted" and fall back to name.
    const sortField = sort.field && sort.field !== 'createdAt' ? sort.field : 'name'
    const sortKey = SORT_KEYS[sortField]
    if (!sortKey) throw new BadRequestException(`Invalid sort field: ${sortField}`)

    const matched = (await this.mergedFleet(filters.includeRemoved ?? false)).filter((r) => matches(r, filters))

    const direction = sort.order === 'desc' ? -1 : 1
    matched.sort((a, b) => direction * compare(sortKey(a), sortKey(b)) || a.name.localeCompare(b.name))

    const page = pagination.page ?? 1
    const pageSize = pagination.pageSize ?? 25
    return {
      success: true,
      data: { runners: matched.slice((page - 1) * pageSize, page * pageSize) },
      pagination: { page, pageSize, total: matched.length, totalPages: Math.ceil(matched.length / pageSize) },
    }
  }

  async filterOptions(): Promise<FleetFilterOptionsDto> {
    const runners = await this.mergedFleet(false)
    return {
      envs: distinct(runners.map((r) => r.env)),
      providers: distinct(runners.map((r) => r.provider)),
      invRegions: distinct(runners.map((r) => r.region ?? r.location)),
      prodRegions: distinct(runners.map((r) => r.prod?.region ?? null)),
      tenants: distinct(runners.map((r) => r.tenant)),
    }
  }

  async detail(name: string): Promise<FleetRunnerDetailDto> {
    const runner = await this.fleetRunners.findOneBy({ name })
    if (!runner) throw new NotFoundException(`Unknown runner: ${name}`)

    const domains = runner.domain ? [runner.domain] : []
    const [prodByDomain, drainByDomain, sandboxStates, requests, events] = await Promise.all([
      this.prod.runnersByDomains(domains),
      this.prod.drainStatus(domains),
      runner.domain ? this.prod.sandboxStateBreakdown(runner.domain) : Promise.resolve([]),
      this.requests
        .createQueryBuilder('request')
        .where(':name = ANY(request.runner_names)', { name })
        .orderBy('request.created_at', 'DESC')
        .getMany(),
      this.events.forRunner(name),
    ])

    const activeSandboxes = sandboxStates
      .filter((s) => !['destroyed', 'archived'].includes(s.state))
      .reduce((sum, s) => sum + s.count, 0)
    return {
      ...this.toDto(runner, prodByDomain, new Map(), new Map()),
      activeSandboxes,
      openRequests: requests.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      sandboxStates,
      drain: (runner.domain && drainByDomain.get(runner.domain)) || null,
      requests: requests.map((r) => ({ ...r, allowedTransitions: ALLOWED_TRANSITIONS[r.status] })),
      events,
    }
  }

  /** Where inventory and production disagree — the "something is off" panel. */
  async discrepancies(): Promise<DiscrepancyDto[]> {
    const runners = await this.fleetRunners.find({ where: { removedAt: IsNull() } })
    const domains = runners.map((r) => r.domain).filter((d): d is string => !!d)
    const [prodByDomain, prodOnly, sandboxCounts] = await Promise.all([
      this.prod.runnersByDomains(domains),
      this.prod.runnersOutsideDomains(domains),
      this.prod.activeSandboxCounts(domains),
    ])

    const found: DiscrepancyDto[] = []
    for (const runner of runners) {
      if (runner.env !== 'prod') continue
      const prod = runner.domain ? prodByDomain.get(runner.domain) : undefined
      if (!prod) {
        if (runner.enabled) {
          found.push({
            kind: DiscrepancyKind.NOT_IN_PROD,
            runnerName: runner.name,
            domain: runner.domain ?? null,
            detail: 'Enabled in inventory but not registered in production',
          })
        }
        continue
      }
      if (!runner.enabled && prod.state === 'ready' && !prod.unschedulable && !prod.draining) {
        const active = (runner.domain && sandboxCounts.get(runner.domain)) || 0
        found.push({
          kind: DiscrepancyKind.DISABLED_BUT_ACTIVE,
          runnerName: runner.name,
          domain: runner.domain ?? null,
          detail: `Disabled in inventory but still schedulable in production (${active} active sandboxes)`,
        })
      }
      if (prod.state === 'unresponsive') {
        found.push({
          kind: DiscrepancyKind.UNRESPONSIVE,
          runnerName: runner.name,
          domain: runner.domain ?? null,
          detail: `Unresponsive in production, last heartbeat ${prod.lastChecked?.toISOString() ?? 'never'}`,
        })
      }
    }
    for (const prod of prodOnly) {
      if (prod.state === 'decommissioned') continue
      found.push({
        kind: DiscrepancyKind.PROD_ONLY,
        runnerName: null,
        domain: prod.domain,
        detail: `In production (${prod.state}) but missing from the inventory`,
      })
    }
    return found
  }

  private async mergedFleet(includeRemoved: boolean): Promise<FleetRunnerDto[]> {
    const runners = await this.fleetRunners.find({
      where: includeRemoved ? {} : { removedAt: IsNull() },
      order: { name: 'ASC' },
    })
    const domains = runners.map((r) => r.domain).filter((d): d is string => !!d)
    const [prodByDomain, sandboxCounts, openRequestCounts] = await Promise.all([
      this.prod.runnersByDomains(domains),
      this.prod.activeSandboxCounts(domains),
      this.openRequestCounts(),
    ])
    return runners.map((r) => this.toDto(r, prodByDomain, sandboxCounts, openRequestCounts))
  }

  private toDto(
    runner: FleetRunner,
    prodByDomain: Map<string, FleetRunnerDto['prod']>,
    sandboxCounts: Map<string, number>,
    openRequestCounts: Map<string, number>,
  ): FleetRunnerDto {
    return {
      name: runner.name,
      source: runner.source,
      enabled: runner.enabled,
      env: runner.env,
      provider: runner.provider ?? null,
      serverType: runner.serverType ?? null,
      os: runner.os ?? null,
      ip: runner.ip ?? null,
      geo: runner.geo ?? null,
      region: runner.region ?? null,
      location: runner.location ?? null,
      model: runner.model ?? null,
      nicSpeed: runner.nicSpeed ?? null,
      monthlyCost: runner.monthlyCost ?? null,
      hourlyCost: runner.hourlyCost ?? null,
      tenant: runner.tenant ?? null,
      gpu: runner.gpu,
      groups: runner.groups,
      domain: runner.domain ?? null,
      provisionedAt: runner.provisionedAt ?? null,
      removedAt: runner.removedAt ?? null,
      lastSyncAt: runner.lastSyncAt,
      prod: (runner.domain && prodByDomain.get(runner.domain)) || null,
      activeSandboxes: (runner.domain && sandboxCounts.get(runner.domain)) || 0,
      openRequests: openRequestCounts.get(runner.name) ?? 0,
    }
  }

  private async openRequestCounts(): Promise<Map<string, number>> {
    const open = await this.requests
      .createQueryBuilder('request')
      .where('request.status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .getMany()
    const counts = new Map<string, number>()
    for (const request of open) {
      for (const name of request.runnerNames) {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
    return counts
  }
}

function matches(runner: FleetRunnerDto, filters: FleetRunnerFiltersDto): boolean {
  if (filters.search) {
    const needle = filters.search.toLowerCase()
    const haystack = [runner.name, runner.ip, runner.domain]
    if (!haystack.some((v) => v?.toLowerCase().includes(needle))) return false
  }
  if (filters.env && runner.env !== filters.env) return false
  if (filters.provider && runner.provider !== filters.provider) return false
  if (filters.invRegion && (runner.region ?? runner.location) !== filters.invRegion) return false
  if (filters.prodRegion && runner.prod?.region !== filters.prodRegion) return false
  if (filters.tenant && runner.tenant !== filters.tenant) return false
  if (filters.prodState && (runner.prod?.state ?? 'missing') !== filters.prodState) return false
  if (filters.enabledOnly && !runner.enabled) return false
  if (filters.gpuOnly && !runner.gpu) return false
  return true
}

function compare(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b)
  return (a as number) - (b as number)
}

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort()
}
