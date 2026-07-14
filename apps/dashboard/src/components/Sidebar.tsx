import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { FeatureFlags } from '@/enums/FeatureFlags'
import { routes } from '@/routes/paths'
import { useCommandPaletteAnalytics } from '@/hooks/useCommandPaletteAnalytics'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { cn, getMetaKey } from '@/lib/utils'
import { lazyRoutes } from '@/routes'
import { usePylonCommands } from '@/vendor/pylon'
import { OrganizationRolePermissionsEnum, OrganizationUserRoleEnum } from '@daytona/api-client'
import {
  ArrowRightIcon,
  Box,
  ChartColumn,
  Container,
  CreditCard,
  HardDrive,
  Joystick,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Mail,
  MapPinned,
  PackageOpen,
  SearchIcon,
  Server,
  Settings,
  ShieldCheck,
  TextSearch,
  Users,
} from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useFeatureFlagEnabled } from 'posthog-js/react'
import React, { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { AnimatedLogo } from './AnimatedLogo'
import { CommandConfig, useCommandPaletteActions, useRegisterCommands } from './CommandPalette'
import { OrganizationPicker } from './Organizations/OrganizationPicker'
import { Kbd } from './ui/kbd'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'

interface SidebarProps {
  isBannerVisible: boolean
  billingEnabled: boolean
  version: string
}

interface SidebarItem {
  icon: React.ReactElement
  label: string
  path: string
  onClick?: () => void
  preload?: () => Promise<unknown>
}

function preloadSidebarItem(item: Pick<SidebarItem, 'preload'>) {
  item.preload?.().catch(() => {
    // React Router will surface import failures when the route renders.
  })
}

const useNavCommands = (items: SidebarItem[]) => {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const navCommands: CommandConfig[] = useMemo(
    () =>
      items
        .filter((item) => item.path !== pathname)
        .map((item) => ({
          id: `nav-${item.path}`,
          label: `Go to ${item.label}`,
          icon: <ArrowRightIcon className="w-4 h-4" />,
          onSelect: () => {
            preloadSidebarItem(item)
            navigate(item.path)
          },
        })),
    [pathname, navigate, items],
  )

  useRegisterCommands(navCommands, { groupId: 'navigation', groupLabel: 'Navigation', groupOrder: 1 })
}

export function Sidebar({ isBannerVisible, billingEnabled, version }: SidebarProps) {
  const { pathname, search } = useLocation()
  const sidebar = useSidebar()
  const { isMobile, setOpenMobile } = sidebar
  const { authenticatedUserOrganizationMember, authenticatedUserHasPermission } = useSelectedOrganization()
  const orgInfraEnabled = useFeatureFlagEnabled(FeatureFlags.ORGANIZATION_INFRASTRUCTURE)

  const sidebarItems = useMemo(() => {
    const arr: SidebarItem[] = [
      {
        icon: <Container size={16} strokeWidth={1.5} />,
        label: 'Sandboxes',
        path: routes.sandboxes.path,
        preload: lazyRoutes.Sandboxes,
      },
      {
        icon: <Box size={16} strokeWidth={1.5} />,
        label: 'Snapshots',
        path: routes.snapshots.path,
        preload: lazyRoutes.Snapshots,
      },
      {
        icon: <PackageOpen size={16} strokeWidth={1.5} />,
        label: 'Registries',
        path: routes.registries.path,
        preload: lazyRoutes.Registries,
      },
    ]
    if (authenticatedUserHasPermission(OrganizationRolePermissionsEnum.READ_VOLUMES)) {
      arr.push({
        icon: <HardDrive size={16} strokeWidth={1.5} />,
        label: 'Volumes',
        path: routes.volumes.path,
        preload: lazyRoutes.Volumes,
      })
    }

    if (authenticatedUserHasPermission(OrganizationRolePermissionsEnum.READ_AUDIT_LOGS)) {
      arr.push({
        icon: <TextSearch size={16} strokeWidth={1.5} />,
        label: 'Audit Logs',
        path: routes.auditLogs.path,
        preload: lazyRoutes.AuditLogs,
      })
    }

    return arr
  }, [authenticatedUserHasPermission])

  const settingsItems = useMemo(() => {
    const arr: SidebarItem[] = [
      {
        icon: <KeyRound size={16} strokeWidth={1.5} />,
        label: 'API Keys',
        path: routes.keys.path,
        preload: lazyRoutes.Keys,
      },
      {
        icon: <ShieldCheck size={16} strokeWidth={1.5} />,
        label: 'Secrets',
        path: routes.secrets.path,
        preload: lazyRoutes.Secrets,
      },
    ]

    arr.push({
      icon: <Mail size={16} strokeWidth={1.5} />,
      label: 'Webhooks',
      path: routes.webhooks.path,
      preload: lazyRoutes.Webhooks,
    })

    if (authenticatedUserHasPermission(OrganizationRolePermissionsEnum.READ_LIMITS)) {
      arr.push({
        icon: <LockKeyhole size={16} strokeWidth={1.5} />,
        label: 'Limits',
        path: routes.limits.path,
        preload: lazyRoutes.Limits,
      })
    }

    arr.push({
      icon: <Users size={16} strokeWidth={1.5} />,
      label: 'Members',
      path: routes.members.path,
      preload: lazyRoutes.OrganizationMembers,
    })
    // TODO: uncomment when we allow creating custom roles
    // if (authenticatedUserOrganizationMember?.role === OrganizationUserRoleEnum.OWNER) {
    //   arr.push({ icon: <UserCog className="w-5 h-5" />, label: 'Roles', path: routes.roles.path })
    // }

    arr.push({
      icon: <Settings size={16} strokeWidth={1.5} />,
      label: 'Settings',
      path: routes.settings.path,
      preload: lazyRoutes.OrganizationSettings,
    })

    return arr
  }, [authenticatedUserHasPermission])

  const billingItems = useMemo(() => {
    if (!billingEnabled || authenticatedUserOrganizationMember?.role !== OrganizationUserRoleEnum.OWNER) {
      return []
    }

    return [
      {
        icon: <ChartColumn size={16} strokeWidth={1.5} />,
        label: 'Spending',
        path: routes.billingSpending.path,
        preload: lazyRoutes.Spending,
      },
      {
        icon: <CreditCard size={16} strokeWidth={1.5} />,
        label: 'Wallet',
        path: routes.billingWallet.path,
        preload: lazyRoutes.Wallet,
      },
    ]
  }, [billingEnabled, authenticatedUserOrganizationMember?.role])

  const infrastructureItems = useMemo(() => {
    if (!orgInfraEnabled) {
      return []
    }

    const arr = [
      {
        icon: <MapPinned size={16} strokeWidth={1.5} />,
        label: 'Regions',
        path: routes.regions.path,
        preload: lazyRoutes.Regions,
      },
    ]

    if (authenticatedUserHasPermission(OrganizationRolePermissionsEnum.READ_RUNNERS)) {
      arr.push({
        icon: <Server size={16} strokeWidth={1.5} />,
        label: 'Runners',
        path: routes.runners.path,
        preload: lazyRoutes.Runners,
      })
    }

    return arr
  }, [authenticatedUserHasPermission, orgInfraEnabled])

  const miscItems = useMemo(() => {
    return [
      {
        icon: <Joystick size={16} strokeWidth={1.5} />,
        label: 'Playground',
        path: routes.playground.path,
        preload: lazyRoutes.Playground,
      },
    ]
  }, [])

  const sidebarGroups: { label: string; items: SidebarItem[] }[] = useMemo(() => {
    return [
      { label: 'Sandboxes', items: sidebarItems },
      {
        label: 'Misc',
        items: miscItems,
      },
      { label: 'Settings', items: settingsItems },
      { label: 'Billing', items: billingItems },
      { label: 'Infrastructure', items: infrastructureItems },
    ].filter((group) => group.items.length > 0)
  }, [sidebarItems, settingsItems, billingItems, infrastructureItems, miscItems])

  const commandItems = useMemo(() => {
    return sidebarGroups
      .flatMap((group) => group.items)
      .concat(
        {
          path: routes.accountSettings.path,
          label: 'Account Settings',
          icon: <Settings size={16} strokeWidth={1.5} />,
          preload: lazyRoutes.AccountSettings,
        },
        {
          path: routes.userInvitations.path,
          label: 'Invitations',
          icon: <Mail size={16} strokeWidth={1.5} />,
          preload: lazyRoutes.UserOrganizationInvitations,
        },
        {
          path: routes.onboarding.path,
          label: 'Onboarding',
          icon: <ListChecks size={16} strokeWidth={1.5} />,
          preload: lazyRoutes.Onboarding,
        },
      )
  }, [sidebarGroups])

  usePylonCommands()

  useNavCommands(commandItems)

  const commandPaletteActions = useCommandPaletteActions()
  const { trackOpened } = useCommandPaletteAnalytics()
  const metaKey = getMetaKey()

  React.useEffect(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [isMobile, pathname, search, setOpenMobile])

  const sidebarExpanded = sidebar.open || sidebar.openMobile

  return (
    <SidebarComponent isBannerVisible={isBannerVisible} collapsible="icon">
      <SidebarHeader>
        <div
          className={cn('flex h-[46px] items-center justify-between gap-2 px-2 pt-2', {
            'justify-center px-0': !sidebarExpanded,
          })}
        >
          <div className="flex items-center gap-2 group-data-[state=collapsed]:hidden text-primary">
            <AnimatePresence initial={false}>
              {sidebarExpanded && <AnimatedLogo className={cn('w-[117px]')} key={String(sidebar.open)} />}
            </AnimatePresence>
          </div>
          <div className="relative">
            <SidebarTrigger className={cn('p-2 [&_svg]:size-5 transition-all peer')} />
          </div>
        </div>
      </SidebarHeader>
      <Separator className="mx-0 w-full" />
      <SidebarContent className="pt-4">
        <SidebarMenu className="px-2 pb-2 gap-2">
          <OrganizationPicker />
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`Search ${metaKey}+K`}
              variant="outline"
              className="justify-between"
              onClick={() => {
                trackOpened('sidebar_search')
                commandPaletteActions.setIsOpen(true)
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <SearchIcon className="size-4" />
                <span className="truncate group-data-[collapsible=icon]:hidden">Search</span>
              </span>
              <Kbd className="ml-auto whitespace-nowrap group-data-[collapsible=icon]:hidden">{metaKey} K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ScrollArea fade="mask" className="overflow-auto flex-1">
          {sidebarGroups.map((group, i) => (
            <React.Fragment key={group.label}>
              {i > 0 && <SidebarSeparator />}
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          isActive={pathname.startsWith(item.path)}
                          className="text-sm"
                          tooltip={item.label}
                          render={
                            item.onClick ? (
                              <button onClick={() => item.onClick?.()}>
                                {item.icon}
                                <span>{item.label}</span>
                              </button>
                            ) : (
                              <Link
                                to={item.path}
                                onPointerEnter={() => preloadSidebarItem(item)}
                                onFocus={() => preloadSidebarItem(item)}
                              >
                                {item.icon}
                                <span>{item.label}</span>
                              </Link>
                            )
                          }
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </React.Fragment>
          ))}
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="pb-4">
        <div className="px-2 text-left text-xs text-muted-foreground group-data-[collapsible=icon]:hidden overflow-hidden whitespace-nowrap">
          Version {version}
        </div>
      </SidebarFooter>
    </SidebarComponent>
  )
}
