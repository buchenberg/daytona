/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@dashboard/ui/dialog'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Label } from '@dashboard/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { AlertCircle, CheckCircle } from 'lucide-react'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type { Snapshot } from '../../types'
import { toast } from 'sonner'

interface AddToWarmPoolModalProps {
  snapshot: Snapshot | null
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const AddToWarmPoolModal = ({ snapshot, open, onClose, onSuccess }: AddToWarmPoolModalProps) => {
  const [pool, setPool] = useState(20)
  const [target, setTarget] = useState<'us' | 'eu'>('us')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!open) {
      // Reset form when modal closes
      setPool(20)
      setTarget('us')
      setError('')
      setSuccess(false)
    }
  }, [open])

  const handleAdd = async () => {
    if (!snapshot) return

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const response = await BackofficeApiClient.addToWarmPool(snapshot.id, {
        pool,
        target,
      })

      if (response.success) {
        setSuccess(true)
        toast.success('Snapshot added to warm pool successfully')
        if (onSuccess) {
          onSuccess()
        }
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError(response.error || 'Failed to add to warm pool')
        toast.error(response.error || 'Failed to add to warm pool')
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to add to warm pool'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (!snapshot) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Warm Pool</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">Snapshot</div>
            <div className="text-lg font-bold">{snapshot.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{snapshot.id}</div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="pool">Pool Number</Label>
              <Input
                id="pool"
                type="number"
                min={1}
                max={100}
                value={pool}
                onChange={(e) => setPool(Math.max(1, Number(e.target.value)))}
                disabled={loading || success}
              />
              <p className="text-sm text-muted-foreground mt-1">Pool identifier (e.g., 20)</p>
            </div>

            <div>
              <Label htmlFor="target">Target Region</Label>
              <Select
                value={target}
                onValueChange={(value: 'us' | 'eu') => setTarget(value)}
                disabled={loading || success}
              >
                <SelectTrigger id="target">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">US</SelectItem>
                  <SelectItem value="eu">EU</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">Target deployment region</p>
            </div>
          </div>

          <div className="rounded-lg border p-3 bg-muted/50">
            <div className="text-sm font-medium mb-2">Snapshot Resources</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>CPU: {snapshot.cpu}</div>
              <div>Memory: {snapshot.mem} GB</div>
              <div>Disk: {snapshot.disk} GB</div>
              <div>GPU: {snapshot.gpu}</div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>Snapshot added to warm pool and copied to admin organization!</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={loading || success}>
            {loading ? 'Adding...' : success ? 'Done' : 'Add to Warm Pool'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
