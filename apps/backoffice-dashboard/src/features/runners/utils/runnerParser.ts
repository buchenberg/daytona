/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

export interface ParsedSpecs {
  region: string
  cpu: number
  memoryGiB: number
  diskGiB: number
  class: 'small' | 'medium' | 'large'
}

export interface ParsedRunner {
  domain: string
  apiKey: string
  region: string
  cpu: number
  memoryGiB: number
  diskGiB: number
  class: 'small' | 'medium' | 'large'
}

export interface ParseResult {
  success: boolean
  runners?: ParsedRunner[]
  errors?: string[]
}

/**
 * Parse specs string like "US, 64CPU, 768GB RAM, 6.9TB, small"
 */
export function parseSpecs(specsText: string): ParsedSpecs | null {
  try {
    const parts = specsText.split(',').map((p) => p.trim())

    // Extract region (first part)
    const region = parts[0] || 'US'

    // Extract CPU (e.g., "64CPU")
    const cpuMatch = specsText.match(/(\d+)\s*CPU/i)
    const cpu = cpuMatch ? parseInt(cpuMatch[1], 10) : 0

    // Extract memory (e.g., "768GB RAM")
    const memoryMatch = specsText.match(/(\d+)\s*GB\s*RAM/i)
    const memoryGiB = memoryMatch ? parseInt(memoryMatch[1], 10) : 0

    // Extract disk (e.g., "6.9TB" or "100GB") - but NOT "GB RAM"
    const diskMatch = specsText.match(/(\d+(?:\.\d+)?)\s*(TB|GB)(?!\s*RAM)/i)
    let diskGiB = 0
    if (diskMatch) {
      const value = parseFloat(diskMatch[1])
      const unit = diskMatch[2].toUpperCase()
      diskGiB = unit === 'TB' ? Math.round(value * 1000) : value
    }

    // Extract class (small/medium/large) - default to small
    let sandboxClass: 'small' | 'medium' | 'large' = 'small'
    const classMatch = specsText.match(/\b(small|medium|large)\b/i)
    if (classMatch) {
      sandboxClass = classMatch[1].toLowerCase() as 'small' | 'medium' | 'large'
    }

    return {
      region,
      cpu,
      memoryGiB,
      diskGiB,
      class: sandboxClass,
    }
  } catch (error) {
    return null
  }
}

/**
 * Parse runner data like:
 * domain_name: "h1321.daytona.work"
 * api_token: "EfEiw5..."
 */
export function parseRunnerData(runnersText: string, specs: ParsedSpecs): ParseResult {
  const errors: string[] = []
  const runners: ParsedRunner[] = []

  try {
    // Split by double newlines to separate runner entries
    const lines = runnersText.split('\n').filter((line) => line.trim())

    let currentDomain = ''
    let currentToken = ''

    for (const line of lines) {
      const trimmedLine = line.trim()

      // Match domain_name
      const domainMatch = trimmedLine.match(/domain_name\s*:\s*["']?([^"'\n]+)["']?/i)
      if (domainMatch) {
        currentDomain = domainMatch[1].trim()
        continue
      }

      // Match api_token
      const tokenMatch = trimmedLine.match(/api_token\s*:\s*["']?([^"'\n]+)["']?/i)
      if (tokenMatch) {
        currentToken = tokenMatch[1].trim()

        // If we have both domain and token, create a runner
        if (currentDomain && currentToken) {
          runners.push({
            domain: currentDomain,
            apiKey: currentToken,
            region: specs.region,
            cpu: specs.cpu,
            memoryGiB: specs.memoryGiB,
            diskGiB: specs.diskGiB,
            class: specs.class,
          })

          // Reset for next runner
          currentDomain = ''
          currentToken = ''
        }
      }
    }

    // Validate
    if (runners.length === 0) {
      errors.push('No valid runners found. Please check the format.')
    }

    // Check for incomplete entries
    if (currentDomain && !currentToken) {
      errors.push(`Incomplete entry: domain "${currentDomain}" has no api_token`)
    }

    return {
      success: errors.length === 0,
      runners,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse runner data'],
    }
  }
}

/**
 * Validate a single runner
 */
export function validateRunner(runner: ParsedRunner): string[] {
  const errors: string[] = []

  if (!runner.domain || runner.domain.trim() === '') {
    errors.push('Domain is required')
  } else if (!/^[a-zA-Z0-9.-]+$/.test(runner.domain)) {
    errors.push('Domain contains invalid characters')
  }

  if (!runner.apiKey || runner.apiKey.trim() === '') {
    errors.push('API token is required')
  }

  if (!runner.region || runner.region.trim() === '') {
    errors.push('Region is required')
  }

  if (!runner.cpu || runner.cpu <= 0) {
    errors.push('CPU must be greater than 0')
  }

  if (!runner.memoryGiB || runner.memoryGiB <= 0) {
    errors.push('Memory must be greater than 0')
  }

  if (!runner.diskGiB || runner.diskGiB <= 0) {
    errors.push('Disk must be greater than 0')
  }

  if (!['small', 'medium', 'large'].includes(runner.class)) {
    errors.push('Class must be small, medium, or large')
  }

  return errors
}
