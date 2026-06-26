/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useUpdateSecretMutation } from '@/hooks/mutations/useUpdateSecretMutation'
import { handleApiError } from '@/lib/error-handling'
import { Secret } from '@daytona/api-client'
import { useForm } from '@tanstack/react-form'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

interface UpdateSecretDialogProps {
  secret: Secret | null
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId?: string
}

const formSchema = z.object({
  value: z.string().optional(),
  description: z.string().optional(),
  hosts: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export const UpdateSecretDialog: React.FC<UpdateSecretDialogProps> = ({
  secret,
  open,
  onOpenChange,
  organizationId,
}) => {
  const [valueRevealed, setValueRevealed] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const updateSecretMutation = useUpdateSecretMutation()

  const form = useForm({
    defaultValues: {
      value: '',
      description: secret?.description ?? '',
      hosts: secret?.hosts?.join(', ') ?? '',
    } as FormValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmitInvalid: () => {
      const formEl = formRef.current
      if (!formEl) return
      const invalidInput = formEl.querySelector('[aria-invalid="true"]') as HTMLElement | null
      if (invalidInput) {
        invalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        invalidInput.focus()
      }
    },
    onSubmit: async ({ value }) => {
      if (!secret || !organizationId) return

      try {
        const hostsInput = value.hosts ?? ''
        const hosts = hostsInput
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean)

        await updateSecretMutation.mutateAsync({
          secretId: secret.id,
          organizationId,
          value: value.value || undefined,
          description: value.description !== undefined ? value.description.trim() : undefined,
          hosts,
        })

        toast.success('Secret updated successfully')
        onOpenChange(false)
      } catch (error) {
        handleApiError(error, 'Failed to update secret')
      }
    },
  })
  const { reset: resetForm } = form

  const resetState = useCallback(() => {
    resetForm({
      value: '',
      description: secret?.description ?? '',
      hosts: secret?.hosts?.join(', ') ?? '',
    })
    setValueRevealed(false)
  }, [resetForm, secret?.description, secret?.hosts])

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Secret: {secret?.name}</DialogTitle>
          <DialogDescription>Update the value or description of this secret.</DialogDescription>
        </DialogHeader>

        <form
          ref={formRef}
          id="update-secret-form"
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <form.Field name="value">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>New Value (leave empty to keep current)</FieldLabel>
                  <InputGroup className="pr-1 flex-1">
                    <InputGroupInput
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      type={valueRevealed ? 'text' : 'password'}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="New secret value"
                      autoComplete="new-password"
                    />
                    <InputGroupButton
                      variant="ghost"
                      size="icon-xs"
                      type="button"
                      aria-label={valueRevealed ? 'Hide value' : 'Show value'}
                      aria-pressed={valueRevealed}
                      onClick={() => setValueRevealed(!valueRevealed)}
                    >
                      {valueRevealed ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </InputGroupButton>
                  </InputGroup>
                  {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                    <FieldError errors={field.state.meta.errors} />
                  )}
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Optional description"
                />
                <FieldDescription>Optional description for this secret.</FieldDescription>
              </Field>
            )}
          </form.Field>

          <form.Field name="hosts">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Allowed Hosts</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="api.anthropic.com, *.openai.com"
                />
                <FieldDescription>Comma-separated list of hosts this secret may be sent to.</FieldDescription>
              </Field>
            )}
          </form.Field>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                form="update-secret-form"
                variant="default"
                disabled={!canSubmit || isSubmitting || !organizationId}
              >
                {isSubmitting && <Spinner />}
                Update
              </Button>
            )}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
