const SCHEME_PREFIX = /^(https?:\/\/)/

/**
 * Removes a leading http:// or https:// from a registry URL. Runner APIs expect
 * the bare host, so this is applied wherever a registry URL is forwarded to a runner.
 */
export function stripRegistryScheme(url: string): string {
  return url.replace(SCHEME_PREFIX, '')
}
