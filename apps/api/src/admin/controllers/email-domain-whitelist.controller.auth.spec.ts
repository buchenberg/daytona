/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { AdminEmailDomainWhitelistController } from './email-domain-whitelist.controller'
import { SystemRole } from '../../user/enums/system-role.enum'
import { getRequiredSystemRole } from '../../test/helpers/controller-metadata.helper'

describe('[AUTH] AdminEmailDomainWhitelistController', () => {
  it('requires admin role', () => {
    expect(getRequiredSystemRole(AdminEmailDomainWhitelistController)).toBe(SystemRole.ADMIN)
  })
})
