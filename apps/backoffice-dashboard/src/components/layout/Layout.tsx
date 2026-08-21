import { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return <div className="flex h-screen overflow-hidden bg-background">{children}</div>
}
