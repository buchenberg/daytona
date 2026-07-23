import { isSpilloverError, SPILLOVER_ERROR_SUBSTRINGS } from './errors-for-recovery'

describe('isSpilloverError', () => {
  it('matches known spillover error substrings case-insensitively', () => {
    for (const substring of SPILLOVER_ERROR_SUBSTRINGS) {
      expect(isSpilloverError(substring)).toBe(true)
      expect(isSpilloverError(substring.toUpperCase())).toBe(true)
      expect(isSpilloverError(`prefix: ${substring} (extra)`)).toBe(true)
    }
  })

  it('returns false for unrelated or empty reasons', () => {
    expect(isSpilloverError(undefined)).toBe(false)
    expect(isSpilloverError(null)).toBe(false)
    expect(isSpilloverError('')).toBe(false)
    expect(isSpilloverError('timeout waiting for daemon to start')).toBe(false)
    expect(isSpilloverError('no space left on device')).toBe(false)
  })
})
