/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@dashboard/ui/dialog'
import { Step1Auth0Confirmation } from './deletion-steps/Step1Auth0Confirmation'
import { Step2PreviewResources } from './deletion-steps/Step2PreviewResources'
import { Step3Options } from './deletion-steps/Step3Options'
import { Step4ExecuteAndManual } from './deletion-steps/Step4ExecuteAndManual'
import BackofficeApiClient from '../../api/BackofficeApiClient'
import type {
  UserDeletionPreviewDto,
  UserDeletionOptionsDto,
  UserDeletionResponseDto,
} from '@daytonaio/backoffice-api-client'
import { toast } from 'sonner'

interface DeleteUserWizardProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initialUserId?: string
}

export const DeleteUserWizard = ({ open, onClose, onSuccess, initialUserId = '' }: DeleteUserWizardProps) => {
  const [step, setStep] = useState(1)
  const [userId, setUserId] = useState(initialUserId)
  const [preview, setPreview] = useState<UserDeletionPreviewDto | null>(null)
  const [options, setOptions] = useState<UserDeletionOptionsDto>({
    deleteSandboxTemplates: false,
    deleteApiKeys: false,
    deleteOrgMemberships: false,
  })
  const [result, setResult] = useState<UserDeletionResponseDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStep1Next = async () => {
    setLoading(true)
    setError('')
    try {
      const previewData = await BackofficeApiClient.previewUserDeletion(userId)
      setPreview(previewData)
      setStep(2)
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch user preview'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleStep2Next = () => {
    setStep(3)
  }

  const handleStep3Execute = async () => {
    setLoading(true)
    setError('')
    setStep(4)
    try {
      const response = await BackofficeApiClient.deleteUser(userId, { options })
      setResult(response)
      toast.success('User deletion completed successfully')
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to delete user'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    // Reset state
    setStep(1)
    setUserId(initialUserId)
    setPreview(null)
    setOptions({
      deleteSandboxTemplates: false,
      deleteApiKeys: false,
      deleteOrgMemberships: false,
    })
    setResult(null)
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Deletion Wizard</DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  s === step
                    ? 'bg-primary text-primary-foreground'
                    : s < step
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {s}
              </div>
              {s < 4 && <div className={`w-12 h-0.5 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === 1 && (
          <Step1Auth0Confirmation
            userId={userId}
            onUserIdChange={setUserId}
            onNext={handleStep1Next}
            onCancel={handleClose}
          />
        )}

        {step === 2 && preview && (
          <Step2PreviewResources
            preview={preview}
            loading={loading}
            onNext={handleStep2Next}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <Step3Options
            options={options}
            onOptionsChange={setOptions}
            onExecute={handleStep3Execute}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && <Step4ExecuteAndManual result={result} loading={loading} error={error} onClose={handleClose} />}
      </DialogContent>
    </Dialog>
  )
}
