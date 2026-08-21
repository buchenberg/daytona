import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { config } from '../../config/env'
import { DrainStatusDto, ProdRunnerDto, SandboxStateCountDto } from '../dto/fleet-runner.dto'

// One field list drives both the SELECT and the response shape; the main app's
// `runner` table uses camelCase column names, which need quoting in SQL.
const RUNNER_FIELDS: readonly (keyof ProdRunnerDto)[] = [
  'id',
  'domain',
  'region',
  'state',
  'unschedulable',
  'draining',
  'availabilityScore',
  'sandboxClass',
  'cpu',
  'memoryGiB',
  'diskGiB',
  'gpu',
  'gpuType',
  'currentCpuUsagePercentage',
  'currentMemoryUsagePercentage',
  'currentDiskUsagePercentage',
  'currentAllocatedCpu',
  'currentStartedSandboxes',
  'currentSnapshotCount',
  'lastChecked',
  'appVersion',
  'createdAt',
]

const RUNNER_COLUMNS = RUNNER_FIELDS.map((field) => (/[A-Z]/.test(field) ? `"${field}"` : field)).join(', ')

const NUMERIC_FIELDS: readonly (keyof ProdRunnerDto)[] = [
  'availabilityScore',
  'cpu',
  'memoryGiB',
  'diskGiB',
  'gpu',
  'currentCpuUsagePercentage',
  'currentMemoryUsagePercentage',
  'currentDiskUsagePercentage',
  'currentAllocatedCpu',
  'currentStartedSandboxes',
  'currentSnapshotCount',
]

/** pg returns numeric/bigint columns as strings; the API contract promises numbers. */
function toProdRunner(row: ProdRunnerDto): ProdRunnerDto {
  const raw = row as unknown as Record<string, unknown>
  for (const field of NUMERIC_FIELDS) {
    if (raw[field] != null) raw[field] = Number(raw[field])
  }
  return row
}

/**
 * Read-only queries against the main app's runner/sandbox tables (the default
 * connection). Raw SQL on purpose: aggregate FILTER queries read better than
 * query-builder gymnastics, and nothing here ever writes.
 */
@Injectable()
export class ProdRunnersService {
  constructor(
    @InjectDataSource()
    private readonly mainDb: DataSource,
  ) {}

  async runnersByDomains(domains: string[]): Promise<Map<string, ProdRunnerDto>> {
    if (domains.length === 0) return new Map()
    const rows: ProdRunnerDto[] = await this.mainDb.query(
      `SELECT ${RUNNER_COLUMNS} FROM runner WHERE domain = ANY($1)`,
      [domains],
    )
    return new Map(rows.map((r) => [r.domain as string, toProdRunner(r)]))
  }

  /**
   * Fleet-domain prod runners the inventory doesn't know about (for
   * discrepancy checks). Restricted to the fleet domain suffix: BYOC and
   * customer custom-region runners are customer infrastructure, not drift.
   */
  async runnersOutsideDomains(domains: string[]): Promise<ProdRunnerDto[]> {
    const rows: ProdRunnerDto[] = await this.mainDb.query(
      `SELECT ${RUNNER_COLUMNS} FROM runner WHERE domain LIKE $2 AND NOT (domain = ANY($1)) ORDER BY domain`,
      [domains, `%.${config.fleet.runnerDomainSuffix}`],
    )
    return rows.map(toProdRunner)
  }

  /** Active (not destroyed/archived) sandbox counts per runner domain, one round trip. */
  async activeSandboxCounts(domains: string[]): Promise<Map<string, number>> {
    if (domains.length === 0) return new Map()
    const rows: { domain: string; count: string }[] = await this.mainDb.query(
      `SELECT r.domain, count(*) AS count
         FROM sandbox s
         JOIN runner r ON r.id = s."runnerId"
        WHERE r.domain = ANY($1) AND s.state NOT IN ('destroyed', 'archived')
        GROUP BY r.domain`,
      [domains],
    )
    return new Map(rows.map((r) => [r.domain, Number(r.count)]))
  }

  async sandboxStateBreakdown(domain: string): Promise<SandboxStateCountDto[]> {
    const rows: { state: string; count: string }[] = await this.mainDb.query(
      `SELECT s.state, count(*) AS count
         FROM sandbox s
         JOIN runner r ON r.id = s."runnerId"
        WHERE r.domain = $1
        GROUP BY s.state
        ORDER BY count DESC`,
      [domain],
    )
    return rows.map((r) => ({ state: r.state, count: Number(r.count) }))
  }

  /**
   * Drain progress per domain. Mirrors the main app's decommission check:
   * a runner is fully drained when no sandbox on it has desiredState != destroyed.
   * Only domains with a production runner are returned, so callers can tell
   * "evacuated" apart from "not registered in production at all".
   */
  async drainStatus(domains: string[]): Promise<Map<string, DrainStatusDto>> {
    if (domains.length === 0) return new Map()
    const rows: { domain: string; remaining: string; started: string; stoppedwithoutbackup: string }[] =
      await this.mainDb.query(
        `SELECT r.domain,
                count(*) FILTER (WHERE s."desiredState" != 'destroyed') AS remaining,
                count(*) FILTER (WHERE s.state = 'started') AS started,
                count(*) FILTER (WHERE s.state = 'stopped' AND s."backupState" != 'Completed') AS stoppedWithoutBackup
           FROM runner r
           LEFT JOIN sandbox s ON s."runnerId" = r.id
          WHERE r.domain = ANY($1)
          GROUP BY r.domain`,
        [domains],
      )
    return new Map(
      rows.map((r) => [
        r.domain,
        {
          remaining: Number(r.remaining),
          started: Number(r.started),
          stoppedWithoutBackup: Number(r.stoppedwithoutbackup),
        },
      ]),
    )
  }
}
