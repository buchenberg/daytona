/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

const { createGlobPatternsForDependencies } = require('@nx/react/tailwind')
const { join } = require('path')
const dashboardConfig = require('../dashboard/tailwind.config.js')

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...dashboardConfig,
  content: [
    join(__dirname, '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
}
