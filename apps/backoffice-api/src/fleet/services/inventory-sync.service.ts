import { Injectable, InternalServerErrorException, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import * as path from 'path'
import { Repository } from 'typeorm'
import { config } from '../../config/env'
import { FleetRunner } from '../../backoffice-db/entities/fleet-runner.entity'
import { RunnerEvent, RunnerEventType } from '../../backoffice-db/entities/runner-event.entity'
import { SyncStatusDto } from '../dto'
import { hostEnv, InventoryHost, parseInventoryDir } from './inventory-parser'
import { PlaybookRepoService } from './playbook-repo.service'
import { RunnerEventEntry } from './runner-events.service'

/**
 * Mirrors the playbook inventory into fleet_runner on an interval, recording
 * runner events for adds/disables/removals so the timeline stays complete.
 *
 * Assumes a single replica: the sync status and the running-guard are held
 * in memory, and concurrent syncs from two replicas could duplicate events.
 */
@Injectable()
export class InventorySyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InventorySyncService.name)
  private running = false
  private status: SyncStatusDto = {
    state: 'never_ran',
    startedAt: null,
    finishedAt: null,
    commit: null,
    error: null,
    hosts: 0,
    added: 0,
    removed: 0,
  }

  constructor(
    @InjectRepository(FleetRunner, 'backoffice')
    private readonly fleetRunners: Repository<FleetRunner>,
    private readonly repo: PlaybookRepoService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    if (config.skipConnections) return // openapi generation boots the app without databases
    if (!config.fleet.inventory.repoUrl && !config.fleet.inventory.localPath) {
      this.logger.warn('Fleet inventory sync disabled: no FLEET_INVENTORY_REPO_URL or FLEET_INVENTORY_LOCAL_PATH')
      return
    }
    const run = () => void this.sync().catch(() => undefined) // sync() already logs
    const intervalMs = config.fleet.inventory.syncIntervalMinutes * 60_000
    this.scheduler.addInterval('fleet-inventory-sync', setInterval(run, intervalMs))
    run()
  }

  getStatus(): SyncStatusDto {
    return this.status
  }

  async sync(): Promise<SyncStatusDto> {
    if (this.running) return this.status
    this.running = true
    this.status = { ...this.status, state: 'running', startedAt: new Date(), error: null }

    try {
      const repoPath = await this.repo.refresh()
      const commit = await this.repo.headCommit(repoPath)
      const parsed = await this.collectHosts(repoPath)
      const { added, removed } = await this.persist(parsed)

      this.status = {
        state: 'ok',
        startedAt: this.status.startedAt,
        finishedAt: new Date(),
        commit,
        error: null,
        hosts: parsed.length,
        added,
        removed,
      }
      this.logger.log(`Synced ${parsed.length} hosts (${added} added, ${removed} removed) at ${commit ?? 'no-git'}`)
    } catch (error) {
      // Include git's stderr (execFile drops it from the message) — it holds
      // the actual failure reason (auth, DNS, missing branch, ...)
      const stderr = (error as { stderr?: string }).stderr
      const raw = stderr ? `${String(error)}\n${stderr}` : String(error)
      // Git errors echo the remote URL, which may embed a credential
      const repoUrl = config.fleet.inventory.repoUrl
      const message = repoUrl ? raw.replaceAll(repoUrl, '<inventory-repo>') : raw
      this.status = { ...this.status, state: 'error', finishedAt: new Date(), error: message }
      this.logger.error(`Inventory sync failed: ${message}`)
      // HttpException so the manual-trigger endpoint surfaces the (redacted) reason
      throw new InternalServerErrorException(message)
    } finally {
      this.running = false
    }
    return this.status
  }

  private async collectHosts(repoPath: string): Promise<FleetRunner[]> {
    const now = new Date()
    const byName = new Map<string, FleetRunner>()

    for (const root of config.fleet.inventory.roots) {
      const inventoryDir = path.join(repoPath, root, 'inventory')
      const provisionDates = await this.repo.provisionDates(repoPath, root)

      for (const host of parseInventoryDir(inventoryDir)) {
        // [api] hosts are control-plane nodes, not sandbox runners
        if (host.groups.includes('api')) continue
        if (byName.has(host.name)) {
          this.logger.warn(`Duplicate host ${host.name} in ${root}, keeping first occurrence`)
          continue
        }
        byName.set(host.name, this.toFleetRunner(host, root, repoPath, provisionDates.get(host.name) ?? null, now))
      }
    }
    return [...byName.values()]
  }

  private toFleetRunner(
    host: InventoryHost,
    root: string,
    repoPath: string,
    provisionedAt: Date | null,
    now: Date,
  ): FleetRunner {
    const env = hostEnv(host)
    const vars = host.vars
    const suffix = config.fleet.runnerDomainSuffix
    const fallbackDomain = env === 'prod' ? `${host.name}.${suffix}` : `${host.name}.${env}.${suffix}`

    return this.fleetRunners.create({
      name: host.name,
      source: root,
      enabled: host.enabled,
      env,
      provider: vars.provider ?? null,
      serverType: vars.server_type ?? null,
      os: vars.os ?? null,
      ip: vars.ansible_host ?? null,
      geo: vars.geo ?? null,
      region: vars.region ?? null,
      location: vars.location || null,
      model: vars.model || null,
      nicSpeed: vars.nic_speed ?? null,
      monthlyCost: parseCost(vars.monthly_cost),
      hourlyCost: parseCost(vars.hourly_cost),
      tenant: vars.tenant ?? null,
      gpu: vars.gpu === 'true',
      groups: host.groups,
      domain: this.repo.readDomain(repoPath, root, host.name) ?? fallbackDomain,
      provisionedAt,
      removedAt: null,
      lastSyncAt: now,
    })
  }

  private async persist(parsed: FleetRunner[]): Promise<{ added: number; removed: number }> {
    const existing = new Map((await this.fleetRunners.find()).map((r) => [r.name, r]))
    const events: RunnerEventEntry[] = []

    for (const runner of parsed) {
      const previous = existing.get(runner.name)
      // A failed/absent git log must not erase an already-recorded provision date
      if (previous && !runner.provisionedAt) runner.provisionedAt = previous.provisionedAt
      if (!previous) {
        events.push(event(runner.name, RunnerEventType.INVENTORY_ADDED, `Added to inventory (${runner.source})`))
      } else if (previous.removedAt) {
        events.push(event(runner.name, RunnerEventType.INVENTORY_ADDED, 'Re-added to inventory'))
      } else if (previous.enabled !== runner.enabled) {
        events.push(
          runner.enabled
            ? event(runner.name, RunnerEventType.INVENTORY_ENABLED, 'Host line uncommented in inventory')
            : event(runner.name, RunnerEventType.INVENTORY_DISABLED, 'Host line commented out in inventory'),
        )
      }
    }

    const parsedNames = new Set(parsed.map((r) => r.name))
    const removed = [...existing.values()].filter((r) => !parsedNames.has(r.name) && !r.removedAt)
    for (const runner of removed) {
      runner.removedAt = new Date()
      events.push(event(runner.name, RunnerEventType.INVENTORY_REMOVED, 'Removed from inventory'))
    }

    // One transaction so a runner change is never committed without its events
    await this.fleetRunners.manager.transaction(async (em) => {
      await em.getRepository(FleetRunner).save([...parsed, ...removed], { chunk: 200 })
      const eventRepo = em.getRepository(RunnerEvent)
      await eventRepo.save(events.map((entry) => eventRepo.create({ requestId: null, ...entry })))
    })

    const added = events.filter((e) => e.type === RunnerEventType.INVENTORY_ADDED).length
    return { added, removed: removed.length }
  }
}

function event(runnerName: string, type: RunnerEventType, message: string): RunnerEventEntry {
  return { runnerName, type, message, actor: 'system' }
}

function parseCost(value: string | undefined): string | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null
}
