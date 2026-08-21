const { composePlugins, withNx } = require('@nx/webpack')
const path = require('path')
const glob = require('glob')

// Find all backoffice migration files and create entry points
const migrationFiles = glob.sync('apps/backoffice-api/src/migrations-backoffice/*')
const migrationEntries = migrationFiles.reduce((acc, migrationFile) => {
  const entryName = migrationFile.substring(migrationFile.lastIndexOf('/') + 1, migrationFile.lastIndexOf('.'))
  acc[entryName] = migrationFile
  return acc
}, {})

module.exports = composePlugins(
  withNx(),
  (config, { options, context }) => {
    config.mode = process.env.NODE_ENV || 'development'
    
    // Add path alias for TypeScript imports
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...config.resolve.alias,
      '@api': path.resolve(__dirname, '../../apps/api/src'),
    }
    
    // Add TypeORM migrations as entry points so they get compiled into dist/
    for (const key in migrationEntries) {
      config.entry[`migrations-backoffice/${key}`] = migrationEntries[key]
    }
    
    return config
  },
)
