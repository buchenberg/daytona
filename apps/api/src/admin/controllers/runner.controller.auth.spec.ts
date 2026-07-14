import { AdminRunnerController } from './runner.controller'
import { SystemRole } from '../../user/enums/system-role.enum'
import { getRequiredSystemRole } from '../../test/helpers/controller-metadata.helper'

describe('[AUTH] AdminRunnerController', () => {
  it('requires admin role', () => {
    expect(getRequiredSystemRole(AdminRunnerController)).toBe(SystemRole.ADMIN)
  })
})
