/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { EmailDomainWhitelistController } from './email-domain-whitelist.controller'
import { AuthStrategyType } from '../auth/enums/auth-strategy-type.enum'
import {
  getAuthContextGuards,
  getAllowedAuthStrategies,
  expectArrayMatch,
  createCoverageTracker,
  isPublicEndpoint,
} from '../test/helpers/controller-metadata.helper'
import { UserManagementAuthContextGuard } from './guards/user-management-auth-context.guard'

describe('[AUTH] EmailDomainWhitelistController', () => {
  const trackMethod = createCoverageTracker(EmailDomainWhitelistController)

  it('listWhitelistedDomains', () => {
    const methodName = trackMethod('listWhitelistedDomains')
    expect(isPublicEndpoint(EmailDomainWhitelistController, methodName)).toBe(false)
    expectArrayMatch(getAllowedAuthStrategies(EmailDomainWhitelistController, methodName), [AuthStrategyType.API_KEY])
    expectArrayMatch(getAuthContextGuards(EmailDomainWhitelistController, methodName), [UserManagementAuthContextGuard])
  })

  it('getDomainWhitelist', () => {
    const methodName = trackMethod('getDomainWhitelist')
    expect(isPublicEndpoint(EmailDomainWhitelistController, methodName)).toBe(false)
    expectArrayMatch(getAllowedAuthStrategies(EmailDomainWhitelistController, methodName), [AuthStrategyType.API_KEY])
    expectArrayMatch(getAuthContextGuards(EmailDomainWhitelistController, methodName), [UserManagementAuthContextGuard])
  })

  it('addDomainToWhitelist', () => {
    const methodName = trackMethod('addDomainToWhitelist')
    expect(isPublicEndpoint(EmailDomainWhitelistController, methodName)).toBe(false)
    expectArrayMatch(getAllowedAuthStrategies(EmailDomainWhitelistController, methodName), [AuthStrategyType.API_KEY])
    expectArrayMatch(getAuthContextGuards(EmailDomainWhitelistController, methodName), [UserManagementAuthContextGuard])
  })

  it('removeDomainFromWhitelist', () => {
    const methodName = trackMethod('removeDomainFromWhitelist')
    expect(isPublicEndpoint(EmailDomainWhitelistController, methodName)).toBe(false)
    expectArrayMatch(getAllowedAuthStrategies(EmailDomainWhitelistController, methodName), [AuthStrategyType.API_KEY])
    expectArrayMatch(getAuthContextGuards(EmailDomainWhitelistController, methodName), [UserManagementAuthContextGuard])
  })
})
