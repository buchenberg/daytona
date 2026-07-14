import { AdminWebhookController } from './webhook.controller'
import { SystemRole } from '../../user/enums/system-role.enum'
import { getRequiredSystemRole } from '../../test/helpers/controller-metadata.helper'

describe('[AUTH] AdminWebhookController', () => {
  it('requires admin role', () => {
    expect(getRequiredSystemRole(AdminWebhookController)).toBe(SystemRole.ADMIN)
  })
})
