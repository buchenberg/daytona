/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { Logger } from '@nestjs/common'

interface Skill {
  name: string
  keywords: RegExp
  content: string
}

const SKILL_KEYWORDS: Record<string, string[]> = {
  loki_logs: ['loki', 'log', 'logql', 'container', 'namespace', 'deployment', 'pod'],
  audit_logs: ['audit', 'opensearch', 'user activity', 'security', 'actor'],
  posthog_analytics: ['posthog', 'hogql', 'analytics', 'funnel', 'retention', 'event'],
  resource_analysis: [
    'cpu',
    'memory',
    'disk',
    'resource',
    'capacity',
    'cost',
    'utilization',
    'dashboard',
    'red method',
    'use method',
  ],
  automated_fixes: ['fix', 'pr', 'pull request', 'sandbox', 'patch'],
  clickhouse_optimization: ['clickhouse', 'billing', 'order by', 'partition', 'merge tree', 'low cardinality'],
  incident_response: ['incident', 'outage', 'down', 'sev1', 'sev2', 'postmortem', 'status update', 'root cause'],
  sql_optimization: ['slow query', 'optimize', 'query performance', 'pagination', 'index', 'aggregate'],
}

// Core skills are always included in the system prompt regardless of keyword match.
// This ensures Claude always has query optimization guidance and resource analysis
// patterns available, even for vague questions like "what's going on with this org?"
const CORE_SKILLS = new Set(['sql_optimization', 'clickhouse_optimization', 'resource_analysis'])

let skills: Skill[] | null = null

function loadSkills(): Skill[] {
  if (skills) return skills

  const logger = new Logger('SkillLoader')
  skills = []

  // Try multiple potential locations for skill files
  const possibleDirs = [
    join(__dirname, '..', 'skills'),
    join(__dirname),
    join(__dirname, 'skills'),
    join(process.cwd(), 'apps', 'backoffice-api', 'src', 'skills'),
    join(process.cwd(), 'dist', 'apps', 'backoffice-api', 'skills'),
  ]

  for (const [name, keywords] of Object.entries(SKILL_KEYWORDS)) {
    const pattern = new RegExp(keywords.join('|'), 'i')
    let content: string | null = null

    for (const dir of possibleDirs) {
      try {
        content = readFileSync(join(dir, `${name}.md`), 'utf-8')
        break
      } catch {
        continue
      }
    }

    if (content) {
      skills.push({ name, keywords: pattern, content })
      logger.log(`Loaded skill: ${name} (${keywords.length} keywords)`)
    } else {
      logger.warn(`Skill file not found: ${name}.md`)
    }
  }

  return skills
}

export function matchSkills(message: string): string[] {
  const loaded = loadSkills()
  const seen = new Set<string>()
  const result: string[] = []

  for (const skill of loaded) {
    if (CORE_SKILLS.has(skill.name) || skill.keywords.test(message)) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name)
        result.push(skill.content)
      }
    }
  }

  return result
}
