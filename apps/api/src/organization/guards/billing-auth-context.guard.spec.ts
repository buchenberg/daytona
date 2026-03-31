/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BillingAuthContextGuard } from './billing-auth-context.guard'
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
  createMockSshGatewayAuthContext,
  createMockUserAuthContext,
} from '../../test/helpers/auth-context.factory'
import { createMockExecutionContext } from '../../test/helpers/execution-context.factory'

describe('[AUTH] BillingAuthContextGuard', () => {
  let guard: BillingAuthContextGuard

  beforeEach(() => {
    guard = new BillingAuthContextGuard()
  })

  it('allows BillingAuthContext', async () => {
    const { context } = createMockExecutionContext({ user: createMockBillingAuthContext() })
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
  ])('rejects %sAuthContext', async (_name, factory) => {
    const { context } = createMockExecutionContext({ user: factory() })
    await expect(guard.canActivate(context)).rejects.toThrow(InvalidAuthenticationContextException)
  })
})
