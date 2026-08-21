import { WarmPoolController } from './warm-pool.controller'
import { OrganizationAuthContextGuard } from '../../organization/guards/organization-auth-context.guard'
import { AuthStrategyType } from '../../auth/enums/auth-strategy-type.enum'
import { OrganizationResourcePermission } from '../../organization/enums/organization-resource-permission.enum'
import {
  getAuthContextGuards,
  getAllowedAuthStrategies,
  getRequiredOrganizationMemberRole,
  getRequiredOrganizationResourcePermissions,
  expectArrayMatch,
  createCoverageTracker,
  isPublicEndpoint,
} from '../../test/helpers/controller-metadata.helper'

describe('[AUTH] WarmPoolController', () => {
  const trackMethod = createCoverageTracker(WarmPoolController)

  it('listWarmPools', () => {
    const methodName = trackMethod('listWarmPools')
    expect(isPublicEndpoint(WarmPoolController, methodName)).toBe(false)
    expectArrayMatch(getAllowedAuthStrategies(WarmPoolController, methodName), [
      AuthStrategyType.API_KEY,
      AuthStrategyType.JWT,
    ])
    expectArrayMatch(getAuthContextGuards(WarmPoolController, methodName), [OrganizationAuthContextGuard])
    expect(getRequiredOrganizationMemberRole(WarmPoolController, methodName)).toBeUndefined()
    expect(getRequiredOrganizationResourcePermissions(WarmPoolController, methodName)).toBeUndefined()
  })

  it('createWarmPool', () => {
    const methodName = trackMethod('createWarmPool')
    expect(isPublicEndpoint(WarmPoolController, methodName)).toBe(false)
    expectArrayMatch(getAllowedAuthStrategies(WarmPoolController, methodName), [
      AuthStrategyType.API_KEY,
      AuthStrategyType.JWT,
    ])
    expectArrayMatch(getAuthContextGuards(WarmPoolController, methodName), [OrganizationAuthContextGuard])
    expect(getRequiredOrganizationMemberRole(WarmPoolController, methodName)).toBeUndefined()
    expectArrayMatch(getRequiredOrganizationResourcePermissions(WarmPoolController, methodName), [
      OrganizationResourcePermission.WRITE_SANDBOXES,
    ])
  })

  it('updateWarmPool', () => {
    const methodName = trackMethod('updateWarmPool')
    expect(isPublicEndpoint(WarmPoolController, methodName)).toBe(false)
    expectArrayMatch(getAllowedAuthStrategies(WarmPoolController, methodName), [
      AuthStrategyType.API_KEY,
      AuthStrategyType.JWT,
    ])
    expectArrayMatch(getAuthContextGuards(WarmPoolController, methodName), [OrganizationAuthContextGuard])
    expect(getRequiredOrganizationMemberRole(WarmPoolController, methodName)).toBeUndefined()
    expectArrayMatch(getRequiredOrganizationResourcePermissions(WarmPoolController, methodName), [
      OrganizationResourcePermission.WRITE_SANDBOXES,
    ])
  })

  it('deleteWarmPool', () => {
    const methodName = trackMethod('deleteWarmPool')
    expect(isPublicEndpoint(WarmPoolController, methodName)).toBe(false)
    expectArrayMatch(getAllowedAuthStrategies(WarmPoolController, methodName), [
      AuthStrategyType.API_KEY,
      AuthStrategyType.JWT,
    ])
    expectArrayMatch(getAuthContextGuards(WarmPoolController, methodName), [OrganizationAuthContextGuard])
    expect(getRequiredOrganizationMemberRole(WarmPoolController, methodName)).toBeUndefined()
    expectArrayMatch(getRequiredOrganizationResourcePermissions(WarmPoolController, methodName), [
      OrganizationResourcePermission.DELETE_SANDBOXES,
    ])
  })
})
