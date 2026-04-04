/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Database,
  Server,
  Camera,
  Building2,
  Users,
  MapPin,
  UserCircle,
  ClipboardList,
  MessageCircle,
} from 'lucide-react'
import { Logo, LogoText } from '@backoffice/assets/Logo'
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@dashboard/ui/sidebar'

const navigation = [
  { name: 'Sandboxes', href: '/sandboxes', icon: Database },
  { name: 'Runners', href: '/runners', icon: Server },
  { name: 'Snapshots', href: '/snapshots', icon: Camera },
  { name: 'Organizations', href: '/organizations', icon: Building2 },
  { name: 'Organization Users', href: '/organization-users', icon: Users },
  { name: 'Region Quotas', href: '/region-quotas', icon: MapPin },
  { name: 'Users', href: '/users', icon: UserCircle },
  { name: 'Audit Logs', href: '/audit-logs', icon: ClipboardList },
  { name: 'mali', href: '/chat', icon: MessageCircle },
]

export function Sidebar() {
  const location = useLocation()
  const sidebar = useSidebar()
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then((data) => setVersion(data.version || 'dev'))
      .catch(() => setVersion('dev'))
  }, [])

  return (
    <SidebarComponent collapsible="icon" isBannerVisible={false}>
      <SidebarContent>
        <SidebarGroup>
          <div className="flex justify-between items-center gap-2 px-2 mb-2 h-12">
            <div className="flex items-center gap-2 group-data-[state=collapsed]:hidden text-primary">
              <Logo />
              <LogoText />
            </div>
            <SidebarTrigger className="p-2 [&_svg]:size-5" />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} className="text-sm">
                      <Link to={item.href}>
                        <item.icon size={16} strokeWidth={1.5} />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center w-full justify-center gap-2 mt-2 overflow-auto min-h-4 whitespace-nowrap">
              {sidebar.state === 'expanded' && version && (
                <span className="text-xs text-muted-foreground">Version {version}</span>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarComponent>
  )
}
