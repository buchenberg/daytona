import { createContext } from 'react'

export interface ISandboxSessionContext {
  isTerminalActivated: (sandboxId: string) => boolean
  activateTerminal: (sandboxId: string) => void
  isVncActivated: (sandboxId: string) => boolean
  activateVnc: (sandboxId: string) => void
}

export const SandboxSessionContext = createContext<ISandboxSessionContext | null>(null)
