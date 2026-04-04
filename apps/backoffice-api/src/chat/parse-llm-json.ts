/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

/**
 * Parse JSON from LLM output, stripping markdown code fences and leading/trailing
 * whitespace. Models frequently wrap JSON in ```json ... ``` even when told not to.
 */
export function parseLlmJson<T = unknown>(raw: string): T {
  const stripped = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
  return JSON.parse(stripped)
}
