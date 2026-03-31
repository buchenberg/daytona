/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect } from 'react'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dashboard/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dashboard/ui/table'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { validateRunner, type ParsedRunner } from '../utils/runnerParser'

interface EditStepProps {
  initialRunners: ParsedRunner[]
  onNext: (runners: ParsedRunner[]) => void
  onBack: () => void
  onCancel: () => void
}

export const EditStep = ({ initialRunners, onNext, onBack, onCancel }: EditStepProps) => {
  const [runners, setRunners] = useState<ParsedRunner[]>(initialRunners)
  const [validationErrors, setValidationErrors] = useState<Record<number, string[]>>({})

  // Validate all runners on mount and when runners change
  useEffect(() => {
    const errors: Record<number, string[]> = {}
    runners.forEach((runner, index) => {
      const runnerErrors = validateRunner(runner)
      if (runnerErrors.length > 0) {
        errors[index] = runnerErrors
      }
    })
    setValidationErrors(errors)
  }, [runners])

  const handleFieldChange = (index: number, field: keyof ParsedRunner, value: string | number) => {
    const newRunners = [...runners]
    newRunners[index] = { ...newRunners[index], [field]: value }
    setRunners(newRunners)
  }

  const handleAddRow = () => {
    const lastRunner = runners[runners.length - 1]
    setRunners([
      ...runners,
      {
        domain: '',
        apiKey: '',
        region: lastRunner?.region || 'US',
        cpu: lastRunner?.cpu || 64,
        memoryGiB: lastRunner?.memoryGiB || 768,
        diskGiB: lastRunner?.diskGiB || 7065,
        class: lastRunner?.class || 'small',
      },
    ])
  }

  const handleDeleteRow = (index: number) => {
    setRunners(runners.filter((_, i) => i !== index))
  }

  const handleNext = () => {
    if (Object.keys(validationErrors).length > 0) {
      return
    }
    onNext(runners)
  }

  const hasErrors = Object.keys(validationErrors).length > 0
  const validCount = runners.length - Object.keys(validationErrors).length

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Step 2: Edit & Review</h3>
        <p className="text-sm text-muted-foreground">
          Review and edit the parsed runners. You can modify any field, add new rows, or delete rows.
        </p>
        <div className="mt-2 text-sm">
          <span className="font-medium">{validCount}</span> valid,{' '}
          <span className="font-medium">{Object.keys(validationErrors).length}</span> invalid
        </div>
      </div>

      {/* Editable Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Domain</TableHead>
                <TableHead className="w-[150px]">API Token</TableHead>
                <TableHead className="w-[100px]">Region</TableHead>
                <TableHead className="w-[80px]">CPU</TableHead>
                <TableHead className="w-[100px]">Memory (GB)</TableHead>
                <TableHead className="w-[100px]">Disk (GB)</TableHead>
                <TableHead className="w-[100px]">Class</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runners.map((runner, index) => {
                const errors = validationErrors[index]
                const hasError = errors && errors.length > 0

                return (
                  <TableRow key={index} className={hasError ? 'bg-destructive/10' : ''}>
                    <TableCell>
                      <Input
                        value={runner.domain}
                        onChange={(e) => handleFieldChange(index, 'domain', e.target.value)}
                        className={`h-8 text-xs ${hasError ? 'border-destructive' : ''}`}
                        placeholder="h1321.daytona.work"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={runner.apiKey}
                        onChange={(e) => handleFieldChange(index, 'apiKey', e.target.value)}
                        className={`h-8 text-xs font-mono ${hasError ? 'border-destructive' : ''}`}
                        placeholder="API token..."
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={runner.region}
                        onChange={(e) => handleFieldChange(index, 'region', e.target.value)}
                        className={`h-8 text-xs ${hasError ? 'border-destructive' : ''}`}
                        placeholder="US"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={runner.cpu}
                        onChange={(e) => handleFieldChange(index, 'cpu', parseInt(e.target.value, 10) || 0)}
                        className={`h-8 text-xs ${hasError ? 'border-destructive' : ''}`}
                        min="1"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={runner.memoryGiB}
                        onChange={(e) => handleFieldChange(index, 'memoryGiB', parseInt(e.target.value, 10) || 0)}
                        className={`h-8 text-xs ${hasError ? 'border-destructive' : ''}`}
                        min="1"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={runner.diskGiB}
                        onChange={(e) => handleFieldChange(index, 'diskGiB', parseInt(e.target.value, 10) || 0)}
                        className={`h-8 text-xs ${hasError ? 'border-destructive' : ''}`}
                        min="1"
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={runner.class} onValueChange={(value) => handleFieldChange(index, 'class', value)}>
                        <SelectTrigger className={`h-8 text-xs ${hasError ? 'border-destructive' : ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteRow(index)} className="h-8 w-8 p-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Row Button */}
      <Button variant="outline" onClick={handleAddRow} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add Runner
      </Button>

      {/* Validation Errors */}
      {hasErrors && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-1">Please fix the following errors:</div>
            <ul className="list-disc list-inside text-sm space-y-1">
              {Object.entries(validationErrors).map(([index, errors]) => (
                <li key={index}>
                  Row {parseInt(index) + 1}: {errors.join(', ')}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
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
        <Button onClick={handleNext} disabled={hasErrors || runners.length === 0}>
          Next
        </Button>
      </div>
    </div>
  )
}
