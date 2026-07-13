/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import Anthropic from '@anthropic-ai/sdk'

/**
 * Tools that let Mali maintain the shared knowledge base mid-investigation.
 * Available to every Mali user; executed by ChatService against MemoryService
 * directly, not through the datasource ToolRegistry.
 */
export const MEMORY_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'memory_store',
    description:
      'Save a durable, reusable insight to the shared knowledge base (visible to all Mali users in future ' +
      'conversations). Use it when an investigation uncovers something worth remembering: a recurring root ' +
      'cause, a known-noisy org or runner, a proven query pattern, an infrastructure quirk. Do NOT store ' +
      'transient facts (current counts, one-off incident details) or anything secret. Storing to an existing ' +
      'key overwrites it.',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Short snake_case identifier, e.g. "runner_eu2_disk_flakiness"',
        },
        value: {
          type: 'string',
          description: 'The insight, 1-3 sentences, self-contained and useful without this conversation',
        },
        category: {
          type: 'string',
          enum: ['finding', 'learning', 'infra', 'org'],
          description: 'finding = investigation result, learning = reusable technique, infra/org = standing facts',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'memory_forget',
    description:
      'Delete an entry from the shared knowledge base by key. Use when a stored insight is confirmed to be ' +
      'wrong or obsolete.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key of the entry to delete' },
      },
      required: ['key'],
    },
  },
]

export const MEMORY_TOOL_NAMES = new Set(MEMORY_TOOL_DEFINITIONS.map((t) => t.name))
