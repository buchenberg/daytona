import { SandboxClass } from '../enums/sandbox-class.enum'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'
import { isArchiveStateHiddenClass, mapStateForClient, mapDesiredStateForClient } from './archive-state-mapping.util'

const HIDDEN_CLASSES = [SandboxClass.LINUX_VM, SandboxClass.WINDOWS]
const VISIBLE_CLASSES = [SandboxClass.CONTAINER, SandboxClass.ANDROID]

describe('isArchiveStateHiddenClass', () => {
  it.each(HIDDEN_CLASSES)('returns true for VM-backed class %s', (sandboxClass) => {
    expect(isArchiveStateHiddenClass(sandboxClass)).toBe(true)
  })

  it.each(VISIBLE_CLASSES)('returns false for container-backed class %s', (sandboxClass) => {
    expect(isArchiveStateHiddenClass(sandboxClass)).toBe(false)
  })

  it('returns false when the class is missing', () => {
    expect(isArchiveStateHiddenClass(undefined)).toBe(false)
    expect(isArchiveStateHiddenClass(null)).toBe(false)
  })
})

describe('mapStateForClient', () => {
  it('returns the state unchanged when the class is missing', () => {
    expect(mapStateForClient(SandboxState.ARCHIVED, undefined, true)).toBe(SandboxState.ARCHIVED)
    expect(mapStateForClient(SandboxState.RESTORING, undefined, true)).toBe(SandboxState.RESTORING)
  })

  it.each(VISIBLE_CLASSES)('returns the state unchanged for non-VM class %s', (sandboxClass) => {
    expect(mapStateForClient(SandboxState.ARCHIVED, sandboxClass, true)).toBe(SandboxState.ARCHIVED)
    expect(mapStateForClient(SandboxState.ARCHIVING, sandboxClass, true)).toBe(SandboxState.ARCHIVING)
    expect(mapStateForClient(SandboxState.RESTORING, sandboxClass, true)).toBe(SandboxState.RESTORING)
  })

  describe.each(HIDDEN_CLASSES)('for VM-backed class %s', (sandboxClass) => {
    it.each([SandboxState.ARCHIVED, SandboxState.ARCHIVING])('maps %s to PAUSED when memory is preserved', (state) => {
      expect(mapStateForClient(state, sandboxClass, true)).toBe(SandboxState.PAUSED)
    })

    it.each([SandboxState.ARCHIVED, SandboxState.ARCHIVING])(
      'maps %s to STOPPED when memory is not preserved (false/null/undefined)',
      (state) => {
        expect(mapStateForClient(state, sandboxClass, false)).toBe(SandboxState.STOPPED)
        expect(mapStateForClient(state, sandboxClass, null)).toBe(SandboxState.STOPPED)
        expect(mapStateForClient(state, sandboxClass, undefined)).toBe(SandboxState.STOPPED)
      },
    )

    it('maps RESTORING to RESUMING when memory is preserved', () => {
      expect(mapStateForClient(SandboxState.RESTORING, sandboxClass, true)).toBe(SandboxState.RESUMING)
    })

    it('maps RESTORING to STARTING when memory is not preserved (false/null/undefined)', () => {
      expect(mapStateForClient(SandboxState.RESTORING, sandboxClass, false)).toBe(SandboxState.STARTING)
      expect(mapStateForClient(SandboxState.RESTORING, sandboxClass, null)).toBe(SandboxState.STARTING)
      expect(mapStateForClient(SandboxState.RESTORING, sandboxClass, undefined)).toBe(SandboxState.STARTING)
    })

    it.each([SandboxState.STARTED, SandboxState.STOPPED, SandboxState.PAUSED, SandboxState.ERROR])(
      'leaves non-archive state %s untouched',
      (state) => {
        expect(mapStateForClient(state, sandboxClass, true)).toBe(state)
        expect(mapStateForClient(state, sandboxClass, false)).toBe(state)
      },
    )
  })
})

describe('mapDesiredStateForClient', () => {
  it('returns undefined when the desired state is undefined', () => {
    expect(mapDesiredStateForClient(undefined, SandboxClass.LINUX_VM, true)).toBeUndefined()
  })

  it('returns the desired state unchanged when the class is missing', () => {
    expect(mapDesiredStateForClient(SandboxDesiredState.ARCHIVED, undefined, true)).toBe(SandboxDesiredState.ARCHIVED)
  })

  it.each(VISIBLE_CLASSES)('returns ARCHIVED unchanged for non-VM class %s', (sandboxClass) => {
    expect(mapDesiredStateForClient(SandboxDesiredState.ARCHIVED, sandboxClass, true)).toBe(
      SandboxDesiredState.ARCHIVED,
    )
  })

  describe.each(HIDDEN_CLASSES)('for VM-backed class %s', (sandboxClass) => {
    it('maps ARCHIVED to PAUSED when memory is preserved', () => {
      expect(mapDesiredStateForClient(SandboxDesiredState.ARCHIVED, sandboxClass, true)).toBe(
        SandboxDesiredState.PAUSED,
      )
    })

    it('maps ARCHIVED to STOPPED when memory is not preserved (false/null/undefined)', () => {
      expect(mapDesiredStateForClient(SandboxDesiredState.ARCHIVED, sandboxClass, false)).toBe(
        SandboxDesiredState.STOPPED,
      )
      expect(mapDesiredStateForClient(SandboxDesiredState.ARCHIVED, sandboxClass, null)).toBe(
        SandboxDesiredState.STOPPED,
      )
      expect(mapDesiredStateForClient(SandboxDesiredState.ARCHIVED, sandboxClass, undefined)).toBe(
        SandboxDesiredState.STOPPED,
      )
    })

    it.each([SandboxDesiredState.STARTED, SandboxDesiredState.STOPPED, SandboxDesiredState.PAUSED])(
      'leaves non-ARCHIVED desired state %s untouched',
      (desiredState) => {
        expect(mapDesiredStateForClient(desiredState, sandboxClass, true)).toBe(desiredState)
      },
    )
  })
})
