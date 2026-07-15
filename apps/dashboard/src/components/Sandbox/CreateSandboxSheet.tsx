import { CreateResourceButton } from '@/components/CreateResourceButton'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSectionTitle,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCreateSandboxMutation } from '@/hooks/mutations/useCreateSandboxMutation'
import { useSetOrganizationDefaultRegionMutation } from '@/hooks/mutations/useSetOrganizationDefaultRegionMutation'
import { useAvailableSandboxClassesQuery } from '@/hooks/queries/useAvailableSandboxClassesQuery'
import { useAvailableRegionsQuery } from '@/hooks/queries/useRegionsQuery'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { parseEnvFile } from '@/lib/env'
import { handleApiError } from '@/lib/error-handling'
import { GPU_TYPE_LABELS, MAX_GPU_PER_SANDBOX, resolveAllowedGpuTypes } from '@/lib/gpu-types'
import { EMPTY_REGIONS } from '@/lib/regions'
import { imageNameSchema } from '@/lib/schema'
import { cn, getRegionFullDisplayName } from '@/lib/utils'
import { GpuType, OrganizationUserRoleEnum, RegionType, type Region, type SnapshotDto } from '@daytona/api-client'
import { Sandbox } from '@daytona/sdk'
import { useForm, useStore } from '@tanstack/react-form'
import { isAxiosError } from 'axios'
import { Info, Minus, Plus, Upload } from 'lucide-react'
import { ComponentProps, Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { NumericFormat } from 'react-number-format'
import { toast } from 'sonner'
import { z } from 'zod'
import { Tooltip } from '../Tooltip'
import { ScrollArea } from '../ui/scroll-area'
import { SnapshotSelect } from './SnapshotSelect'

const NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

enum Source {
  SNAPSHOT = 'snapshot',
  IMAGE = 'image',
}

const keyValuePairSchema = z.object({
  key: z.string(),
  value: z.string(),
})

const noDuplicateKeys = (pairs: { key: string; value: string }[] | undefined) => {
  if (!pairs) return true
  const keys = pairs.filter((p) => p.key).map((p) => p.key)
  return new Set(keys).size === keys.length
}

const resourceSchema = (name: string) =>
  z
    .number()
    .optional()
    .refine((val) => val === undefined || val >= 1, `${name} must be at least 1`)

const buildBaseFormSchema = () =>
  z.object({
    name: z
      .string()
      .optional()
      .refine((val) => !val || NAME_REGEX.test(val), 'Only letters, digits, dots, underscores and dashes are allowed'),
    regionId: z.string().optional(),
    cpu: resourceSchema('CPU'),
    memory: resourceSchema('Memory'),
    disk: resourceSchema('Storage'),
    autoStopInterval: z.number().min(0).optional(),
    autoArchiveInterval: z.number().min(0).optional(),
    autoDeleteInterval: z
      .number()
      .refine((val) => val === -1 || val >= 0, 'Must be -1 (disabled) or a non-negative number')
      .optional(),
    envVars: z.array(keyValuePairSchema).optional().refine(noDuplicateKeys, 'Duplicate keys are not allowed'),
    labels: z.array(keyValuePairSchema).optional().refine(noDuplicateKeys, 'Duplicate keys are not allowed'),
    public: z.boolean().optional(),
    networkBlockAll: z.boolean().optional(),
    ephemeral: z.boolean().optional(),
    setAsDefaultRegion: z.boolean().optional(),
    gpu: z.number().min(0).max(MAX_GPU_PER_SANDBOX).optional(),
    gpuType: z.nativeEnum(GpuType).optional(),
  })

const buildFormSchema = (maxCpu?: number, maxMemory?: number, maxDisk?: number) => {
  const base = buildBaseFormSchema()
  return z
    .discriminatedUnion('source', [
      base.extend({
        source: z.literal(Source.SNAPSHOT),
        snapshot: z.string().optional(),
        image: z.string().optional(),
      }),
      base.extend({
        source: z.literal(Source.IMAGE),
        snapshot: z.string().optional(),
        image: imageNameSchema,
      }),
    ])
    .superRefine((val, ctx) => {
      if (val.source === Source.SNAPSHOT && !val.regionId) {
        ctx.addIssue({
          code: 'custom',
          path: ['regionId'],
          message: 'Selected snapshot is not available in any region you can use.',
        })
      }
      // The org-level maxima apply only to non-GPU creates: GPU limits are
      // per-GPU-unit and region-scoped, enforced server-side.
      if (val.source === Source.IMAGE && (val.gpu ?? 0) === 0) {
        const checks: Array<{ field: 'cpu' | 'memory' | 'disk'; max: number | undefined; label: string }> = [
          { field: 'cpu', max: maxCpu, label: 'CPU' },
          { field: 'memory', max: maxMemory, label: 'Memory' },
          { field: 'disk', max: maxDisk, label: 'Storage' },
        ]

        for (const check of checks) {
          const requested = val[check.field]
          if (requested !== undefined && check.max !== undefined && requested > check.max) {
            ctx.addIssue({
              code: 'custom',
              path: [check.field],
              message: `${check.label} must be between 1 and ${check.max}`,
            })
          }
        }
      }
    })
}

type FormValues = z.input<ReturnType<typeof buildBaseFormSchema>> & {
  source: Source
  snapshot?: string
  image?: string
}

const defaultValues: FormValues = {
  name: '',
  source: Source.SNAPSHOT,
  snapshot: undefined,
  image: '',
  regionId: undefined,
  cpu: undefined,
  memory: undefined,
  disk: undefined,
  autoStopInterval: undefined,
  autoArchiveInterval: undefined,
  autoDeleteInterval: undefined,
  envVars: [],
  labels: [],
  public: false,
  networkBlockAll: false,
  ephemeral: false,
  setAsDefaultRegion: false,
  gpu: 0,
  gpuType: undefined,
}

const InfoTooltipButton = ({ className, ...props }: ComponentProps<'button'>) => {
  return (
    <button className={cn('rounded-full', className)} {...props}>
      <Info className="size-3 text-muted-foreground" />
    </button>
  )
}

export const CreateSandboxSheet = ({
  className,
  ref,
  onSandboxCreated,
}: {
  className?: string
  ref?: Ref<{ open: () => void }>
  onSandboxCreated?: (sandbox: Sandbox) => void
}) => {
  const [open, setOpen] = useState(false)
  const [selectedSnapshotOption, setSelectedSnapshotOption] = useState<SnapshotDto | undefined>(undefined)

  const config = useConfig()
  const { selectedOrganization, authenticatedUserOrganizationMember } = useSelectedOrganization()
  const { data: regions = EMPTY_REGIONS, isLoading: loadingRegions } = useAvailableRegionsQuery(
    selectedOrganization?.id,
  )
  const { reset: resetCreateSandboxMutation, ...createSandboxMutation } = useCreateSandboxMutation()
  const setDefaultRegionMutation = useSetOrganizationDefaultRegionMutation()
  const formRef = useRef<HTMLFormElement>(null)
  const [popoverContainer, setPopoverContainer] = useState<HTMLDivElement | null>(null)
  const handleSheetContentRef = useCallback((node: HTMLDivElement | null) => {
    setPopoverContainer(node)
  }, [])
  const formDefaultValues = useMemo<FormValues>(
    () => ({
      ...defaultValues,
      regionId: selectedOrganization?.defaultRegionId,
    }),
    [selectedOrganization?.defaultRegionId],
  )

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }))

  const maxCpu = selectedOrganization?.maxCpuPerSandbox
  const maxMemory = selectedOrganization?.maxMemoryPerSandbox
  const maxDisk = selectedOrganization?.maxDiskPerSandbox
  const canSetDefaultRegion =
    !selectedOrganization?.defaultRegionId &&
    authenticatedUserOrganizationMember?.role === OrganizationUserRoleEnum.OWNER

  const { data: availableSandboxClasses } = useAvailableSandboxClassesQuery({
    organizationId: selectedOrganization?.id || '',
  })

  const formSchema = useMemo(() => buildFormSchema(maxCpu, maxMemory, maxDisk), [maxCpu, maxMemory, maxDisk])

  const form = useForm({
    defaultValues: formDefaultValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmitInvalid: () => {
      const formEl = formRef.current
      if (!formEl) return
      const invalidInput = formEl.querySelector('[aria-invalid="true"]') as HTMLInputElement | null
      if (invalidInput) {
        invalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        invalidInput.focus()
      }
    },
    onSubmit: async ({ value }) => {
      if (!selectedOrganization?.id) {
        toast.error('Select an organization to create a sandbox.')
        return
      }

      if (value.setAsDefaultRegion && value.regionId) {
        try {
          await setDefaultRegionMutation.mutateAsync({
            organizationId: selectedOrganization.id,
            defaultRegionId: value.regionId,
          })
        } catch (error) {
          // 409 Conflict = another path (e.g. the auto-triggered SetDefaultRegionDialog on
          // Dashboard) set the default between sheet-open and submit. The user's intent is
          // already satisfied; continue to sandbox creation.
          const cause = error instanceof Error ? error.cause : undefined
          const status = isAxiosError(cause) ? cause.response?.status : undefined
          if (status !== 409) {
            handleApiError(error, 'Failed to set default region')
            return
          }
        }
      }

      const envVars: Record<string, string> = {}
      value.envVars?.forEach(({ key, value: val }) => {
        if (key) envVars[key] = val
      })

      const labels: Record<string, string> = {}
      value.labels?.forEach(({ key, value: val }) => {
        if (key) labels[key] = val
      })

      const isImage = value.source === Source.IMAGE
      const snapshotGpu =
        !isImage && value.snapshot && selectedSnapshotOption?.name === value.snapshot ? selectedSnapshotOption.gpu : 0
      const requiresEphemeralSandbox = isImage ? (value.gpu ?? 0) > 0 : snapshotGpu > 0

      const baseParams = {
        name: value.name?.trim() || undefined,
        target: value.regionId || undefined,
        autoStopInterval: value.autoStopInterval,
        autoArchiveInterval: value.autoArchiveInterval,
        autoDeleteInterval: requiresEphemeralSandbox ? 0 : value.autoDeleteInterval,
        ephemeral: requiresEphemeralSandbox ? true : value.ephemeral || undefined,
        envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
        public: value.public || undefined,
        networkBlockAll: value.networkBlockAll || undefined,
      }

      let sandbox: Sandbox | undefined = undefined
      try {
        if (isImage && value.image) {
          sandbox = await createSandboxMutation.mutateAsync({
            ...baseParams,
            image: value.image,
            resources:
              value.cpu || value.memory || value.disk || (value.gpu ?? 0) > 0
                ? {
                    cpu: value.cpu,
                    memory: value.memory,
                    disk: value.disk,
                    gpu: (value.gpu ?? 0) > 0 ? value.gpu : undefined,
                    gpuType: (value.gpu ?? 0) > 0 && value.gpuType ? value.gpuType : undefined,
                  }
                : undefined,
          })
        } else {
          sandbox = await createSandboxMutation.mutateAsync({
            ...baseParams,
            snapshot: value.snapshot || undefined,
          })
        }

        toast.success(`Sandbox created`)

        setOpen(false)

        if (sandbox) {
          onSandboxCreated?.(sandbox)
        }
      } catch (error) {
        handleApiError(error, 'Failed to create sandbox')
      }
    },
  })
  const { reset: resetForm } = form
  const selectedSource = useStore(form.store, (state) => state.values.source)
  const selectedRegionId = useStore(form.store, (state) => state.values.regionId)
  const selectedGpuCount = useStore(form.store, (state) => state.values.gpu ?? 0)
  const selectedSnapshotName = useStore(form.store, (state) => state.values.snapshot)
  const selectedSnapshot = useMemo(() => {
    if (!selectedSnapshotName) {
      return undefined
    }

    return selectedSnapshotOption?.name === selectedSnapshotName ? selectedSnapshotOption : undefined
  }, [selectedSnapshotName, selectedSnapshotOption])
  const effectiveGpuCount = selectedSource === Source.SNAPSHOT ? (selectedSnapshot?.gpu ?? 0) : selectedGpuCount
  const requiresEphemeralSandbox = effectiveGpuCount > 0
  // Same entry the GPU controls render from; undefined hides them.
  const selectedRegionGpuEntry = availableSandboxClasses?.find(
    (rq) => rq.regionId === selectedRegionId && rq.gpuAvailable,
  )
  const getRegionsForSnapshot = useCallback(
    (snapshot?: SnapshotDto) => {
      if (!snapshot) {
        return []
      }

      if (!snapshot.regionIds?.length) {
        return []
      }

      const snapshotRegionIds = new Set(snapshot.regionIds)
      return regions.filter((region) => snapshotRegionIds.has(region.id))
    },
    [regions],
  )
  const sharedAvailableRegions = useMemo(
    () => regions.filter((region) => region.regionType === RegionType.SHARED),
    [regions],
  )
  const snapshotFilteredRegions = useMemo(() => {
    if (selectedSource !== Source.SNAPSHOT) {
      return regions
    }

    if (!selectedSnapshot) {
      return sharedAvailableRegions
    }

    return getRegionsForSnapshot(selectedSnapshot)
  }, [getRegionsForSnapshot, regions, selectedSnapshot, selectedSource, sharedAvailableRegions])
  const regionsDisabled = loadingRegions

  const setRegionFromAvailableRegions = useCallback(
    (nextRegions: Region[]) => {
      const currentRegionId = form.getFieldValue('regionId')
      const currentRegionAvailable = !!currentRegionId && nextRegions.some((region) => region.id === currentRegionId)

      if (currentRegionAvailable) {
        return
      }

      if (nextRegions.length === 0) {
        if (currentRegionId) {
          form.setFieldValue('regionId', undefined)
        }
        return
      }

      const defaultRegion = selectedOrganization?.defaultRegionId
        ? nextRegions.find((region) => region.id === selectedOrganization.defaultRegionId)
        : undefined

      form.setFieldValue('regionId', defaultRegion?.id ?? nextRegions[0].id)
    },
    [form, selectedOrganization?.defaultRegionId],
  )

  const handleSourceChange = useCallback(
    (val: string) => {
      form.setFieldValue('source', val as Source)
      if (val === Source.SNAPSHOT) {
        form.setFieldValue('image', '')
        form.setFieldValue('cpu', undefined)
        form.setFieldValue('memory', undefined)
        form.setFieldValue('disk', undefined)
        form.setFieldValue('gpu', 0)
        form.setFieldValue('gpuType', undefined)
      } else {
        form.setFieldValue('snapshot', undefined)
        setSelectedSnapshotOption(undefined)
      }
    },
    [form],
  )
  const handleSnapshotChange = useCallback(
    (snapshot: SnapshotDto) => {
      form.setFieldValue('snapshot', snapshot.name)
      setSelectedSnapshotOption(snapshot)
      setRegionFromAvailableRegions(getRegionsForSnapshot(snapshot))
    },
    [form, getRegionsForSnapshot, setRegionFromAvailableRegions],
  )
  const handleSnapshotValueChange = useCallback(
    (snapshotName: string | undefined) => {
      form.setFieldValue('snapshot', snapshotName)

      if (!snapshotName) {
        setSelectedSnapshotOption(undefined)
      }
    },
    [form],
  )

  const resetState = useCallback(() => {
    resetForm(formDefaultValues)
    resetCreateSandboxMutation()
    setSelectedSnapshotOption(undefined)
  }, [formDefaultValues, resetForm, resetCreateSandboxMutation])

  const handleEnvFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = () => {
        const parsed = parseEnvFile(reader.result as string)
        if (parsed.length === 0) return

        const existing = form.getFieldValue('envVars') ?? []
        const nonEmpty = existing.filter((p) => p.key || p.value)
        form.setFieldValue('envVars', [...nonEmpty, ...parsed])
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [form],
  )

  const handleEnvPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
      const text = e.clipboardData.getData('text')
      if (!text.includes('=') || !text.includes('\n')) return
      e.preventDefault()
      const parsed = parseEnvFile(text)
      if (parsed.length === 0) return

      const existing = form.getFieldValue('envVars') ?? []
      const current = existing[index]
      const isEmptyRow = !current?.key && !current?.value
      const before = existing.slice(0, index)
      const after = existing.slice(index + (isEmptyRow ? 1 : 0))

      form.setFieldValue('envVars', [...before, ...parsed, ...after])
    },
    [form],
  )

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  // Keep the gpu/gpuType values consistent with the (possibly hidden) GPU
  // controls: without a GPU-capable entry the values are reset so hidden
  // state cannot leak into the create request; with one, a gpuType the new
  // region does not allow is normalized to its first allowed type.
  useEffect(() => {
    if (!selectedRegionGpuEntry) {
      form.setFieldValue('gpu', 0)
      form.setFieldValue('gpuType', undefined)
      return
    }
    const allowedGpuTypes = resolveAllowedGpuTypes(selectedRegionGpuEntry.allowedGpuTypes)
    const currentGpuType = form.getFieldValue('gpuType')
    if (currentGpuType && !allowedGpuTypes.includes(currentGpuType)) {
      form.setFieldValue('gpuType', allowedGpuTypes[0])
    }
  }, [form, selectedRegionGpuEntry])

  useEffect(() => {
    if (!requiresEphemeralSandbox) return
    form.setFieldValue('ephemeral', true)
    form.setFieldValue('autoDeleteInterval', 0)
  }, [form, requiresEphemeralSandbox])

  useEffect(() => {
    if (!open || loadingRegions) return

    if (selectedSource === Source.SNAPSHOT) {
      setRegionFromAvailableRegions(snapshotFilteredRegions)
      return
    }

    if (regions.length !== 1) return
    if (selectedOrganization?.defaultRegionId) return
    if (form.getFieldValue('regionId')) return
    form.setFieldValue('regionId', regions[0].id)
  }, [
    form,
    loadingRegions,
    open,
    regions,
    selectedOrganization?.defaultRegionId,
    selectedSource,
    setRegionFromAvailableRegions,
    snapshotFilteredRegions,
  ])

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
      }}
    >
      <SheetTrigger render={<CreateResourceButton resource="Sandbox" />} />
      <SheetContent ref={handleSheetContentRef} className={cn('w-dvw sm:w-[500px] flex flex-col gap-0 p-0', className)}>
        <SheetHeader className="border-b border-border p-4 px-5 items-center flex text-left flex-row">
          <SheetTitle>Create Sandbox</SheetTitle>
          <SheetDescription className="sr-only">Create a new sandbox in your organization.</SheetDescription>
        </SheetHeader>
        <ScrollArea fade="mask" className="flex-1 min-h-0">
          <form
            ref={formRef}
            id="create-sandbox-form"
            className="gap-6 flex flex-col p-5"
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
                      placeholder="my-sandbox"
                    />
                    <FieldDescription>
                      Optional. If not provided, the sandbox ID will be used as the name. Names are reusable once a
                      sandbox is destroyed.
                    </FieldDescription>
                    {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.source}>
              {(source) => (
                <Tabs value={source} onValueChange={handleSourceChange} className="gap-3">
                  <div className="flex flex-col gap-2">
                    <FieldLabel>Source</FieldLabel>
                    <TabsList className="w-full">
                      <TabsTrigger value={Source.SNAPSHOT} className="flex-1">
                        Snapshot
                      </TabsTrigger>
                      <TabsTrigger value={Source.IMAGE} className="flex-1">
                        Image
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value={Source.SNAPSHOT}>
                    <form.Field name="snapshot">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>Snapshot</FieldLabel>
                          <SnapshotSelect
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            placeholder="Default snapshot"
                            popoverContainer={popoverContainer}
                            onSnapshotChange={handleSnapshotChange}
                            onValueChange={handleSnapshotValueChange}
                          />
                          <FieldDescription>
                            If unspecified,{' '}
                            <span className="font-medium text-foreground">{config.defaultSnapshot}</span> will be used.
                          </FieldDescription>
                        </Field>
                      )}
                    </form.Field>
                  </TabsContent>

                  <TabsContent value={Source.IMAGE} className="flex flex-col gap-4">
                    <form.Field name="image">
                      {(field) => {
                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name}>Image</FieldLabel>
                            <Input
                              aria-invalid={isInvalid}
                              id={field.name}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) => field.handleChange(e.target.value)}
                              placeholder="ubuntu:22.04"
                            />
                            <FieldDescription>
                              Must include either a tag (e.g., ubuntu:22.04) or a digest. The tag &quot;latest&quot; is
                              not allowed.
                            </FieldDescription>
                            {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                              <FieldError errors={field.state.meta.errors} />
                            )}
                          </Field>
                        )
                      }}
                    </form.Field>
                    <div className="flex flex-col gap-2">
                      <SheetSectionTitle>Resources</SheetSectionTitle>
                      <div className="flex flex-col gap-2">
                        <form.Field name="cpu">
                          {(field) => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-4">
                                  <Label htmlFor={field.name} className="w-32 flex-shrink-0">
                                    Compute (vCPU):
                                  </Label>
                                  <NumericFormat
                                    customInput={Input}
                                    aria-invalid={isInvalid}
                                    id={field.name}
                                    className="w-full"
                                    placeholder="1"
                                    decimalScale={0}
                                    allowNegative={false}
                                    isAllowed={(values) => {
                                      if (values.floatValue === undefined) return true
                                      return selectedGpuCount > 0 || !maxCpu || values.floatValue <= maxCpu
                                    }}
                                    value={field.state.value ?? ''}
                                    onBlur={field.handleBlur}
                                    onValueChange={(values) => field.handleChange(values.floatValue ?? undefined)}
                                  />
                                </div>
                                {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                                  <FieldError errors={field.state.meta.errors} />
                                )}
                              </div>
                            )
                          }}
                        </form.Field>
                        <form.Field name="memory">
                          {(field) => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-4">
                                  <Label htmlFor={field.name} className="w-32 flex-shrink-0">
                                    Memory (GiB):
                                  </Label>
                                  <NumericFormat
                                    customInput={Input}
                                    aria-invalid={isInvalid}
                                    id={field.name}
                                    className="w-full"
                                    placeholder="1"
                                    decimalScale={0}
                                    allowNegative={false}
                                    isAllowed={(values) => {
                                      if (values.floatValue === undefined) return true
                                      return selectedGpuCount > 0 || !maxMemory || values.floatValue <= maxMemory
                                    }}
                                    value={field.state.value ?? ''}
                                    onBlur={field.handleBlur}
                                    onValueChange={(values) => field.handleChange(values.floatValue ?? undefined)}
                                  />
                                </div>
                                {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                                  <FieldError errors={field.state.meta.errors} />
                                )}
                              </div>
                            )
                          }}
                        </form.Field>
                        <form.Field name="disk">
                          {(field) => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-4">
                                  <Label htmlFor={field.name} className="w-32 flex-shrink-0">
                                    Storage (GiB):
                                  </Label>
                                  <NumericFormat
                                    customInput={Input}
                                    aria-invalid={isInvalid}
                                    id={field.name}
                                    className="w-full"
                                    placeholder="3"
                                    decimalScale={0}
                                    allowNegative={false}
                                    isAllowed={(values) => {
                                      if (values.floatValue === undefined) return true
                                      return selectedGpuCount > 0 || !maxDisk || values.floatValue <= maxDisk
                                    }}
                                    value={field.state.value ?? ''}
                                    onBlur={field.handleBlur}
                                    onValueChange={(values) => field.handleChange(values.floatValue ?? undefined)}
                                  />
                                </div>
                                {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                                  <FieldError errors={field.state.meta.errors} />
                                )}
                              </div>
                            )
                          }}
                        </form.Field>
                        <form.Subscribe selector={(state) => state.values.regionId}>
                          {(regionId) => {
                            const sandboxClassWithGpuAvailable = availableSandboxClasses?.find(
                              (rq) => rq.regionId === regionId && rq.gpuAvailable,
                            )
                            if (!sandboxClassWithGpuAvailable) return null
                            const allowedGpuTypes = resolveAllowedGpuTypes(sandboxClassWithGpuAvailable.allowedGpuTypes)
                            return (
                              <div className="flex flex-col gap-3">
                                <form.Field name="gpu">
                                  {(field) => (
                                    <Field>
                                      <FieldLabel htmlFor={field.name}>GPUs</FieldLabel>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          aria-label="Decrease GPU count"
                                          variant="outline"
                                          size="icon"
                                          className="size-8"
                                          onClick={() => {
                                            const next = Math.max(0, (field.state.value ?? 0) - 1)
                                            field.handleChange(next)
                                            if (next === 0) form.setFieldValue('gpuType', undefined)
                                          }}
                                        >
                                          <Minus className="size-4" />
                                        </Button>
                                        <NumericFormat
                                          customInput={Input}
                                          id={field.name}
                                          className="h-8 w-20 text-center"
                                          decimalScale={0}
                                          allowNegative={false}
                                          isAllowed={(values) =>
                                            values.floatValue === undefined ||
                                            (values.floatValue >= 0 && values.floatValue <= MAX_GPU_PER_SANDBOX)
                                          }
                                          value={field.state.value ?? 0}
                                          onValueChange={(values) => {
                                            const next = values.floatValue ?? 0
                                            field.handleChange(next)
                                            if (next > 0) {
                                              if (!form.getFieldValue('gpuType') && allowedGpuTypes.length > 0) {
                                                form.setFieldValue('gpuType', allowedGpuTypes[0])
                                              }
                                            } else {
                                              form.setFieldValue('gpuType', undefined)
                                            }
                                          }}
                                        />
                                        <Button
                                          type="button"
                                          aria-label="Increase GPU count"
                                          variant="outline"
                                          size="icon"
                                          className="size-8"
                                          onClick={() => {
                                            const next = Math.min(MAX_GPU_PER_SANDBOX, (field.state.value ?? 0) + 1)
                                            field.handleChange(next)
                                            if (!form.getFieldValue('gpuType') && allowedGpuTypes.length > 0) {
                                              form.setFieldValue('gpuType', allowedGpuTypes[0])
                                            }
                                          }}
                                        >
                                          <Plus className="size-4" />
                                        </Button>
                                      </div>
                                      <FieldDescription>
                                        GPU sandboxes are always ephemeral and auto-deleted when stopped.
                                      </FieldDescription>
                                    </Field>
                                  )}
                                </form.Field>
                                <form.Subscribe selector={(state) => state.values.gpu}>
                                  {(gpuCount) =>
                                    (gpuCount ?? 0) > 0 && allowedGpuTypes.length > 0 ? (
                                      <form.Field name="gpuType">
                                        {(field) => (
                                          <Field>
                                            <FieldLabel htmlFor={field.name}>GPU type</FieldLabel>
                                            <Select
                                              value={field.state.value ?? allowedGpuTypes[0]}
                                              onValueChange={(val) => field.handleChange(val as GpuType)}
                                            >
                                              <SelectTrigger className="h-8" id={field.name}>
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {allowedGpuTypes.map((gpuType) => (
                                                  <SelectItem key={gpuType} value={gpuType}>
                                                    {GPU_TYPE_LABELS[gpuType] || gpuType}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </Field>
                                        )}
                                      </form.Field>
                                    ) : null
                                  }
                                </form.Subscribe>
                              </div>
                            )
                          }}
                        </form.Subscribe>
                      </div>
                      <FieldDescription>
                        {selectedGpuCount > 0
                          ? 'If not specified, GPU default values will be used (16 vCPU, 192 GiB memory, 512 GiB storage).'
                          : 'If not specified, default values will be used (1 vCPU, 1 GiB memory, 3 GiB storage).'}
                      </FieldDescription>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </form.Subscribe>

            <form.Field name="regionId">
              {(field) => {
                const hasErrors = field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={hasErrors}>
                    <FieldLabel htmlFor={field.name}>Region</FieldLabel>
                    <Select value={field.state.value ?? null} onValueChange={field.handleChange}>
                      <SelectTrigger
                        aria-invalid={hasErrors}
                        className="h-8"
                        id={field.name}
                        disabled={regionsDisabled || snapshotFilteredRegions.length === 0}
                        loading={regionsDisabled}
                      >
                        <SelectValue
                          placeholder={
                            loadingRegions
                              ? 'Loading regions...'
                              : snapshotFilteredRegions.length === 0
                                ? 'No regions available'
                                : 'Select a region'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {snapshotFilteredRegions.map((region) => (
                          <SelectItem key={region.id} value={region.id}>
                            {getRegionFullDisplayName(region)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {selectedSource === Source.SNAPSHOT && selectedSnapshot && snapshotFilteredRegions.length === 0
                        ? 'The selected snapshot is not available in any selectable region.'
                        : selectedSource === Source.SNAPSHOT && selectedSnapshot?.regionIds?.length
                          ? 'Only regions where the selected snapshot is available are shown.'
                          : 'The region where the sandbox will be created.'}
                    </FieldDescription>
                    {hasErrors && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </form.Field>
            {canSetDefaultRegion && (
              <form.Field name="setAsDefaultRegion">
                {(field) => (
                  <form.Subscribe selector={(state) => state.values.regionId}>
                    {(regionId) => (
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={field.name}
                          className="mt-0.5"
                          checked={field.state.value ?? false}
                          disabled={!regionId}
                          onCheckedChange={(checked) => field.handleChange(checked === true)}
                        />
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={field.name} className="text-sm font-normal">
                            Set this as the organization's default region
                          </Label>
                          <FieldDescription>
                            Use the selected region by default for future sandboxes in this organization.
                          </FieldDescription>
                        </div>
                      </div>
                    )}
                  </form.Subscribe>
                )}
              </form.Field>
            )}
            <div className="flex flex-col gap-2">
              <SheetSectionTitle>Lifecycle</SheetSectionTitle>
              <div className="flex flex-col gap-2">
                <form.Field name="autoStopInterval">
                  {(field) => (
                    <div className="flex items-center gap-4">
                      <Label htmlFor={field.name} className="w-40 flex-shrink-0 flex items-center gap-1">
                        Auto-stop (min):
                        <Tooltip
                          label={<InfoTooltipButton aria-label="Auto-stop information" />}
                          content={
                            <p>
                              Minutes of inactivity before stopping. Resets on preview access, SSH, or Toolbox API
                              calls.
                              <br />
                              <span className="text-muted-foreground">0 = disabled</span>
                            </p>
                          }
                          side="right"
                          contentClassName="max-w-xs"
                        />
                      </Label>
                      <NumericFormat
                        customInput={Input}
                        id={field.name}
                        className="w-full"
                        placeholder="15"
                        decimalScale={0}
                        allowNegative={false}
                        value={field.state.value ?? ''}
                        onValueChange={(values) => field.handleChange(values.floatValue ?? undefined)}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="autoArchiveInterval">
                  {(field) => (
                    <div className="flex items-center gap-4">
                      <Label htmlFor={field.name} className="w-40 flex-shrink-0 flex items-center gap-1">
                        Auto-archive (min):
                        <Tooltip
                          label={<InfoTooltipButton aria-label="Auto-archive information" />}
                          content={
                            <p>
                              Minutes a sandbox must remain continuously stopped before archiving.
                              <br />
                              <span className="text-muted-foreground">0 = max (30 days)</span>
                            </p>
                          }
                          side="right"
                          contentClassName="max-w-xs"
                        />
                      </Label>
                      <NumericFormat
                        customInput={Input}
                        id={field.name}
                        className="w-full"
                        placeholder="10080 (7 days)"
                        decimalScale={0}
                        allowNegative={false}
                        value={field.state.value ?? ''}
                        onValueChange={(values) => field.handleChange(values.floatValue ?? undefined)}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="autoDeleteInterval">
                  {(field) => (
                    <form.Subscribe selector={(state) => state.values.ephemeral}>
                      {(ephemeral) => (
                        <div className="flex items-center gap-4">
                          <Label htmlFor={field.name} className="w-40 flex-shrink-0 flex items-center gap-1">
                            Auto-delete (min):
                            <Tooltip
                              label={<InfoTooltipButton aria-label="Auto-delete information" />}
                              content={
                                <p>
                                  Minutes a sandbox must remain continuously stopped before permanent deletion.
                                  <br />
                                  <span className="text-muted-foreground">0 = deleted on stop</span>
                                  <br />
                                  <span className="text-muted-foreground">-1 = disabled</span>
                                </p>
                              }
                              side="right"
                              contentClassName="max-w-xs"
                            />
                          </Label>
                          <NumericFormat
                            customInput={Input}
                            id={field.name}
                            className="w-full"
                            placeholder="Disabled"
                            disabled={ephemeral || requiresEphemeralSandbox}
                            decimalScale={0}
                            allowNegative
                            isAllowed={(values) => {
                              if (values.floatValue === undefined) return true
                              return values.floatValue === -1 || values.floatValue >= 0
                            }}
                            value={ephemeral || requiresEphemeralSandbox ? 0 : (field.state.value ?? '')}
                            onValueChange={(values) => field.handleChange(values.floatValue ?? undefined)}
                          />
                        </div>
                      )}
                    </form.Subscribe>
                  )}
                </form.Field>
                <form.Field name="ephemeral">
                  {(field) => (
                    <div className="flex items-start gap-2">
                      <Checkbox
                        className="mt-0.5"
                        id={field.name}
                        checked={requiresEphemeralSandbox || (field.state.value ?? false)}
                        disabled={requiresEphemeralSandbox}
                        onCheckedChange={(checked) => {
                          const isEphemeral = checked === true
                          field.handleChange(isEphemeral)
                          if (isEphemeral) {
                            form.setFieldValue('autoDeleteInterval', 0)
                          }
                        }}
                      />
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={field.name} className="text-sm font-normal">
                          Ephemeral
                        </Label>
                        <FieldDescription>
                          {requiresEphemeralSandbox
                            ? 'Required for GPU sandboxes - automatically deleted when stopped.'
                            : 'Automatically delete the sandbox when it stops.'}
                        </FieldDescription>
                      </div>
                    </div>
                  )}
                </form.Field>
              </div>
            </div>

            <form.Field name="envVars">
              {(field) => {
                const hasErrors = field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={hasErrors}>
                    <FieldLabel>Environment Variables</FieldLabel>
                    <div className="flex flex-col gap-2">
                      {(field.state.value ?? []).map((_, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            placeholder="Key"
                            value={field.state.value?.[index]?.key ?? ''}
                            onChange={(e) => {
                              const updated = [...(field.state.value ?? [])]
                              updated[index] = { ...updated[index], key: e.target.value }
                              field.handleChange(updated)
                            }}
                            onPaste={(e) => handleEnvPaste(e, index)}
                          />
                          <Input
                            placeholder="Value"
                            value={field.state.value?.[index]?.value ?? ''}
                            onChange={(e) => {
                              const updated = [...(field.state.value ?? [])]
                              updated[index] = { ...updated[index], value: e.target.value }
                              field.handleChange(updated)
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove variable"
                            className="flex-shrink-0 h-8 w-8"
                            onClick={() => {
                              const updated = (field.state.value ?? []).filter((_, i) => i !== index)
                              field.handleChange(updated)
                            }}
                          >
                            <Minus className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        onClick={() => field.handleChange([...(field.state.value ?? []), { key: '', value: '' }])}
                      >
                        <Plus className="size-4" />
                        Add Variable
                      </Button>
                    </div>
                    <FieldDescription
                      render={
                        <div>
                          <input
                            type="file"
                            accept="env"
                            className="sr-only peer"
                            onChange={handleEnvFileImport}
                            id="env-file-input"
                          />
                          <Label
                            className="inline-flex items-center gap-1 font-normal leading-normal underline hover:text-foreground cursor-pointer peer-focus-visible:text-primary"
                            htmlFor="env-file-input"
                          >
                            <Upload className="size-3" />
                            Import .env file
                          </Label>{' '}
                          or paste .env contents into any key field.
                        </div>
                      }
                    />
                    {hasErrors && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="labels">
              {(field) => {
                const hasErrors = field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={hasErrors}>
                    <FieldLabel>Labels</FieldLabel>
                    <div className="flex flex-col gap-2">
                      {(field.state.value ?? []).map((_, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            placeholder="Key"
                            value={field.state.value?.[index]?.key ?? ''}
                            onChange={(e) => {
                              const updated = [...(field.state.value ?? [])]
                              updated[index] = { ...updated[index], key: e.target.value }
                              field.handleChange(updated)
                            }}
                          />
                          <Input
                            placeholder="Value"
                            value={field.state.value?.[index]?.value ?? ''}
                            onChange={(e) => {
                              const updated = [...(field.state.value ?? [])]
                              updated[index] = { ...updated[index], value: e.target.value }
                              field.handleChange(updated)
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove label"
                            className="flex-shrink-0 h-8 w-8"
                            onClick={() => {
                              const updated = (field.state.value ?? []).filter((_, i) => i !== index)
                              field.handleChange(updated)
                            }}
                          >
                            <Minus className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        onClick={() => field.handleChange([...(field.state.value ?? []), { key: '', value: '' }])}
                      >
                        <Plus className="size-4" />
                        Add Label
                      </Button>
                    </div>
                    {hasErrors && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </form.Field>

            <div className="flex flex-col gap-4">
              <SheetSectionTitle>Network</SheetSectionTitle>
              <form.Field name="public">
                {(field) => (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id={field.name}
                      className="mt-0.5"
                      checked={field.state.value ?? false}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                    />
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={field.name} className="text-sm font-normal">
                        Public HTTP Preview
                      </Label>
                      <FieldDescription>Allow public access to HTTP preview URLs.</FieldDescription>
                    </div>
                  </div>
                )}
              </form.Field>
              <form.Field name="networkBlockAll">
                {(field) => (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id={field.name}
                      className="mt-0.5"
                      checked={field.state.value ?? false}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                    />
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={field.name} className="text-sm font-normal">
                        Block All Network Access
                      </Label>
                      <FieldDescription>Block all outbound network access from the sandbox.</FieldDescription>
                    </div>
                  </div>
                )}
              </form.Field>
            </div>
          </form>
        </ScrollArea>
        <SheetFooter className="border-t border-border p-4 px-5">
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                size="sm"
                form="create-sandbox-form"
                variant="default"
                disabled={!canSubmit || isSubmitting || !selectedOrganization?.id}
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
