/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  assertNetworkSettingsCompatible,
  validateDomainAllowList,
  validateNetworkAllowList,
} from './network-validation.util'

describe('network-validation.util', () => {
  describe('validateNetworkAllowList', () => {
    it('accepts /0 CIDR prefixes', () => {
      expect(() => validateNetworkAllowList('0.0.0.0/0')).not.toThrow()
    })

    it('rejects malformed CIDRs with extra slash segments', () => {
      expect(() => validateNetworkAllowList('10.0.0.0/24/extra')).toThrow(
        'Invalid network format: "10.0.0.0/24/extra". Must be CIDR notation (e.g., 192.168.1.0/24)',
      )
    })

    it('counts only non-empty entries for the max allow-list size', () => {
      expect(() => validateNetworkAllowList('10.0.0.0/24,,,,,,,,,,')).not.toThrow()
    })

    it('rejects more than 10 non-empty CIDR entries', () => {
      expect(() => validateNetworkAllowList(new Array(11).fill('10.0.0.0/24').join(','))).toThrow(
        'Network allow list cannot contain more than 10 networks',
      )
    })
  })

  describe('validateDomainAllowList', () => {
    it('counts only non-empty entries for the max allow-list size', () => {
      expect(() => validateDomainAllowList('example.com,,,,,,,,,,')).not.toThrow()
    })

    it('rejects more than 10 non-empty domain entries', () => {
      expect(() => validateDomainAllowList(new Array(11).fill('example.com').join(','))).toThrow(
        'Domain allow list cannot contain more than 10 domains',
      )
    })

    it('documents alphabetic-tld restriction in validation error', () => {
      expect(() => validateDomainAllowList('example.s3')).toThrow(
        'Invalid domain: "example.s3". Must be a valid ASCII domain (optional leading *.) with an alphabetic top-level domain',
      )
    })

    it('rejects punycode IDN TLDs (digits not allowed in TLD)', () => {
      expect(() => validateDomainAllowList('example.xn--p1ai')).toThrow(/Invalid domain/)
    })

    it('accepts punycode in second-level labels with an ASCII TLD', () => {
      expect(() => validateDomainAllowList('xn--bcher-kva.de')).not.toThrow()
    })
  })

  describe('assertNetworkSettingsCompatible', () => {
    const conflictMessage =
      'networkBlockAll: true cannot be combined with a non-empty networkAllowList or domainAllowList. ' +
      'Remove the allow-list(s) or set networkBlockAll to false.'

    it.each([
      ['everything undefined', undefined, undefined, undefined],
      ['blockAll=false alone', false, undefined, undefined],
      ['blockAll=false with networkAllowList', false, '10.0.0.0/24', undefined],
      ['blockAll=false with domainAllowList', false, undefined, 'example.com'],
      ['blockAll=true alone', true, undefined, undefined],
      ['blockAll=true with empty networkAllowList', true, '', undefined],
      ['blockAll=true with whitespace networkAllowList', true, '   ', undefined],
      ['blockAll=true with empty domainAllowList', true, undefined, ''],
      ['blockAll=true with whitespace domainAllowList', true, undefined, '   '],
      ['blockAll=true with both empty', true, '', ''],
      ['networkAllowList alone', undefined, '10.0.0.0/24', undefined],
      ['domainAllowList alone', undefined, undefined, 'example.com'],
      ['networkAllowList with empty domainAllowList', undefined, '10.0.0.0/24', ''],
      ['domainAllowList with empty networkAllowList', undefined, '', 'example.com'],
    ])('does not throw for %s', (_label, blockAll, network, domain) => {
      expect(() =>
        assertNetworkSettingsCompatible(
          blockAll as boolean | undefined,
          network as string | undefined,
          domain as string | undefined,
        ),
      ).not.toThrow()
    })

    it.each([
      ['networkAllowList', '10.0.0.0/24', undefined],
      ['domainAllowList', undefined, 'example.com'],
    ])('throws when blockAll=true is combined with non-empty %s', (_label, network, domain) => {
      expect(() =>
        assertNetworkSettingsCompatible(true, network as string | undefined, domain as string | undefined),
      ).toThrow(conflictMessage)
    })

    it('throws with the documented message body so the controller can surface it verbatim', () => {
      expect(() => assertNetworkSettingsCompatible(true, '10.0.0.0/24', undefined)).toThrow(
        /Remove the allow-list\(s\) or set networkBlockAll to false\./,
      )
    })

    const mutualExclusionMessage =
      'networkAllowList and domainAllowList are mutually exclusive and cannot be set at the same time. ' +
      'Provide only one of them.'

    it.each([
      ['blockAll=undefined', undefined],
      ['blockAll=false', false],
    ])('throws when both networkAllowList and domainAllowList are sent (%s)', (_label, blockAll) => {
      expect(() =>
        assertNetworkSettingsCompatible(blockAll as boolean | undefined, '10.0.0.0/24', 'example.com'),
      ).toThrow(mutualExclusionMessage)
    })
  })
})
