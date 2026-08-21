import { deriveSandboxActivitySource } from './sandbox-activity-source'
import { BaseAuthContext } from '../../common/interfaces/base-auth-context.interface'

function makeContext(role: BaseAuthContext['role'], regionId?: string): BaseAuthContext {
  return { role, ...(regionId ? { regionId } : {}) }
}

describe('deriveSandboxActivitySource', () => {
  describe('proxy role', () => {
    it('returns the bare prefix when no sub-source is supplied', () => {
      expect(deriveSandboxActivitySource(makeContext('proxy'))).toBe('proxy')
    })

    it('appends a known sub-source', () => {
      expect(deriveSandboxActivitySource(makeContext('proxy'), 'toolbox')).toBe('proxy.toolbox')
      expect(deriveSandboxActivitySource(makeContext('proxy'), 'preview')).toBe('proxy.preview')
    })

    it('ignores an unknown or cross-prefix sub-source', () => {
      expect(deriveSandboxActivitySource(makeContext('proxy'), 'keepalive')).toBe('proxy')
      expect(deriveSandboxActivitySource(makeContext('proxy'), 'anything-else')).toBe('proxy')
    })

    it('treats region-proxy the same as proxy', () => {
      expect(deriveSandboxActivitySource(makeContext('region-proxy', 'region-1'), 'toolbox')).toBe('proxy.toolbox')
    })
  })

  describe('ssh-gateway role', () => {
    it('returns the bare prefix when no sub-source is supplied', () => {
      expect(deriveSandboxActivitySource(makeContext('ssh-gateway'))).toBe('ssh')
    })

    it('appends a known sub-source', () => {
      expect(deriveSandboxActivitySource(makeContext('ssh-gateway'), 'connection')).toBe('ssh.connection')
      expect(deriveSandboxActivitySource(makeContext('ssh-gateway'), 'keepalive')).toBe('ssh.keepalive')
    })

    it('treats region-ssh-gateway the same as ssh', () => {
      expect(deriveSandboxActivitySource(makeContext('region-ssh-gateway', 'region-1'), 'keepalive')).toBe(
        'ssh.keepalive',
      )
    })
  })

  describe('other roles', () => {
    it('maps to api and ignores any caller-supplied sub-source (trust boundary)', () => {
      expect(deriveSandboxActivitySource(makeContext('runner'))).toBe('api')
      expect(deriveSandboxActivitySource(makeContext('runner'), 'toolbox')).toBe('api')
    })
  })
})
