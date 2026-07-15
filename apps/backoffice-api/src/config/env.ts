import * as dotenv from 'dotenv'
import * as path from 'path'
import type { StringValue } from 'ms'

// Load .env.local from root
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })

/** parseInt that falls back to `fallback` when the env var is unset or non-numeric. */
function intEnv(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  skipConnections: process.env.SKIP_CONNECTIONS === 'true',

  database: {
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'pass',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'application_ctx',
    logging: process.env.DB_LOGGING === 'true',
    tls: {
      enabled: process.env.DB_TLS_ENABLED === 'true',
      rejectUnauthorized: process.env.DB_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  },

  // Backoffice database (same host as main, different database name)
  backofficeDb: {
    host: process.env.BACKOFFICE_DB_HOST || process.env.DB_HOST || 'db',
    port: parseInt(process.env.BACKOFFICE_DB_PORT || process.env.DB_PORT || '5432', 10),
    username: process.env.BACKOFFICE_DB_USERNAME || process.env.DB_USERNAME || 'user',
    password: process.env.BACKOFFICE_DB_PASSWORD || process.env.DB_PASSWORD || 'pass',
    database: process.env.BACKOFFICE_DB_NAME || 'backoffice',
    logging: process.env.BACKOFFICE_DB_LOGGING === 'true',
    migrationsRun: process.env.BACKOFFICE_DB_MIGRATIONS_RUN === 'true',
    tls: {
      enabled: (process.env.BACKOFFICE_DB_TLS_ENABLED ?? process.env.DB_TLS_ENABLED) === 'true',
      rejectUnauthorized:
        (process.env.BACKOFFICE_DB_TLS_REJECT_UNAUTHORIZED ?? process.env.DB_TLS_REJECT_UNAUTHORIZED) !== 'false',
    },
  },

  // Support-requested region-quota updates and creates (maker-checker approval)
  regionQuotas: {
    // How long a request stays active before it auto-reverts unless approved.
    requestTtlHours: intEnv(process.env.QUOTA_REQUEST_TTL_HOURS, 24),
    // A single update may add at most this % of the field's current value —
    // purely relative, no flat allowance. The daily budgets below are the
    // overall upper bound on how much gets handed out.
    updateMaxIncreasePercent: intEnv(process.env.QUOTA_UPDATE_MAX_INCREASE_PERCENT, 40),
    // Per-editor rolling-24h update budget (cores / GiB / GiB / GPUs).
    updateDailyBudgetCpu: intEnv(process.env.QUOTA_UPDATE_DAILY_BUDGET_CPU, 5000),
    updateDailyBudgetMemory: intEnv(process.env.QUOTA_UPDATE_DAILY_BUDGET_MEMORY, 5000),
    updateDailyBudgetDisk: intEnv(process.env.QUOTA_UPDATE_DAILY_BUDGET_DISK, 5000),
    updateDailyBudgetGpu: intEnv(process.env.QUOTA_UPDATE_DAILY_BUDGET_GPU, 50),
    // Limits a support-requested region quota is created with (cores / GiB / GiB / GPUs).
    createLimitCpu: intEnv(process.env.QUOTA_CREATE_LIMIT_CPU, 500),
    createLimitMemory: intEnv(process.env.QUOTA_CREATE_LIMIT_MEMORY, 1000),
    createLimitDisk: intEnv(process.env.QUOTA_CREATE_LIMIT_DISK, 5000),
    createLimitGpu: intEnv(process.env.QUOTA_CREATE_LIMIT_GPU, 10),
    // Per-editor rolling-24h create budget; defaults allow about five creates per day.
    createDailyBudgetCpu: intEnv(process.env.QUOTA_CREATE_DAILY_BUDGET_CPU, 2500),
    createDailyBudgetMemory: intEnv(process.env.QUOTA_CREATE_DAILY_BUDGET_MEMORY, 5000),
    createDailyBudgetDisk: intEnv(process.env.QUOTA_CREATE_DAILY_BUDGET_DISK, 25000),
    createDailyBudgetGpu: intEnv(process.env.QUOTA_CREATE_DAILY_BUDGET_GPU, 50),
  },

  // Runner fleet inventory + maintenance request tracking
  fleet: {
    inventory: {
      // Git URL of the workspaces-playbook repo; leave empty to disable syncing
      // (or point localPath at an existing checkout, e.g. in dev).
      repoUrl: process.env.FLEET_INVENTORY_REPO_URL || '',
      branch: process.env.FLEET_INVENTORY_REPO_BRANCH || 'main',
      localPath: process.env.FLEET_INVENTORY_LOCAL_PATH || '',
      dataDir: process.env.FLEET_INVENTORY_DATA_DIR || '/data/playbook',
      // Playbook roots whose `<root>/inventory` directories are parsed.
      roots: (process.env.FLEET_INVENTORY_ROOTS || 'ansible/runners,ansible/runners-vm')
        .split(',')
        .map((root) => root.trim()),
      // Clamped to >= 1: a zero/negative interval would turn setInterval into a busy loop
      syncIntervalMinutes: Math.max(1, intEnv(process.env.FLEET_INVENTORY_SYNC_INTERVAL_MINUTES, 5)),
      // GitHub push-webhook HMAC secret; the webhook endpoint 404s while unset.
      webhookSecret: process.env.FLEET_INVENTORY_WEBHOOK_SECRET || '',
    },
    // Fallback domain suffix and the boundary of "our" fleet in discrepancy
    // checks (BYOC runners live outside it and are not drift).
    runnerDomainSuffix: process.env.FLEET_RUNNER_DOMAIN_SUFFIX || 'daytona.work',
  },

  auth: {
    mode: process.env.AUTH_MODE || 'both', // 'basic' | 'oidc' | 'both'
  },

  oidc: {
    issuer: process.env.OIDC_ISSUER || 'https://accounts.google.com',
    clientId: process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:8080/api/v1/auth/callback',
    audience: process.env.OIDC_AUDIENCE || '',
    callbackURL: process.env.OIDC_CALLBACK_URL || 'http://localhost:8080/api/v1/auth/callback',
    allowedDomain: process.env.OIDC_ALLOWED_DOMAIN || 'daytona.io',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
    expiresIn: (process.env.JWT_EXPIRES_IN as StringValue) || '7d',
    // Hard cap (in seconds) on how old a session token's `iat` can be and still
    // be eligible for sliding refresh. After this, the user must re-OAuth.
    // 8h matches the typical "re-auth at start of workday" admin-tool pattern.
    maxRefreshAgeSeconds: parseInt(process.env.JWT_MAX_REFRESH_AGE_SECONDS || `${8 * 60 * 60}`, 10),
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:8000',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:8000',
  },

  basicAuth: {
    username: process.env.BASIC_AUTH_USERNAME || 'admin',
    password: process.env.BASIC_AUTH_PASSWORD || 'admin',
  },

  externalApi: {
    baseUrl: process.env.EXTERNAL_API_URL || 'https://app.daytona.io/api',
    adminKey: process.env.ADMIN_API_KEY || '',
  },

  admin: {
    organizationId: process.env.ADMIN_ORG_ID || '',
  },

  sandboxSearch: {
    publish: {
      opensearchIndexName: process.env.SANDBOX_SEARCH_PUBLISH_OPENSEARCH_INDEX_NAME || 'sandboxes',
    },
  },

  mali: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    suggestionModel: process.env.MALI_SUGGESTION_MODEL || 'claude-haiku-4-5-20251001',
    fallbackModel: process.env.ANTHROPIC_FALLBACK_MODEL || 'claude-haiku-4-5-20251001',
    memoryContextMessages: process.env.MALI_MEMORY_CONTEXT_MESSAGES || '5',
    // Unpinned conversations older than this are autodeleted by the nightly
    // retention sweep. Set to 0 (or negative) to disable.
    conversationRetentionDays: process.env.MALI_CONVERSATION_RETENTION_DAYS || '14',

    // Repos cloned into the codebase_workspace analysis sandbox, and the PAT
    // used to clone them (needs read access to the private repos).
    codebase: {
      githubPat: process.env.MALI_CODEBASE_GITHUB_PAT || '',
      repos: process.env.MALI_CODEBASE_REPOS || 'daytonaio/daytona-ai,daytonaio/docs,daytona/clients',
    },

    // Master secret for AES-256-CBC/PBKDF2 encryption of secret fields in
    // mali_user_settings.datasource_overrides. Compatible with:
    //   openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -a -k "$MALI_SETTINGS_SECRET"
    // If empty: encryption is skipped with a one-time warning on first use (dev only).
    settingsSecret: process.env.MALI_SETTINGS_SECRET || '',

    grafana: {
      url: process.env.MALI_GRAFANA_URL || '',
      token: process.env.MALI_GRAFANA_TOKEN || '',
    },
    database: {
      host: process.env.MALI_DB_HOST || '',
      port: parseInt(process.env.MALI_DB_PORT || '5432', 10),
      username: process.env.MALI_DB_USERNAME || '',
      password: process.env.MALI_DB_PASSWORD || '',
      database: process.env.MALI_DB_DATABASE || 'application_ctx',
      tls: {
        enabled: process.env.MALI_DB_TLS_ENABLED === 'true',
        rejectUnauthorized: process.env.MALI_DB_TLS_REJECT_UNAUTHORIZED !== 'false',
      },
    },
    clickhouse: {
      serviceId: process.env.MALI_CLICKHOUSE_SERVICE_ID || '',
      keyId: process.env.MALI_CLICKHOUSE_KEY_ID || '',
      keySecret: process.env.MALI_CLICKHOUSE_KEY_SECRET || '',
    },
    opensearch: {
      url: process.env.MALI_OPENSEARCH_URL || '',
      username: process.env.MALI_OPENSEARCH_USERNAME || '',
      password: process.env.MALI_OPENSEARCH_PASSWORD || '',
    },
    posthog: {
      host: process.env.MALI_POSTHOG_HOST || 'https://us.posthog.com',
      apiKey: process.env.MALI_POSTHOG_API_KEY || '',
      projectId: process.env.MALI_POSTHOG_PROJECT_ID || '',
    },
    sandbox: {
      githubRepoUrl: process.env.MALI_GITHUB_REPO_URL || '',
      githubPat: process.env.MALI_GITHUB_PAT || '',
    },
  },
}
