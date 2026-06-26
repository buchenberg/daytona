/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */
import { isIPv4 } from 'net'

/**
 * Validates network allow list to ensure valid CIDR network addresses are allowed
 * @param networkAllowList - Comma-separated string of network addresses
 * @returns null if valid, error message string if invalid
 */
export function validateNetworkAllowList(networkAllowList: string): void {
  const networks = networkAllowList.split(',').map((net: string) => net.trim())
  const nonEmptyNetworks = networks.filter((network) => network.length > 0)

  for (const network of nonEmptyNetworks) {
    const networkParts = network.split('/')
    if (networkParts.length !== 2) {
      throw new Error(`Invalid network format: "${network}". Must be CIDR notation (e.g., 192.168.1.0/24)`)
    }

    const [ipAddress, prefixLength] = networkParts

    if (!isIPv4(ipAddress)) {
      throw new Error(`Invalid IP address: "${ipAddress}" in network "${network}". Must be a valid IPv4 address`)
    }

    if (prefixLength === undefined || prefixLength === '') {
      throw new Error(`Invalid network format: "${network}". Missing CIDR prefix length (e.g., /24)`)
    }

    if (!/^\d+$/.test(prefixLength)) {
      throw new Error(`Invalid CIDR prefix length: ${network}. Prefix must be an integer between 0 and 32`)
    }

    // Validate CIDR prefix length (0-32 for IPv4)
    const prefix = parseInt(prefixLength, 10)
    if (prefix < 0 || prefix > 32) {
      throw new Error(`Invalid CIDR prefix length: ${network}. Prefix must be between 0 and 32`)
    }
  }

  if (nonEmptyNetworks.length > 10) {
    throw new Error(`Network allow list cannot contain more than 10 networks`)
  }
}

/**
 * Validates domain allow list to ensure valid domain names are allowed
 *
 * Known limitation: the TLD must be alphabetic ASCII (`[a-zA-Z]{2,}`), so any
 * domain whose TLD contains digits is rejected — this includes punycode IDN
 * TLDs such as `xn--p1ai` (`.рф`). Punycode in second-level labels (e.g.
 * `xn--bcher-kva.de`) is accepted because those labels are alphanumeric +
 * hyphen. Convert IDN TLDs upstream if they need to be supported.
 *
 * @param domainAllowList - Comma-separated string of domains (optionally prefixed with a `*.` wildcard)
 * @throws Error if any domain is invalid or the list is too long
 */
export function validateDomainAllowList(domainAllowList: string): void {
  const domains = domainAllowList.split(',').map((domain: string) => domain.trim())
  const nonEmptyDomains = domains.filter((domain) => domain.length > 0)

  // Hostname label format, optionally prefixed with a single `*.` wildcard (e.g. "*.daytona.io")
  const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

  for (const domain of nonEmptyDomains) {
    if (!domainRegex.test(domain)) {
      throw new Error(
        `Invalid domain: "${domain}". Must be a valid ASCII domain (optional leading *.) with an alphabetic top-level domain`,
      )
    }
  }

  if (nonEmptyDomains.length > 20) {
    throw new Error(`Domain allow list cannot contain more than 20 domains`)
  }
}

/**
 * Asserts that the supplied network settings are internally consistent.
 *
 * `networkAllowList` and `domainAllowList` are mutually exclusive: a request may
 * supply at most one of them. Sending both non-empty allow-lists at the same time
 * is rejected so the caller is forced to pick a single egress model.
 *
 * `networkBlockAll: true` denies all egress, which makes any non-empty
 * `networkAllowList` / `domainAllowList` semantically contradictory. Rejecting
 * the combination at the boundary keeps the API DB and the runner in sync and
 * forces the caller to be explicit instead of relying on silent precedence
 * (which has historically differed between the create and update paths).
 *
 * Empty / whitespace-only allow-list strings are treated as "no allow-list"
 * and do not conflict — that is the documented way to clear an existing
 * allow-list on the update endpoint.
 *
 * @param networkBlockAll - Whether to block all outbound network access
 * @param networkAllowList - Comma-separated CIDR allow-list (may be undefined or empty)
 * @param domainAllowList - Comma-separated domain allow-list (may be undefined or empty)
 * @throws Error if both allow-lists are supplied non-empty, or if `networkBlockAll === true` and a non-empty allow-list is also supplied
 */
export function assertNetworkSettingsCompatible(
  networkBlockAll: boolean | undefined,
  networkAllowList: string | undefined,
  domainAllowList: string | undefined,
): void {
  const hasNetworkAllowList = typeof networkAllowList === 'string' && networkAllowList.trim().length > 0
  const hasDomainAllowList = typeof domainAllowList === 'string' && domainAllowList.trim().length > 0

  if (hasNetworkAllowList && hasDomainAllowList) {
    throw new Error(
      'networkAllowList and domainAllowList are mutually exclusive and cannot be set at the same time. ' +
        'Provide only one of them.',
    )
  }

  if (networkBlockAll !== true) {
    return
  }

  if (hasNetworkAllowList || hasDomainAllowList) {
    throw new Error(
      'networkBlockAll: true cannot be combined with a non-empty networkAllowList or domainAllowList. ' +
        'Remove the allow-list(s) or set networkBlockAll to false.',
    )
  }
}
