import { EditWarmPoolDialog } from '@/components/EditWarmPoolDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useRegionLookup } from '@/hooks/queries/useRegionsQuery'
import { useCreateWarmPoolMutation } from '@/hooks/mutations/useCreateWarmPoolMutation'
import { useDeleteWarmPoolMutation } from '@/hooks/mutations/useDeleteWarmPoolMutation'
import { useUpdateWarmPoolMutation } from '@/hooks/mutations/useUpdateWarmPoolMutation'
import { useWarmPoolsQuery } from '@/hooks/queries/useWarmPoolsQuery'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useWarmPoolWsSync } from '@/hooks/useWarmPoolWsSync'
import { FeatureFlags } from '@/enums/FeatureFlags'
import { handleApiError } from '@/lib/error-handling'
import { cn } from '@/lib/utils'
import {
  OrganizationRolePermissionsEnum,
  SnapshotDto,
  SnapshotState,
  UpdateWarmPool,
  WarmPool,
} from '@daytona/api-client'
import { Trash2 } from 'lucide-react'
import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { InfoRow, InfoSection } from '@/components/sandboxes/SandboxInfoPanel'

export function SnapshotWarmPools({ snapshot }: { snapshot: SnapshotDto }) {
  const enabled = useFeatureFlagEnabled(FeatureFlags.SELF_SERVE_WARM_POOL)

  if (!enabled) {
    return null
  }

  // Keyed by snapshot so picker/size state resets when the sheet navigates to another snapshot.
  return <SnapshotWarmPoolsSection key={snapshot.id} snapshot={snapshot} />
}

function SnapshotWarmPoolsSection({ snapshot }: { snapshot: SnapshotDto }) {
  const { selectedOrganization, authenticatedUserHasPermission } = useSelectedOrganization()
  const { data: warmPools = [] } = useWarmPoolsQuery()
  useWarmPoolWsSync()

  const createWarmPoolMutation = useCreateWarmPoolMutation()
  const updateWarmPoolMutation = useUpdateWarmPoolMutation()
  const deleteWarmPoolMutation = useDeleteWarmPoolMutation()

  const [newPoolSize, setNewPoolSize] = useState(1)
  const [newPoolRegionId, setNewPoolRegionId] = useState('')

  const { getRegionName } = useRegionLookup(selectedOrganization?.id)
  const [warmPoolToEdit, setWarmPoolToEdit] = useState<WarmPool | null>(null)
  const [warmPoolToDelete, setWarmPoolToDelete] = useState<WarmPool | null>(null)

  const writePermitted = authenticatedUserHasPermission(OrganizationRolePermissionsEnum.WRITE_SANDBOXES)
  const deletePermitted = authenticatedUserHasPermission(OrganizationRolePermissionsEnum.DELETE_SANDBOXES)

  // Warm pools store the resolved snapshot name (see WarmPoolService.createWarmPool).
  const pools = warmPools.filter((pool) => pool.snapshot === snapshot.name)

  // The section shows one region at a time, from the regions the snapshot is available in.
  const regionOptions = snapshot.regionIds ?? []
  const orgDefaultRegionId = selectedOrganization?.defaultRegionId

  // The user's pick, else a region that already has a pool, else the org default, else the first.
  const selectedRegionId =
    newPoolRegionId ||
    pools[0]?.target ||
    (orgDefaultRegionId && regionOptions.includes(orgDefaultRegionId) ? orgDefaultRegionId : regionOptions[0])
  const pool = pools.find((pool) => pool.target === selectedRegionId)

  const canAdd = writePermitted && snapshot.state === SnapshotState.ACTIVE && !snapshot.gpu && !!selectedRegionId

  if (!pools.length && !canAdd) {
    return null
  }

  const handleCreate = async () => {
    try {
      await createWarmPoolMutation.mutateAsync({
        warmPool: { snapshot: snapshot.name, pool: newPoolSize, target: selectedRegionId },
        organizationId: selectedOrganization?.id,
      })
      setNewPoolSize(1)
      toast.success(`Creating warm pool for ${snapshot.name}`)
    } catch (error) {
      handleApiError(error, 'Failed to create warm pool')
    }
  }

  const handleUpdate = async (warmPoolId: string, data: UpdateWarmPool): Promise<boolean> => {
    try {
      await updateWarmPoolMutation.mutateAsync({
        warmPoolId,
        warmPool: data,
        organizationId: selectedOrganization?.id,
      })
      toast.success('Warm pool updated')
      return true
    } catch (error) {
      handleApiError(error, 'Failed to update warm pool')
      return false
    }
  }

  const handleDelete = async (warmPool: WarmPool) => {
    try {
      await deleteWarmPoolMutation.mutateAsync({
        warmPoolId: warmPool.id,
        organizationId: selectedOrganization?.id,
      })
      setWarmPoolToDelete(null)
      toast.success(`Deleting warm pool for ${warmPool.snapshot}`)
    } catch (error) {
      handleApiError(error, 'Failed to delete warm pool')
    }
  }

  return (
    <InfoSection title="Warm Pool">
      {regionOptions.length > 0 && (
        <div className="mb-2 flex items-center gap-1">
          <Select value={selectedRegionId} onValueChange={setNewPoolRegionId} disabled={regionOptions.length === 1}>
            <SelectTrigger
              size="xs"
              aria-label="Select region"
              className={cn(
                'w-auto max-w-40 gap-x-2 border bg-secondary px-2 text-secondary-foreground lowercase hover:bg-secondary/80 data-popup-open:bg-secondary/80',
                {
                  'pointer-events-none select-none disabled:opacity-100 [&>svg]:hidden': regionOptions.length === 1,
                },
              )}
            >
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent className="min-w-24 max-w-48" align="start">
              {regionOptions.map((regionId) => (
                <SelectItem key={regionId} value={regionId} className="lowercase">
                  {getRegionName(regionId) ?? regionId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {pool ? (
        <div>
          <InfoRow label="Ready">
            <Badge variant={pool.currentSize >= pool.pool ? 'success' : 'warning'}>
              {pool.currentSize} / {pool.pool}
            </Badge>
          </InfoRow>
          {pool.errorReason && <p className="text-sm text-destructive-foreground break-words">{pool.errorReason}</p>}
          {(writePermitted || deletePermitted) && (
            <div className="flex items-center justify-end gap-2 pt-2">
              {writePermitted && (
                <Button variant="outline" size="sm" onClick={() => setWarmPoolToEdit(pool)}>
                  Edit
                </Button>
              )}
              {deletePermitted && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Delete warm pool"
                  className="text-destructive-foreground hover:bg-destructive/10 hover:text-destructive-foreground"
                  onClick={() => setWarmPoolToDelete(pool)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      ) : canAdd ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Keep sandboxes pre-warmed from this snapshot so they start instantly. Warm sandboxes count against your
            quota.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="h-8 w-20"
              aria-label="Pool size"
              value={newPoolSize}
              onChange={(e) => setNewPoolSize(Number.isNaN(e.target.valueAsNumber) ? 1 : e.target.valueAsNumber)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreate}
              disabled={
                createWarmPoolMutation.isPending || newPoolSize < 1 || !selectedOrganization?.id || !selectedRegionId
              }
            >
              {createWarmPoolMutation.isPending && <Spinner />}
              Add warm pool
            </Button>
          </div>
        </div>
      ) : null}

      {warmPoolToEdit && (
        <EditWarmPoolDialog
          warmPool={warmPoolToEdit}
          open={!!warmPoolToEdit}
          onOpenChange={(isOpen) => !isOpen && setWarmPoolToEdit(null)}
          onUpdateWarmPool={handleUpdate}
          loading={updateWarmPoolMutation.isPending}
        />
      )}

      {warmPoolToDelete && (
        <Dialog open={!!warmPoolToDelete} onOpenChange={(isOpen) => !isOpen && setWarmPoolToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Warm Pool Deletion</DialogTitle>
              <DialogDescription>
                This drains all pre-warmed sandboxes for{' '}
                <span className="font-medium">{warmPoolToDelete.snapshot}</span>. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                }
              />
              <Button
                variant="destructive"
                onClick={() => handleDelete(warmPoolToDelete)}
                disabled={deleteWarmPoolMutation.isPending}
              >
                {deleteWarmPoolMutation.isPending && <Spinner />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </InfoSection>
  )
}
