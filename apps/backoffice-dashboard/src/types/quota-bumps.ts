// Response shapes for the quota-bump endpoints. The generated client types these
// as `void` (the controllers don't declare response DTOs), so we describe them here.
// Request bodies use the generated CreateQuotaBumpDto / RejectQuotaBumpDto.

export const SANDBOX_CLASSES = ['container', 'linux-vm', 'android', 'windows'] as const
export type SandboxClass = (typeof SANDBOX_CLASSES)[number]

export type QuotaBumpStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'superseded'

export interface BumpAmounts {
  cpu: number
  memory: number
  disk: number
}

export interface QuotaBumpRequestDto {
  id: string
  organizationId: string
  regionId: string
  sandboxClass: SandboxClass
  requestedById: string
  requestedByEmail: string
  cpuDelta: number
  memoryDelta: number
  diskDelta: number
  cpuBefore: number
  memoryBefore: number
  diskBefore: number
  cpuAfter: number
  memoryAfter: number
  diskAfter: number
  status: QuotaBumpStatus
  reason?: string | null
  expiresAt: string
  decidedById?: string | null
  decidedByEmail?: string | null
  decidedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface BumpLimits {
  maxPercent: number
  flatIncrease: BumpAmounts
}

export interface QuotaBumpBudgetDto {
  budget: BumpAmounts
  spent: BumpAmounts
  remaining: BumpAmounts
  limits: BumpLimits
}

export interface PendingQuotaBumpsResponse {
  success: boolean
  data: { bumps: QuotaBumpRequestDto[] }
  total: number
}
