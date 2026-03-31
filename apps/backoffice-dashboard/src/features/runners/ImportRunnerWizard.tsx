/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@dashboard/ui/dialog'
import { InputStep } from './import-steps/InputStep'
import { EditStep } from './import-steps/EditStep'
import { PreviewStep } from './import-steps/PreviewStep'
import { ConfirmStep } from './import-steps/ConfirmStep'
import { toast } from 'sonner'
import type { ParsedRunner } from './utils/runnerParser'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface ImportRunnerWizardProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const ImportRunnerWizard = ({ open, onClose, onSuccess }: ImportRunnerWizardProps) => {
  const [step, setStep] = useState(1)
  const [runners, setRunners] = useState<ParsedRunner[]>([])
  const [specsText, setSpecsText] = useState('')
  const [runnersText, setRunnersText] = useState('')

  const handleClose = () => {
    // Reset state
    setStep(1)
    setRunners([])
    setSpecsText('')
    setRunnersText('')
    onClose()
  }

  const handleStep1Next = (parsedRunners: ParsedRunner[], specs: string, runnersData: string) => {
    setRunners(parsedRunners)
    setSpecsText(specs)
    setRunnersText(runnersData)
    setStep(2)
  }

  const handleStep2Next = (editedRunners: ParsedRunner[]) => {
    setRunners(editedRunners)
    setStep(3)
  }

  const handleStep3Next = () => {
    setStep(4)
  }

  const handleDryRun = async (runnersToValidate: ParsedRunner[]) => {
    try {
      const response = await BackofficeApiClient.bulkInsertRunners({
        runners: runnersToValidate.map((r) => ({
          domain: r.domain,
          apiKey: r.apiKey,
          region: r.region,
          cpu: r.cpu,
          memoryGiB: r.memoryGiB,
          diskGiB: r.diskGiB,
          class: r.class,
        })),
        dryRun: true,
        skipErrors: false,
      })

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Dry run failed')
      }

      return response.data
    } catch (error) {
      console.error('Dry run error:', error)
      throw error
    }
  }

  const handleImport = async (runnersToImport: ParsedRunner[], skipErrors: boolean) => {
    try {
      const response = await BackofficeApiClient.bulkInsertRunners({
        runners: runnersToImport.map((r) => ({
          domain: r.domain,
          apiKey: r.apiKey,
          region: r.region,
          cpu: r.cpu,
          memoryGiB: r.memoryGiB,
          diskGiB: r.diskGiB,
          class: r.class,
        })),
        dryRun: false,
        skipErrors,
      })

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Import failed')
      }

      if (response.data.successCount > 0) {
        toast.success(`Successfully imported ${response.data.successCount} runner(s)`)
      }

      return response.data
    } catch (error) {
      console.error('Import error:', error)
      toast.error('Failed to import runners')
      throw error
    }
  }

  const handleImportSuccess = () => {
    onSuccess()
    setTimeout(() => {
      handleClose()
    }, 2000)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Runners</DialogTitle>
          <DialogDescription>
            Step {step} of 4 -{' '}
            {step === 1
              ? 'Input Data'
              : step === 2
                ? 'Edit & Review'
                : step === 3
                  ? 'Preview & Validate'
                  : 'Confirm & Import'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-6 px-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${s <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                `}
              >
                {s}
              </div>
              {s < 4 && (
                <div
                  className={`
                    flex-1 h-1 mx-2
                    ${s < step ? 'bg-primary' : 'bg-muted'}
                  `}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="px-4">
          {step === 1 && (
            <InputStep
              onNext={handleStep1Next}
              onCancel={handleClose}
              initialSpecs={specsText}
              initialRunners={runnersText}
            />
          )}
          {step === 2 && (
            <EditStep
              initialRunners={runners}
              onNext={handleStep2Next}
              onBack={() => setStep(1)}
              onCancel={handleClose}
            />
          )}
          {step === 3 && (
            <PreviewStep
              runners={runners}
              onNext={handleStep3Next}
              onBack={() => setStep(2)}
              onCancel={handleClose}
              onDryRun={handleDryRun}
            />
          )}
          {step === 4 && (
            <ConfirmStep
              runners={runners}
              onImport={handleImport}
              onBack={() => setStep(3)}
              onCancel={handleClose}
              onSuccess={handleImportSuccess}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
