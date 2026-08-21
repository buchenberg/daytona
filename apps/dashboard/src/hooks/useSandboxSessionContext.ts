import { ISandboxSessionContext, SandboxSessionContext } from '@/contexts/SandboxSessionContext'
import { useContext } from 'react'

export function useSandboxSessionContext(): ISandboxSessionContext {
  const context = useContext(SandboxSessionContext)
  if (!context) {
    throw new Error('useSandboxSessionContext must be used within a SandboxSessionProvider')
  }
  return context
}
