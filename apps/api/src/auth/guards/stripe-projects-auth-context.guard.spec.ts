import { StripeProjectsAuthContextGuard } from './stripe-projects-auth-context.guard'
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
  createMockStripeProjectsAuthContext,
  createMockUserAuthContext,
  createMockUserManagementAuthContext,
} from '../../test/helpers/auth-context.factory'
import { createMockExecutionContext } from '../../test/helpers/execution-context.factory'

describe('[AUTH] StripeProjectsAuthContextGuard', () => {
  let guard: StripeProjectsAuthContextGuard

  beforeEach(() => {
    guard = new StripeProjectsAuthContextGuard()
  })

  it('allows StripeProjectsAuthContext', async () => {
    const { context } = createMockExecutionContext({ user: createMockStripeProjectsAuthContext() })
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
    ['UserManagement', createMockUserManagementAuthContext],
  ])('rejects %sAuthContext', async (_name, factory) => {
    const { context } = createMockExecutionContext({ user: factory() })
    await expect(guard.canActivate(context)).rejects.toThrow(InvalidAuthenticationContextException)
  })
})
