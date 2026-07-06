/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useBalancesQuery } from '@/hooks/queries/useBalancesQuery'
import { formatMoney } from '@/lib/utils'
import { Balance, BalanceType } from '@daytona/billing-api-client'
import { ChevronLeft, ChevronRight, RefreshCcw, TagIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

const PAGE_SIZE = 5

// "Prepaid Commit" balances created on these days (UTC) hold a mix of free and
// paid credits, so neither the credit nor the commit label is accurate.
const MIXED_CREDIT_NAME = 'Prepaid Commit'
const MIXED_CREDIT_DATES = ['2026-05-15', '2026-05-18']

interface BalancesCardProps {
  organizationId: string
}

export function BalancesCard({ organizationId }: BalancesCardProps) {
  const balancesQuery = useBalancesQuery({ organizationId, limit: PAGE_SIZE })
  const [pageIndex, setPageIndex] = useState(0)

  const pages = balancesQuery.data?.pages ?? []
  const currentPage = Math.min(pageIndex, Math.max(0, pages.length - 1))
  const page = pages[currentPage]
  const hasNextPage = currentPage < pages.length - 1 || Boolean(page?.hasMore)
  const showPagination = pages.length > 1 || Boolean(page?.hasMore)

  // Expired balances sink to the end of the page; API order preserved otherwise.
  const balances = useMemo(() => {
    const items = page?.data ?? []
    const active = items.filter((balance) => !isExpired(balance))
    const expired = items.filter(isExpired)
    return [...active, ...expired]
  }, [page])

  const handleNextPage = useCallback(async () => {
    if (currentPage < pages.length - 1) {
      setPageIndex(currentPage + 1)
      return
    }

    if (!page?.hasMore || balancesQuery.isFetchingNextPage) {
      return
    }

    try {
      await balancesQuery.fetchNextPage({ throwOnError: true })
      setPageIndex(currentPage + 1)
    } catch (error) {
      toast.error('Failed to load balances', {
        description: String(error),
      })
    }
  }, [currentPage, pages.length, page, balancesQuery])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Balances</CardTitle>
        <CardDescription>Credit balances available on your organization and when they expire.</CardDescription>
      </CardHeader>
      <CardContent>
        {balancesQuery.isLoading ? (
          <BalancesSkeleton />
        ) : balancesQuery.isError && !page ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Something went wrong while fetching your balances.</p>
            <Button variant="outline" size="sm" onClick={() => balancesQuery.refetch()}>
              <RefreshCcw className="size-4" />
              Retry
            </Button>
          </div>
        ) : balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active balances.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {balances.map((balance, index) => (
              <BalanceItem key={balance.id ?? index} balance={balance} />
            ))}
            {showPagination && (
              <div className="flex items-center justify-end gap-4">
                <span className="text-sm font-medium text-muted-foreground">Page {currentPage + 1}</span>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setPageIndex(currentPage - 1)}
                    disabled={currentPage === 0}
                  >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={handleNextPage}
                    disabled={!hasNextPage || balancesQuery.isFetchingNextPage}
                  >
                    <span className="sr-only">Go to next page</span>
                    {balancesQuery.isFetchingNextPage ? <Spinner /> : <ChevronRight />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BalanceItem({ balance }: { balance: Balance }) {
  const available = (balance.balanceCents ?? 0) / 100
  const total = (balance.grantedAmountCents ?? 0) / 100
  const used = Math.max(0, total - available)
  const remainingPercentage = total > 0 ? (available / total) * 100 : 0
  const expired = isExpired(balance)
  const typeBadge = getTypeBadge(balance)
  const applicableProducts = balance.applicableTo?.productNames ?? []
  const applicableTags = balance.applicableTo?.productTags ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{balance.name || 'Credits'}</span>
          {typeBadge && <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>}
          {expired && <Badge variant="destructive">Expired</Badge>}
        </div>
        <div className="shrink-0 text-sm">
          <span className="font-medium">{formatMoney(available)}</span>
          <span className="text-muted-foreground"> of {formatMoney(total)}</span>
        </div>
      </div>
      <Progress value={remainingPercentage} indicatorClassName={expired ? 'bg-muted-foreground/40' : undefined} />
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>{formatMoney(used)} used</span>
        <span>{formatExpiration(balance.expiresAt, expired)}</span>
      </div>
      {(applicableProducts.length > 0 || applicableTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Applies to</span>
          {applicableProducts.map((product) => (
            <Badge key={`product-${product}`} variant="secondary">
              {product}
            </Badge>
          ))}
          {applicableTags.map((tag) => (
            <Badge key={`tag-${tag}`} variant="outline">
              <TagIcon className="mr-1 size-3" />
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function getTypeBadge(balance: Balance): { label: string; variant: 'success' | 'info' | 'secondary' } | null {
  if (isMixedCredit(balance)) {
    return { label: 'Mixed credit', variant: 'secondary' }
  }

  if (!balance.type) {
    return null
  }

  return balance.type === BalanceType.BalanceTypeCredit
    ? { label: 'Free credit', variant: 'success' }
    : { label: 'Paid credit', variant: 'info' }
}

function isMixedCredit(balance: Balance): boolean {
  if (balance.name !== MIXED_CREDIT_NAME || !balance.createdAt) {
    return false
  }

  const created = new Date(balance.createdAt)
  if (Number.isNaN(created.getTime())) {
    return false
  }

  return MIXED_CREDIT_DATES.includes(created.toISOString().slice(0, 10))
}

function isExpired(balance: Balance): boolean {
  if (!balance.expiresAt) {
    return false
  }

  const time = new Date(balance.expiresAt).getTime()
  return !Number.isNaN(time) && time < Date.now()
}

function formatExpiration(expiresAt: string | undefined, expired: boolean): string {
  if (!expiresAt) {
    return 'Never expires'
  }

  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) {
    return 'Never expires'
  }

  const formatted = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return expired ? `Expired ${formatted}` : `Expires ${formatted}`
}

function BalancesSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-48 max-w-full" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}
