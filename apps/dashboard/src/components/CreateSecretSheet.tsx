import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { useCreateSecretMutation } from '@/hooks/mutations/useCreateSecretMutation'
import { handleApiError } from '@/lib/error-handling'
import { useForm } from '@tanstack/react-form'
import { EyeIcon, EyeOffIcon, Plus } from 'lucide-react'
import React, { Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

interface CreateSecretSheetProps {
  className?: string
  organizationId?: string
  ref?: Ref<{ open: () => void }>
}

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  value: z.string().min(1, 'Value is required'),
  description: z.string().optional(),
  hosts: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export const CreateSecretSheet: React.FC<CreateSecretSheetProps> = ({ className, organizationId, ref }) => {
  const [open, setOpen] = useState(false)
  const [valueRevealed, setValueRevealed] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }))

  const createSecretMutation = useCreateSecretMutation()

  const form = useForm({
    defaultValues: {
      name: '',
      value: '',
      description: '',
      hosts: '',
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
      if (!organizationId) {
        toast.error('Select an organization to create a secret.')
        return
      }

      try {
        const hosts = value.hosts
          ?.split(',')
          .map((h) => h.trim())
          .filter(Boolean)

        await createSecretMutation.mutateAsync({
          organizationId,
          name: value.name.trim(),
          value: value.value,
          description: value.description?.trim() || undefined,
          hosts: hosts?.length ? hosts : undefined,
        })

        toast.success('Secret created successfully')
        setOpen(false)
      } catch (error) {
        handleApiError(error, 'Failed to create secret')
      }
    },
  })
  const { reset: resetForm } = form

  const resetState = useCallback(() => {
    resetForm({
      name: '',
      value: '',
      description: '',
      hosts: '',
    })
    setValueRevealed(false)
  }, [resetForm])

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="default" size="sm" className={className}>
            <Plus className="w-4 h-4" />
            Create Secret
          </Button>
        }
      />

      <SheetContent className="w-dvw sm:w-[500px] p-0 flex flex-col gap-0">
        <SheetHeader className="border-b border-border p-4 px-5 items-center flex text-left flex-row">
          <SheetTitle className="text-2xl">Create New Secret</SheetTitle>
          <SheetDescription className="sr-only">
            Enter a name, value, and optional description for the new secret.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea fade="mask" className="flex-1 min-h-0">
          <form
            ref={formRef}
            id="create-secret-form"
            className="space-y-6 p-5"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
          >
            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="MY_SECRET"
                    />
                    {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="value">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Value</FieldLabel>
                    <InputGroup className="pr-1 flex-1">
                      <InputGroupInput
                        aria-invalid={isInvalid}
                        id={field.name}
                        name={field.name}
                        type={valueRevealed ? 'text' : 'password'}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Secret value"
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
        </ScrollArea>
        <SheetFooter className="border-t border-border p-4 px-5">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                form="create-secret-form"
                variant="default"
                disabled={!canSubmit || isSubmitting || !organizationId}
              >
                {isSubmitting && <Spinner />}
                Create
              </Button>
            )}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
