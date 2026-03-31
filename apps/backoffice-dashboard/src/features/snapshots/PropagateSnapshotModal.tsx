/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Checkbox } from '@dashboard/ui/checkbox'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { Badge } from '@dashboard/ui/badge'
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type { Snapshot } from '../../types'
import type { SnapshotPropagationResponseDto } from '@daytonaio/backoffice-api-client'
import { toast } from 'sonner'

interface PropagateSnapshotModalProps {
  snapshot: Snapshot | null
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const PropagateSnapshotModal = ({ snapshot, open, onClose, onSuccess }: PropagateSnapshotModalProps) => {
  const [region, setRegion] = useState('us')
  const [maxRunners, setMaxRunners] = useState(25)
  const [dryRun, setDryRun] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SnapshotPropagationResponseDto | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      // Reset form when modal closes
      setRegion('us')
      setMaxRunners(25)
      setDryRun(false)
      setResult(null)
      setError('')
    }
  }, [open])

  const handlePropagate = async (isDryRun: boolean) => {
    if (!snapshot) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await BackofficeApiClient.propagateSnapshot(snapshot.id, {
        region,
        maxRunners,
        dryRun: isDryRun,
      })

      setResult(response)

      if (isDryRun) {
        toast.success('Dry run completed - no changes made')
      } else {
        toast.success(`Snapshot propagated to ${response.insertedRecords} runner(s)`)
        if (onSuccess) {
          onSuccess()
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to propagate snapshot'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleRefreshStatus = async () => {
    // Re-run with dry run to get current status
    await handlePropagate(true)
  }

  if (!snapshot) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Propagate Snapshot</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto pr-2" style={{ maxHeight: 'calc(90vh - 8rem)' }}>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">Snapshot</div>
            <div className="text-lg font-bold">{snapshot.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{snapshot.id}</div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                placeholder="e.g., us, eu, asia"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground mt-1">Target region for propagation</p>
            </div>

            <div>
              <Label htmlFor="maxRunners">Max Runners</Label>
              <Input
                id="maxRunners"
                type="number"
                min={1}
                max={100}
                value={maxRunners}
                onChange={(e) => setMaxRunners(Math.max(1, Math.min(100, Number(e.target.value))))}
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground mt-1">Maximum number of runners (1-100)</p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="dryRun"
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(checked as boolean)}
                disabled={loading}
              />
              <Label htmlFor="dryRun" className="text-sm cursor-pointer">
                Dry run (preview without making changes)
              </Label>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  {result.insertedRecords > 0
                    ? `Propagation successful - ${result.insertedRecords} record(s) inserted`
                    : 'Preview completed'}
                </AlertDescription>
              </Alert>

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Propagation Summary</h3>
                  <Button variant="ghost" size="sm" onClick={handleRefreshStatus} disabled={loading}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Snapshot Ref</div>
                    <div className="font-mono text-xs">{result.snapshotRef}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Region</div>
                    <div className="font-medium">{result.region}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Eligible Runners</div>
                    <div className="text-2xl font-bold">{result.eligibleRunners}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Inserted Records</div>
                    <div className="text-2xl font-bold">{result.insertedRecords}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-sm mb-2">Current Status</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950 rounded">
                      <span className="text-xs">Ready</span>
                      <Badge variant="outline" className="bg-green-100 dark:bg-green-900">
                        {result.currentStatus.ready}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950 rounded">
                      <span className="text-xs">Pulling</span>
                      <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900">
                        {result.currentStatus.pulling_snapshot}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950 rounded">
                      <span className="text-xs">Failed</span>
                      <Badge variant="outline" className="bg-red-100 dark:bg-red-900">
                        {result.currentStatus.failed}
                      </Badge>
                    </div>
                  </div>
                </div>

                {result.warnings.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <ul className="list-disc list-inside text-sm">
                        {result.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t mt-auto">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handlePropagate(true)} disabled={loading}>
              Preview
            </Button>
            <Button onClick={() => handlePropagate(false)} disabled={loading}>
              {loading ? 'Propagating...' : 'Propagate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
