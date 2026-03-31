/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState } from 'react'
import { Button } from '@dashboard/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dashboard/ui/table'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/ui/card'
import { Checkbox } from '@dashboard/ui/checkbox'
import { Label } from '@dashboard/ui/label'
import { CheckCircle, XCircle, AlertTriangle, Upload } from 'lucide-react'
import { Spinner } from '@dashboard/ui/spinner'
import type { ParsedRunner } from '../utils/runnerParser'

interface ImportResult {
  domain: string
  success: boolean
  error?: {
    code: string
    message: string
  }
}

interface ImportResponse {
  totalProcessed: number
  successCount: number
  failureCount: number
  skippedCount: number
  results: ImportResult[]
  warnings: string[]
}

interface ConfirmStepProps {
  runners: ParsedRunner[]
  onImport: (runners: ParsedRunner[], skipErrors: boolean) => Promise<ImportResponse>
  onBack: () => void
  onCancel: () => void
  onSuccess: () => void
}

export const ConfirmStep = ({ runners, onImport, onBack, onCancel, onSuccess }: ConfirmStepProps) => {
  const [loading, setLoading] = useState(false)
  const [skipErrors, setSkipErrors] = useState(false)
  const [importData, setImportData] = useState<ImportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await onImport(runners, skipErrors)
      setImportData(result)

      if (result.successCount > 0) {
        // Wait a moment to show results, then call success
        setTimeout(() => {
          onSuccess()
        }, 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import runners')
    } finally {
      setLoading(false)
    }
  }

  const isComplete = importData !== null

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Step 4: Confirm & Import</h3>
        <p className="text-sm text-muted-foreground">
          {isComplete
            ? 'Import complete! Review the results below.'
            : 'Ready to import runners. Click the button below to proceed.'}
        </p>
      </div>

      {/* Pre-Import Summary */}
      {!isComplete && !loading && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total runners:</span>
                <span className="font-medium">{runners.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Will be imported:</span>
                <span className="font-medium text-green-600">{runners.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Skip Errors Option */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="skipErrors"
              checked={skipErrors}
              onCheckedChange={(checked) => setSkipErrors(checked === true)}
            />
            <Label htmlFor="skipErrors" className="text-sm cursor-pointer">
              Skip errors and continue importing valid runners
            </Label>
          </div>
        </>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Spinner className="h-8 w-8" />
          <span className="text-sm text-muted-foreground">Importing runners...</span>
          <p className="text-xs text-muted-foreground">This may take a few moments</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Import Results */}
      {importData && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{importData.totalProcessed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-green-600">Imported</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{importData.successCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-yellow-600">Skipped</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{importData.skippedCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-red-600">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{importData.failureCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* Success Message */}
          {importData.successCount > 0 && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Successfully imported {importData.successCount} runner{importData.successCount > 1 ? 's' : ''}!
              </AlertDescription>
            </Alert>
          )}

          {/* Warnings */}
          {importData.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-1">Warnings:</div>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {importData.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Detailed Results */}
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
                  {importData.results.map((result, index) => (
                    <TableRow
                      key={index}
                      className={
                        result.success
                          ? 'bg-green-50'
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
                          <span className="text-green-600">Imported successfully</span>
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
        </>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <div className="space-x-2">
          {!isComplete && (
            <>
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
            </>
          )}
        </div>
        {!isComplete && (
          <Button onClick={handleImport} disabled={loading} className="min-w-[140px]">
            {loading ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import Runners
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
