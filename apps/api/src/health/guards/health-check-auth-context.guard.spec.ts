import { HealthCheckAuthContextGuard } from './health-check-auth-context.guard'
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

describe('[AUTH] HealthCheckAuthContextGuard', () => {
  let guard: HealthCheckAuthContextGuard

  beforeEach(() => {
    guard = new HealthCheckAuthContextGuard()
  })

  it('allows HealthCheckAuthContext', async () => {
    const { context } = createMockExecutionContext({ user: createMockHealthCheckAuthContext() })
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
    ['OtelCollector', createMockOtelCollectorAuthContext],
    ['Billing', createMockBillingAuthContext],
    ['RunnerCleanupTool', createMockRunnerCleanupToolAuthContext],
    ['UserManagement', createMockUserManagementAuthContext],
  ])('rejects %sAuthContext', async (_name, factory) => {
    const { context } = createMockExecutionContext({ user: factory() })
    await expect(guard.canActivate(context)).rejects.toThrow(InvalidAuthenticationContextException)
  })
})
