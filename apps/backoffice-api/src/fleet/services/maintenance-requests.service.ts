import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { config } from '../../config/env'
import { FleetRunner } from '../../backoffice-db/entities/fleet-runner.entity'
import {
  ALLOWED_TRANSITIONS,
  MaintenanceRequest,
  MaintenanceStatus,
  TERMINAL_STATUSES,
} from '../../backoffice-db/entities/maintenance-request.entity'
import { RunnerEvent, RunnerEventType } from '../../backoffice-db/entities/runner-event.entity'
import {
  CreateMaintenanceRequestDto,
  MaintenanceRequestDetailDto,
  MaintenanceRequestDto,
  RunnerProgressDto,
  TransitionMaintenanceRequestDto,
  UpdateMaintenanceRequestDto,
} from '../dto'
import { ProdRunnersService } from './prod-runners.service'
import { RunnerEventsService } from './runner-events.service'

function toDto(request: MaintenanceRequest): MaintenanceRequestDto {
  return { ...request, allowedTransitions: ALLOWED_TRANSITIONS[request.status] }
}

@Injectable()
export class MaintenanceRequestsService {
  private readonly logger = new Logger(MaintenanceRequestsService.name)

  constructor(
    @InjectRepository(MaintenanceRequest, 'backoffice')
    private readonly requests: Repository<MaintenanceRequest>,
    @InjectRepository(FleetRunner, 'backoffice')
    private readonly fleetRunners: Repository<FleetRunner>,
    private readonly prod: ProdRunnersService,
    private readonly events: RunnerEventsService,
  ) {}

  /** Incoming requests nobody has acknowledged yet — feeds the notifications tab. */
  async listIncoming(): Promise<{ items: MaintenanceRequestDto[]; total: number }> {
    const items = await this.requests.find({
      where: { status: MaintenanceStatus.REQUESTED },
      order: { createdAt: 'DESC' },
    })
    return { items: items.map(toDto), total: items.length }
  }

  async create(dto: CreateMaintenanceRequestDto, actor: string): Promise<MaintenanceRequestDto> {
    const known = await this.fleetRunners.findBy({ name: In(dto.runnerNames) })
    const unknown = dto.runnerNames.filter((name) => !known.some((r) => r.name === name))
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown runners: ${unknown.join(', ')}`)
    }

    const request = await this.requests.save(
      this.requests.create({
        title: dto.title,
        description: dto.description ?? '',
        type: dto.type,
        runnerNames: dto.runnerNames,
        requestedBy: dto.requestedBy,
        createdBy: actor,
        priority: dto.priority ?? 2,
      }),
    )

    await this.events.recordMany(
      dto.runnerNames.map((runnerName) => ({
        runnerName,
        type: RunnerEventType.REQUEST_CREATED,
        message: `${dto.type} requested by ${dto.requestedBy}: ${dto.title}`,
        actor,
        requestId: request.id,
      })),
    )
    return toDto(request)
  }

  async detail(id: string): Promise<MaintenanceRequestDetailDto> {
    const request = await this.get(id)
    const [progress, events] = await Promise.all([this.progress(request), this.events.forRequest(id)])
    return { ...toDto(request), progress, events }
  }

  async update(id: string, dto: UpdateMaintenanceRequestDto): Promise<MaintenanceRequestDto> {
    const request = await this.get(id)
    Object.assign(request, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
    })
    return toDto(await this.requests.save(request))
  }

  async transition(id: string, dto: TransitionMaintenanceRequestDto, actor: string): Promise<MaintenanceRequestDto> {
    const request = await this.get(id)
    if (!ALLOWED_TRANSITIONS[request.status].includes(dto.status)) {
      throw new BadRequestException(`Cannot go from ${request.status} to ${dto.status}`)
    }
    // Manual draining -> ready must pass the same evacuation gate the cron enforces
    if (request.status === MaintenanceStatus.DRAINING && dto.status === MaintenanceStatus.READY_FOR_MAINTENANCE) {
      const progress = await this.progress(request)
      const notDrained = progress.filter((p) => !p.drained).map((p) => p.name)
      if (progress.length === 0 || notDrained.length > 0) {
        throw new BadRequestException(`Not all targeted runners are drained yet: ${notDrained.join(', ')}`)
      }
    }
    return toDto(await this.applyTransition(request, dto.status, actor, dto.comment))
  }

  async addNote(id: string, message: string, actor: string): Promise<RunnerEvent> {
    await this.get(id)
    return this.events.record({ runnerName: null, type: RunnerEventType.NOTE, message, actor, requestId: id })
  }

  /**
   * Live drain progress per targeted runner, using the same criterion the
   * main app uses before decommissioning: no sandbox with desiredState
   * other than destroyed may remain.
   */
  async progress(request: MaintenanceRequest): Promise<RunnerProgressDto[]> {
    const runners = await this.fleetRunners.findBy({ name: In(request.runnerNames) })
    const byName = new Map(runners.map((r) => [r.name, r]))
    const domains = runners.map((r) => r.domain).filter((d): d is string => !!d)
    const [prodByDomain, drainByDomain] = await Promise.all([
      this.prod.runnersByDomains(domains),
      this.prod.drainStatus(domains),
    ])

    return request.runnerNames.map((name) => {
      const domain = byName.get(name)?.domain ?? null
      const prod = domain ? prodByDomain.get(domain) : undefined
      const drain = domain ? drainByDomain.get(domain) : undefined
      return {
        name,
        domain,
        prodState: prod?.state ?? null,
        draining: prod?.draining ?? false,
        unschedulable: prod?.unschedulable ?? false,
        remaining: drain?.remaining ?? 0,
        started: drain?.started ?? 0,
        stoppedWithoutBackup: drain?.stoppedWithoutBackup ?? 0,
        // Zero remaining sandboxes only counts once scheduling is off, or a
        // new sandbox could still land on the runner after the check.
        drained: !!prod && (prod.draining || prod.unschedulable) && (drain?.remaining ?? 0) === 0,
      }
    })
  }

  /** Advances 'draining' requests to 'ready_for_maintenance' once evacuated. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'fleet-auto-advance-drains' })
  async autoAdvanceDrains(): Promise<void> {
    if (config.skipConnections) return
    const draining = await this.requests.findBy({ status: MaintenanceStatus.DRAINING })
    for (const request of draining) {
      try {
        const progress = await this.progress(request)
        if (progress.length > 0 && progress.every((p) => p.drained)) {
          await this.applyTransition(
            request,
            MaintenanceStatus.READY_FOR_MAINTENANCE,
            'system',
            'All targeted runners are fully drained',
          )
          this.logger.log(`Request ${request.id} (${request.title}) is ready for maintenance`)
        }
      } catch (error) {
        this.logger.error(`Auto-advance failed for request ${request.id}: ${error}`)
      }
    }
  }

  private async get(id: string): Promise<MaintenanceRequest> {
    const request = await this.requests.findOneBy({ id })
    if (!request) throw new NotFoundException(`Unknown request: ${id}`)
    return request
  }

  /**
   * Conditional update so a concurrent transition (user cancel vs the
   * auto-advance cron) cannot overwrite an already-moved request.
   */
  private async applyTransition(
    request: MaintenanceRequest,
    status: MaintenanceStatus,
    actor: string,
    comment?: string,
  ): Promise<MaintenanceRequest> {
    const from = request.status
    const result = await this.requests.update(
      { id: request.id, status: from },
      { status, ...(TERMINAL_STATUSES.includes(status) && { closedAt: new Date() }) },
    )
    if (result.affected === 0) {
      throw new BadRequestException(`Request is no longer in status ${from}`)
    }

    const message = `${request.type} request "${request.title}": ${from} -> ${status}${comment ? ` (${comment})` : ''}`
    await this.events.recordMany(
      request.runnerNames.map((runnerName) => ({
        runnerName,
        type: RunnerEventType.REQUEST_STATUS_CHANGED,
        message,
        actor,
        requestId: request.id,
      })),
    )
    return this.get(request.id)
  }
}
