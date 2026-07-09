/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
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
import { usePermissions } from '../../providers/ApiProvider'
import { APP_ROUTES, canAccessRoute } from '../../routes'

export function Sidebar() {
  const location = useLocation()
  const sidebar = useSidebar()
  const permissions = usePermissions()
  const [version, setVersion] = useState<string>('')

  const visibleRoutes = APP_ROUTES.filter((route) => canAccessRoute(permissions, route))

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
              {visibleRoutes.map((route) => {
                const isActive = location.pathname === route.path || location.pathname.startsWith(route.path + '/')
                const Icon = route.icon
                return (
                  <SidebarMenuItem key={route.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      className="text-sm"
                      render={
                        <Link to={route.path}>
                          <Icon size={16} strokeWidth={1.5} />
                          <span>{route.name}</span>
                        </Link>
                      }
                    />
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
