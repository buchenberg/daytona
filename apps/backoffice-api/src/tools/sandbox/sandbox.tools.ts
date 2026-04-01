/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import Anthropic from '@anthropic-ai/sdk'
import { SandboxService } from './sandbox.service'

export const sandboxToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'sandbox_create',
    description:
      'Create a new Daytona sandbox. Returns the sandbox ID, state, and resource info. ' +
      'ALWAYS call this immediately when the user asks to create a sandbox — do NOT ask for ' +
      'clarification or confirmation first. Use all defaults unless the user explicitly ' +
      "specified otherwise: snapshot='daytona-large', language='python', auto_stop_interval=30.",
    input_schema: {
      type: 'object' as const,
      properties: {
        snapshot: { type: 'string', description: 'Snapshot/image to use.' },
        language: {
          type: 'string',
          description: "Language toolbox: 'python', 'javascript', or 'typescript'.",
        },
        name: { type: 'string', description: 'Optional name for the sandbox.' },
        auto_stop_interval: {
          type: 'integer',
          description: 'Minutes of inactivity before auto-stop. 0 = never.',
        },
      },
      required: [],
    },
  },
  {
    name: 'sandbox_list',
    description: 'List all Daytona sandboxes in the account. Returns ID, name, state, and resource info for each.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'sandbox_get',
    description: 'Get details about a specific Daytona sandbox by its ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sandbox_id: { type: 'string', description: 'The sandbox ID.' },
      },
      required: ['sandbox_id'],
    },
  },
  {
    name: 'sandbox_delete',
    description: 'Delete (permanently remove) a Daytona sandbox by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sandbox_id: { type: 'string', description: 'The sandbox ID to delete.' },
      },
      required: ['sandbox_id'],
    },
  },
  {
    name: 'sandbox_exec',
    description:
      'Execute a shell command inside a running Daytona sandbox. ' +
      'Returns exit_code and output. Use to run code, install packages, explore files, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sandbox_id: { type: 'string', description: 'The sandbox ID.' },
        command: { type: 'string', description: 'Shell command to run.' },
        timeout: { type: 'integer', description: 'Timeout in seconds (default 30).' },
      },
      required: ['sandbox_id', 'command'],
    },
  },
  {
    name: 'create_fix_pr',
    description:
      'Spin up a Daytona sandbox with Claude Agent to fix a code issue ' +
      "and open a pull request on GitHub. Use this when you've identified " +
      'a bug or issue in the codebase through monitoring data (logs, metrics, ' +
      'errors) and want to autonomously create a fix. Provide a clear task ' +
      'description, a short PR title, monitoring context, and optionally a ' +
      'build command to verify the fix compiles.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description:
            'Short PR title in conventional-commit style, e.g. ' +
            "'fix(proxy): use background context for cache writes' or " +
            "'fix(api): handle AggregateError in runner adapter'. " +
            'Keep under 72 chars.',
        },
        task: {
          type: 'string',
          description:
            'Detailed description of what needs to be fixed. Include ' +
            'exact file paths and function names if known, the root ' +
            'cause, and what the fix should do.',
        },
        context: {
          type: 'string',
          description:
            'Monitoring context: error messages, log snippets, metric ' +
            'values, stack traces, or any evidence gathered from ' +
            'Prometheus, Loki, OpenSearch, PostHog, or the database.',
        },
        build_cmd: {
          type: 'string',
          description:
            'Build/compile command to verify the fix. Examples: ' +
            "'go build ./apps/proxy/...' for Go, " +
            "'npx tsc --noEmit' for TypeScript. " +
            'If the build fails the PR will not be created.',
        },
      },
      required: ['title', 'task'],
    },
  },
]

export const sandboxToolExecutors: Record<
  string,
  (service: SandboxService, input: Record<string, unknown>, apiKey: string) => Promise<unknown>
> = {
  sandbox_create: (service, input, apiKey) =>
    service.sandboxCreate(
      apiKey,
      input.snapshot as string | undefined,
      input.language as string | undefined,
      input.name as string | undefined,
      input.auto_stop_interval as number | undefined,
    ),

  sandbox_list: (service, _input, apiKey) => service.sandboxList(apiKey),

  sandbox_get: (service, input, apiKey) => service.sandboxGet(apiKey, input.sandbox_id as string),

  sandbox_delete: (service, input, apiKey) => service.sandboxDelete(apiKey, input.sandbox_id as string),

  sandbox_exec: (service, input, apiKey) =>
    service.sandboxExec(
      apiKey,
      input.sandbox_id as string,
      input.command as string,
      input.timeout as number | undefined,
    ),

  create_fix_pr: (service, input, apiKey) =>
    service.createFixPr(
      apiKey,
      input.title as string,
      input.task as string,
      input.context as string | undefined,
      input.build_cmd as string | undefined,
    ),
}
