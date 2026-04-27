/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { RunnerCleanupToolAuthContextGuard } from './runner-cleanup-tool-auth-context.guard'
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
  createMockUserManagementAuthContext,
  createMockSshGatewayAuthContext,
  createMockUserAuthContext,
} from '../../test/helpers/auth-context.factory'
import { createMockExecutionContext } from '../../test/helpers/execution-context.factory'

describe('[AUTH] RunnerCleanupToolAuthContextGuard', () => {
  let guard: RunnerCleanupToolAuthContextGuard

  beforeEach(() => {
    guard = new RunnerCleanupToolAuthContextGuard()
  })

  it('allows RunnerCleanupToolAuthContext', async () => {
    const { context } = createMockExecutionContext({ user: createMockRunnerCleanupToolAuthContext() })
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
    ['UserManagement', createMockUserManagementAuthContext],
  ])('rejects %sAuthContext', async (_name, factory) => {
    const { context } = createMockExecutionContext({ user: factory() })
    await expect(guard.canActivate(context)).rejects.toThrow(InvalidAuthenticationContextException)
  })
})
