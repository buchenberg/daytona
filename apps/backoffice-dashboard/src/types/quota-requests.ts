// Request/response shapes for the quota-request endpoints. The generated client
// types these responses as `void` (the controllers do not declare response DTOs),
// so we describe them by hand here.

export const SANDBOX_CLASSES = ['container', 'linux-vm', 'android', 'windows'] as const
export type SandboxClass = (typeof SANDBOX_CLASSES)[number]

// Support can request quota creation for container only, for now — the other
// classes need capacity planning before self-service creates. Mirrors
// CREATABLE_SANDBOX_CLASSES on the server; extend both together.
export const CREATE_SANDBOX_CLASSES = ['container'] as const

export type QuotaRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'superseded'

export type QuotaRequestKind = 'update' | 'create'

export interface QuotaAmounts {
  cpu: number
  memory: number
  disk: number
  gpu: number
}

export interface QuotaRequestDto {
  id: string
  organizationId: string
  regionId: string
  sandboxClass: SandboxClass
  kind: QuotaRequestKind
  requestedById: string
  requestedByEmail: string
  cpuDelta: number
  memoryDelta: number
  diskDelta: number
  gpuDelta: number
  cpuBefore: number
  memoryBefore: number
  diskBefore: number
  gpuBefore: number
  cpuAfter: number
  memoryAfter: number
  diskAfter: number
  gpuAfter: number
  status: QuotaRequestStatus
  reason?: string | null
  expiresAt: string
  decidedById?: string | null
  decidedByEmail?: string | null
  decidedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateLimits {
  maxPercent: number
}

export interface QuotaUpdateBudgetDto {
  budget: QuotaAmounts
  spent: QuotaAmounts
  remaining: QuotaAmounts
  limits: UpdateLimits
}

export interface UpdateQuotaRequestDto {
  organizationId: string
  regionId: string
  sandboxClass?: SandboxClass
  cpuDelta?: number
  memoryDelta?: number
  diskDelta?: number
  gpuDelta?: number
  reason?: string
}

export interface CreateQuotaRequestDto {
  organizationId: string
  regionId: string
  sandboxClass?: SandboxClass
  reason?: string
}

export interface RegionDto {
  id: string
  name: string
}

export interface PendingQuotaRequestsResponse {
  success: boolean
  data: { requests: QuotaRequestDto[] }
  total: number
}
