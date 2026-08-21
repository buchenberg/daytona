import * as fs from 'fs'
import * as path from 'path'

/**
 * Minimal parser for the Ansible INI inventories in daytona-workspaces-playbook.
 *
 * It deliberately avoids running `ansible-inventory` (no Python in the image)
 * and supports exactly what those files use: `[group]` host sections with
 * inline `key=value` vars, `[group:vars]`, `[group:children]`, and hosts
 * disabled by commenting their line out. Constructed groups (99-groups.yml)
 * are not needed — everything they derive (geo/tenant/gpu) is a host var here.
 */

export interface InventoryHost {
  name: string
  enabled: boolean
  /** Resolved vars: group vars (ancestors first), overridden by host-line vars */
  vars: Record<string, string>
  /** Direct and ancestor group names */
  groups: string[]
}

const ENVS = ['prod', 'preprod', 'stage', 'dev']

/** `h5001 ansible_host=1.2.3.4 model="AX162-R"` -> [name, vars] */
function parseHostLine(line: string): { name: string; vars: Record<string, string> } | null {
  const firstSpace = line.search(/\s/)
  const name = firstSpace === -1 ? line : line.slice(0, firstSpace)
  if (!/^[\w.-]+$/.test(name)) return null

  const vars: Record<string, string> = {}
  const rest = firstSpace === -1 ? '' : line.slice(firstSpace)
  for (const match of rest.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    vars[match[1]] = match[2] ?? match[3] ?? match[4]
  }
  return { name, vars }
}

/** A commented-out host line marks a disabled runner, not prose. */
function parseDisabledHostLine(line: string): { name: string; vars: Record<string, string> } | null {
  const uncommented = line.replace(/^#+\s*/, '')
  if (!uncommented.includes('ansible_host=')) return null
  return parseHostLine(uncommented)
}

interface RawInventory {
  /** group -> hostname -> host-line vars */
  hosts: Map<string, Map<string, { vars: Record<string, string>; enabled: boolean }>>
  /** group -> vars from [group:vars] */
  groupVars: Map<string, Record<string, string>>
  /** child group -> parent groups */
  parents: Map<string, Set<string>>
}

function parseIniFile(content: string, raw: RawInventory): void {
  let section = ''
  let kind: 'hosts' | 'vars' | 'children' = 'hosts'

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const header = line.match(/^\[([\w-]+)(?::(vars|children))?\]$/)
    if (header) {
      section = header[1]
      kind = (header[2] as 'vars' | 'children') ?? 'hosts'
      continue
    }
    if (!section) continue

    if (kind === 'vars') {
      const match = line.match(/^([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.+))$/)
      if (match) {
        const vars = raw.groupVars.get(section) ?? {}
        // Unquoted values may carry a trailing inline comment
        vars[match[1]] = match[2] ?? match[3] ?? match[4].replace(/\s+#.*$/, '')
        raw.groupVars.set(section, vars)
      }
    } else if (kind === 'children') {
      if (line.startsWith('#')) continue
      if (/^[\w-]+$/.test(line)) {
        const parents = raw.parents.get(line) ?? new Set()
        parents.add(section)
        raw.parents.set(line, parents)
      }
    } else {
      const parsed = line.startsWith('#') ? parseDisabledHostLine(line) : parseHostLine(line)
      if (!parsed) continue
      const group = raw.hosts.get(section) ?? new Map()
      group.set(parsed.name, { vars: parsed.vars, enabled: !line.startsWith('#') })
      raw.hosts.set(section, group)
    }
  }
}

function ancestors(group: string, parents: Map<string, Set<string>>): string[] {
  const seen = new Set<string>()
  const queue = [group]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const parent of parents.get(current) ?? []) {
      if (!seen.has(parent)) {
        seen.add(parent)
        queue.push(parent)
      }
    }
  }
  return [...seen]
}

/** Parses every extensionless INI file in an inventory directory. */
export function parseInventoryDir(inventoryDir: string): InventoryHost[] {
  const raw: RawInventory = { hosts: new Map(), groupVars: new Map(), parents: new Map() }

  const files = fs
    .readdirSync(inventoryDir)
    .filter((f) => !f.includes('.') && fs.statSync(path.join(inventoryDir, f)).isFile())
    .sort()
  for (const file of files) {
    parseIniFile(fs.readFileSync(path.join(inventoryDir, file), 'utf-8'), raw)
  }

  // First pass: collect each host's line vars, enabled flag and full group set
  const collected = new Map<string, { hostVars: Record<string, string>; enabled: boolean; groups: Set<string> }>()
  for (const [group, groupHosts] of raw.hosts) {
    for (const [name, { vars: hostVars, enabled }] of groupHosts) {
      const host = collected.get(name) ?? { hostVars: {}, enabled: true, groups: new Set<string>() }
      Object.assign(host.hostVars, hostVars)
      host.enabled = host.enabled && enabled
      for (const g of [...ancestors(group, raw.parents), group]) host.groups.add(g)
      collected.set(name, host)
    }
  }

  // Second pass: resolve vars with Ansible precedence — parent group vars
  // first, child group vars override them, host-line vars override everything.
  // Same-depth groups follow Ansible's rule: alphabetical order, with
  // ansible_group_priority (default 1, higher merges later) taking precedence.
  const depth = (g: string) => ancestors(g, raw.parents).length
  const priority = (g: string) => Number(raw.groupVars.get(g)?.ansible_group_priority) || 1
  return [...collected.entries()].map(([name, { hostVars, enabled, groups }]) => {
    const byDepth = [...groups].sort((a, b) => depth(a) - depth(b) || priority(a) - priority(b) || a.localeCompare(b))
    const vars: Record<string, string> = {}
    for (const g of byDepth) Object.assign(vars, raw.groupVars.get(g))
    Object.assign(vars, hostVars)
    return { name, enabled, vars, groups: byDepth }
  })
}

export function hostEnv(host: InventoryHost): string {
  return ENVS.find((env) => host.groups.includes(env)) ?? 'unknown'
}
