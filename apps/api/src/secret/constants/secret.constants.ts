/**
 * Prefix of the opaque placeholder tokens injected into a sandbox's environment
 * in place of real secret values. The runner's secret-injection proxy keys off
 * this prefix when swapping placeholders for plaintext values on outbound
 * requests (see libs/netleash DaytonaPlaceholderPrefix — keep in sync).
 */
export const SECRET_PLACEHOLDER_PREFIX = 'dtn_secret_'
