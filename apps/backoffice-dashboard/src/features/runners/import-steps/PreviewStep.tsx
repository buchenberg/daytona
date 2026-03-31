/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { Button } from '@dashboard/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dashboard/ui/table'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/ui/card'
import { AlertCircle, CheckCircle, RefreshCw, XCircle, AlertTriangle } from 'lucide-react'
import { Spinner } from '@dashboard/ui/spinner'
import type { ParsedRunner } from '../utils/runnerParser'

interface PreviewResult {
  domain: string
  success: boolean
  error?: {
    code: string
    message: string
  }
}

interface PreviewResponse {
  totalProcessed: number
  successCount: number
  failureCount: number
  skippedCount: number
  results: PreviewResult[]
  warnings: string[]
}

interface PreviewStepProps {
  runners: ParsedRunner[]
  onNext: () => void
  onBack: () => void
  onCancel: () => void
  onDryRun: (runners: ParsedRunner[]) => Promise<PreviewResponse>
}

export const PreviewStep = ({ runners, onNext, onBack, onCancel, onDryRun }: PreviewStepProps) => {
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Auto-run dry-run on mount
  useEffect(() => {
    handleDryRun()
  }, [])

  const handleDryRun = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await onDryRun(runners)
      setPreviewData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate runners')
    } finally {
      setLoading(false)
    }
  }

  const canProceed = previewData && previewData.successCount > 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Step 3: Preview & Validate</h3>
        <p className="text-sm text-muted-foreground">
          Validating runners with the server. This will check for duplicates and validate all fields.
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-8 w-8" />
          <span className="ml-3 text-sm text-muted-foreground">Validating runners...</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Preview Results */}
      {previewData && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{previewData.totalProcessed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-green-600">Will Succeed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{previewData.successCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-yellow-600">Duplicates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{previewData.skippedCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-red-600">Will Fail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{previewData.failureCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* Warnings */}
          {previewData.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-1">Warnings:</div>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {previewData.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Results Table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Status</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.results.map((result, index) => (
                    <TableRow
                      key={index}
                      className={
                        result.success
                          ? ''
                          : result.error?.code === 'DUPLICATE' || result.error?.code === 'DUPLICATE_IN_BATCH'
                            ? 'bg-yellow-50'
                            : 'bg-red-50'
                      }
                    >
                      <TableCell>
                        {result.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : result.error?.code === 'DUPLICATE' || result.error?.code === 'DUPLICATE_IN_BATCH' ? (
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{result.domain}</TableCell>
                      <TableCell className="text-sm">
                        {result.success ? (
                          <span className="text-green-600">Ready to import</span>
                        ) : (
                          <span
                            className={
                              result.error?.code === 'DUPLICATE' || result.error?.code === 'DUPLICATE_IN_BATCH'
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }
                          >
                            {result.error?.message || 'Unknown error'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Re-run Button */}
          <Button variant="outline" onClick={handleDryRun} disabled={loading} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Re-run Validation
          </Button>
        </>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <div className="space-x-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
        <Button onClick={onNext} disabled={!canProceed || loading}>
          Next
        </Button>
      </div>
    </div>
  )
}
