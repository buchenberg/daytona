/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState } from 'react'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Textarea } from '@dashboard/ui/textarea'
import { Label } from '@dashboard/ui/label'
import { Alert, AlertDescription } from '@dashboard/ui/alert'
import { AlertCircle, Info } from 'lucide-react'
import { parseSpecs, parseRunnerData, type ParsedRunner } from '../utils/runnerParser'

interface InputStepProps {
  onNext: (runners: ParsedRunner[], specs: string, runnersData: string) => void
  onCancel: () => void
  initialSpecs?: string
  initialRunners?: string
}

export const InputStep = ({ onNext, onCancel, initialSpecs = '', initialRunners = '' }: InputStepProps) => {
  const [specsText, setSpecsText] = useState(initialSpecs || 'US, 64CPU, 768GB RAM, 6.9TB')
  const [runnersText, setRunnersText] = useState(initialRunners)
  const [error, setError] = useState<string | null>(null)

  const handleNext = () => {
    setError(null)

    // Parse specs
    const specs = parseSpecs(specsText)
    if (!specs) {
      setError('Failed to parse specs. Please check the format.')
      return
    }

    if (!specs.cpu || !specs.memoryGiB || !specs.diskGiB) {
      setError('Specs must include CPU, memory, and disk values.')
      return
    }

    // Parse runner data
    const result = parseRunnerData(runnersText, specs)
    if (!result.success || !result.runners) {
      setError(result.errors?.join(', ') || 'Failed to parse runner data')
      return
    }

    if (result.runners.length === 0) {
      setError('No runners found. Please paste runner data.')
      return
    }

    onNext(result.runners, specsText, runnersText)
  }

  const exampleText = `domain_name: "h1321.daytona.work"
api_token: "EfEiw5CqXCA8Sz0abMZ2t76R1CQHP3HhDSArMmGBu8CWUvSIsZt0Bqp7zvEBJ96k..."

domain_name: "h1323.daytona.work"
api_token: "teQmYzpZC5DiPQrAPhQNHxrAhdvRXEDBCki3UqKAH5lGc8zqGQlSq9Z0L0kJzgpx..."`

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Step 1: Input Data</h3>
        <p className="text-sm text-muted-foreground mb-4">Enter the shared specifications and runner details below.</p>
      </div>

      {/* Specs Input */}
      <div className="space-y-2">
        <Label htmlFor="specs">Shared Specifications</Label>
        <Input
          id="specs"
          value={specsText}
          onChange={(e) => setSpecsText(e.target.value)}
          placeholder="US, 64CPU, 768GB RAM, 6.9TB"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Format: Region, XCPU, XGB RAM, XTB/GB (optional: class - defaults to small)
        </p>
      </div>

      {/* Runners Input */}
      <div className="space-y-2">
        <Label htmlFor="runners">Runner Data</Label>
        <Textarea
          id="runners"
          value={runnersText}
          onChange={(e) => setRunnersText(e.target.value)}
          placeholder={exampleText}
          className="font-mono text-sm min-h-[300px]"
        />
        <p className="text-xs text-muted-foreground">Paste domain_name and api_token pairs for each runner</p>
      </div>

      {/* Format Help */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Expected format:</strong>
          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">{exampleText}</pre>
        </AlertDescription>
      </Alert>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleNext} disabled={!specsText.trim() || !runnersText.trim()}>
          Next
        </Button>
      </div>
    </div>
  )
}
