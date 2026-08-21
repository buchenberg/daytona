import { Injectable, Logger } from '@nestjs/common'
import { execFile } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { config } from '../../config/env'

const execFileAsync = promisify(execFile)

/**
 * Local checkout of the workspaces-playbook repo. Either manages its own
 * clone (FLEET_INVENTORY_REPO_URL) or reads a checkout provided from outside
 * (FLEET_INVENTORY_LOCAL_PATH). host_vars files contain API tokens: only the
 * domain_name line is ever read from them.
 */
@Injectable()
export class PlaybookRepoService {
  private readonly logger = new Logger(PlaybookRepoService.name)

  /** Returns the path of an up-to-date checkout. */
  async refresh(): Promise<string> {
    const { repoUrl, branch, localPath, dataDir } = config.fleet.inventory
    if (localPath) return localPath

    if (!repoUrl) {
      throw new Error('Set FLEET_INVENTORY_REPO_URL or FLEET_INVENTORY_LOCAL_PATH')
    }

    if (!fs.existsSync(path.join(dataDir, '.git'))) {
      this.logger.log(`Cloning inventory repo (${branch}) into ${dataDir}`)
      fs.mkdirSync(dataDir, { recursive: true })
      await this.git(path.dirname(dataDir), 'clone', '--single-branch', '--branch', branch, repoUrl, dataDir)
    } else {
      await this.git(dataDir, 'fetch', 'origin', branch)
      await this.git(dataDir, 'reset', '--hard', `origin/${branch}`)
    }
    return dataDir
  }

  async headCommit(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await this.git(repoPath, 'rev-parse', 'HEAD')
      return stdout.trim()
    } catch {
      return null // localPath may be a plain directory without git history
    }
  }

  /**
   * Hostname -> git author date of host_vars/<host>.yml creation, i.e. when
   * the host was first provisioned by the playbook. One git call per root.
   */
  async provisionDates(repoPath: string, root: string): Promise<Map<string, Date>> {
    const dates = new Map<string, Date>()
    let stdout: string
    try {
      ;({ stdout } = await this.git(
        repoPath,
        'log',
        '--diff-filter=A',
        '--format=@%aI',
        '--name-only',
        '--',
        `${root}/host_vars`,
      ))
    } catch {
      return dates // no git history available
    }

    let currentDate: Date | null = null
    for (const line of stdout.split('\n')) {
      if (line.startsWith('@')) {
        currentDate = new Date(line.slice(1))
      } else if (line.endsWith('.yml') && currentDate) {
        const host = path.basename(line, '.yml')
        // Log is newest-first; keep the oldest (original) addition
        dates.set(host, currentDate)
      }
    }
    return dates
  }

  /** domain_name from host_vars/<host>.yml, without touching the api_token in it. */
  readDomain(repoPath: string, root: string, host: string): string | null {
    const file = path.join(repoPath, root, 'host_vars', `${host}.yml`)
    let content: string
    try {
      content = fs.readFileSync(file, 'utf-8')
    } catch {
      return null
    }
    const match = content.match(/^domain_name:\s*['"]?([^'"\s]+)/m)
    return match ? match[1] : null
  }

  private git(cwd: string, ...args: string[]) {
    return execFileAsync('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 })
  }
}
