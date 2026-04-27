/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { UserManagementAuthContextGuard } from './user-management-auth-context.guard'
import { InvalidAuthenticationContextException } from '../../common/exceptions/invalid-authentication-context.exception'
import {
  createMockBillingAuthContext,
  createMockHealthCheckAuthContext,
  createMockOrganizationAuthContext,
  createMockOtelCollectorAuthContext,
  createMockProxyAuthContext,
  createMockRegionProxyAuthContext,
  createMockRegionSshGatewayAuthContext,
  createMockRunnerAuthContext,
  createMockRunnerCleanupToolAuthContext,
  createMockSshGatewayAuthContext,
  createMockUserAuthContext,
  createMockUserManagementAuthContext,
} from '../../test/helpers/auth-context.factory'
import { createMockExecutionContext } from '../../test/helpers/execution-context.factory'

describe('[AUTH] UserManagementAuthContextGuard', () => {
  let guard: UserManagementAuthContextGuard

  beforeEach(() => {
    guard = new UserManagementAuthContextGuard()
  })

  it('allows UserManagementAuthContext', async () => {
    const { context } = createMockExecutionContext({ user: createMockUserManagementAuthContext() })
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it.each([
    ['User', createMockUserAuthContext],
    ['Organization', createMockOrganizationAuthContext],
    ['Runner', createMockRunnerAuthContext],
    ['Proxy', createMockProxyAuthContext],
    ['SshGateway', createMockSshGatewayAuthContext],
    ['RegionProxy', createMockRegionProxyAuthContext],
    ['RegionSshGateway', createMockRegionSshGatewayAuthContext],
    ['HealthCheck', createMockHealthCheckAuthContext],
    ['OtelCollector', createMockOtelCollectorAuthContext],
    ['Billing', createMockBillingAuthContext],
    ['RunnerCleanupTool', createMockRunnerCleanupToolAuthContext],
  ])('rejects %sAuthContext', async (_name, factory) => {
    const { context } = createMockExecutionContext({ user: factory() })
    await expect(guard.canActivate(context)).rejects.toThrow(InvalidAuthenticationContextException)
  })
})
