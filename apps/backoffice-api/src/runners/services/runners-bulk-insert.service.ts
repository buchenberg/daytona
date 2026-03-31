/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { Runner } from '@api/sandbox/entities/runner.entity'
import { RunnerState } from '@api/sandbox/enums/runner-state.enum'
import { BulkInsertRunnerDto, BulkInsertResponseDto, BulkInsertResultDto } from '../dto/bulk-insert-runner.dto'
import { CreateRunnerDto } from '../dto/create-runner.dto'

@Injectable()
export class RunnersBulkInsertService {
  constructor(
    @InjectRepository(Runner)
    private readonly runnerRepository: Repository<Runner>,
  ) {}

  async bulkInsert(request: BulkInsertRunnerDto, userId: string): Promise<BulkInsertResponseDto> {
    const { runners, dryRun = false, skipErrors = false } = request
    const results: BulkInsertResultDto[] = []
    const warnings: string[] = []
    let successCount = 0
    let failureCount = 0
    let skippedCount = 0

    // Check for duplicates in database
    const domains = runners.map((r) => r.domain)
    const existingRunners = await this.runnerRepository.find({
      where: { domain: In(domains) },
      select: ['domain'],
    })
    const existingDomains = new Set(existingRunners.map((r) => r.domain))

    // Check for duplicates in request
    const seenDomains = new Set<string>()
    const duplicatesInRequest = new Set<string>()

    for (const runner of runners) {
      if (seenDomains.has(runner.domain)) {
        duplicatesInRequest.add(runner.domain)
      }
      seenDomains.add(runner.domain)
    }

    // Add warning for duplicates in request
    if (duplicatesInRequest.size > 0) {
      warnings.push(`Found ${duplicatesInRequest.size} duplicate domain(s) in request batch`)
    }

    // Process each runner
    for (const runnerData of runners) {
      try {
        // Check if already exists in database
        if (existingDomains.has(runnerData.domain)) {
          results.push({
            domain: runnerData.domain,
            success: false,
            error: {
              code: 'DUPLICATE',
              message: 'Runner with this domain already exists in database',
            },
          })
          skippedCount++
          continue
        }

        // Check for duplicate in request (skip subsequent occurrences)
        if (duplicatesInRequest.has(runnerData.domain)) {
          const firstOccurrence = runners.findIndex((r) => r.domain === runnerData.domain)
          const currentIndex = runners.indexOf(runnerData)
          if (currentIndex !== firstOccurrence) {
            results.push({
              domain: runnerData.domain,
              success: false,
              error: {
                code: 'DUPLICATE_IN_BATCH',
                message: 'Duplicate domain in request batch (skipping duplicate)',
              },
            })
            skippedCount++
            continue
          }
        }

        if (dryRun) {
          // Validation only - don't actually insert
          results.push({
            domain: runnerData.domain,
            success: true,
            data: {
              ...runnerData,
              apiUrl: this.generateApiUrl(runnerData.domain),
              proxyUrl: this.generateProxyUrl(runnerData.domain),
              gpu: runnerData.gpu ?? 0,
              gpuType: runnerData.gpuType ?? '',
              state: runnerData.state ?? RunnerState.INITIALIZING,
              unschedulable: runnerData.unschedulable ?? false,
            },
          })
          successCount++
        } else {
          // Actually insert
          const runner = this.runnerRepository.create({
            name: runnerData.domain,
            domain: runnerData.domain,
            apiKey: runnerData.apiKey,
            apiUrl: this.generateApiUrl(runnerData.domain),
            proxyUrl: this.generateProxyUrl(runnerData.domain),
            region: runnerData.region,
            cpu: runnerData.cpu,
            memoryGiB: runnerData.memoryGiB,
            diskGiB: runnerData.diskGiB,
            class: runnerData.class,
            gpu: runnerData.gpu ?? 0,
            gpuType: runnerData.gpuType ?? '',
            state: runnerData.state ?? RunnerState.INITIALIZING,
            unschedulable: runnerData.unschedulable ?? false,
            apiVersion: '0',
            currentCpuUsagePercentage: 0,
            currentMemoryUsagePercentage: 0,
            currentDiskUsagePercentage: 0,
            currentAllocatedCpu: 0,
            currentAllocatedMemoryGiB: 0,
            currentAllocatedDiskGiB: 0,
            currentSnapshotCount: 0,
            currentStartedSandboxes: 0,
            availabilityScore: 0,
          })

          const inserted = await this.runnerRepository.save(runner)

          results.push({
            domain: runnerData.domain,
            success: true,
            data: inserted,
          })
          successCount++
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        if (skipErrors) {
          results.push({
            domain: runnerData.domain,
            success: false,
            error: {
              code: 'INSERT_ERROR',
              message: errorMessage,
            },
          })
          failureCount++
        } else {
          // Re-throw to stop processing
          throw error
        }
      }
    }

    return {
      totalProcessed: runners.length,
      successCount,
      failureCount,
      skippedCount,
      results,
      warnings,
    }
  }

  private generateApiUrl(domain: string): string {
    return `https://${domain}:3000`
  }

  private generateProxyUrl(domain: string): string {
    return `https://${domain}:3000`
  }
}
