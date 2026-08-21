import type { FacetedFilterOperator, FacetedFilterOption } from '@/components/ui/faceted-filter'
import { cn } from '@/lib/utils'
import {
  Activity,
  Box,
  Boxes,
  Building2,
  Container,
  Fingerprint,
  Flame,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  Mail,
  Server,
  Shield,
  Target,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

export interface AuditFilterRule {
  field: string
  operator: string
  value: string[]
}

export type AuditFilterFieldType = 'text' | 'enum' | 'number'

export const MAX_AUDIT_FILTER_RULES = 10

export const LIST_OPERATORS = new Set(['in', 'notIn'])

export function isListOperator(operator: string): boolean {
  return LIST_OPERATORS.has(operator)
}

export const STRING_OPERATORS = [
  { value: 'eq', label: 'is', symbol: '=' },
  { value: 'not', label: 'is not', symbol: '≠' },
  { value: 'in', label: 'is any of', symbol: '∈' },
  { value: 'notIn', label: 'is none of', symbol: '∉' },
] as const satisfies readonly FacetedFilterOperator[]

export interface AuditFilterFieldDef {
  field: string
  label: string
  type: AuditFilterFieldType
  icon: LucideIcon
  operators: readonly FacetedFilterOperator[]
  defaultOperator: string
  options?: readonly FacetedFilterOption[]
  allowCustom?: boolean
  placeholder?: string
}

function entityIcon(Icon: LucideIcon): ReactNode {
  return <Icon className="size-4" />
}

const TARGET_TYPE_OPTIONS: readonly FacetedFilterOption[] = [
  { value: 'sandbox', label: 'Sandbox', icon: entityIcon(Container) },
  { value: 'snapshot', label: 'Snapshot', icon: entityIcon(Box) },
  { value: 'volume', label: 'Volume', icon: entityIcon(HardDrive) },
  { value: 'warm_pool', label: 'Warm Pool', icon: entityIcon(Flame) },
  { value: 'api_key', label: 'API Key', icon: entityIcon(KeyRound) },
  { value: 'runner', label: 'Runner', icon: entityIcon(Server) },
  { value: 'region', label: 'Region', icon: entityIcon(Globe) },
  { value: 'docker_registry', label: 'Docker Registry', icon: entityIcon(Boxes) },
  { value: 'organization', label: 'Organization', icon: entityIcon(Building2) },
  { value: 'organization_invitation', label: 'Organization Invitation', icon: entityIcon(Mail) },
  { value: 'organization_role', label: 'Organization Role', icon: entityIcon(Shield) },
  { value: 'organization_user', label: 'Organization User', icon: entityIcon(Users) },
  { value: 'user', label: 'User', icon: entityIcon(User) },
]

const COMMON_ACTION_OPTIONS: readonly FacetedFilterOption[] = [
  'create',
  'read',
  'update',
  'delete',
  'login',
  'start',
  'stop',
  'archive',
  'snapshot',
  'fork',
  'suspend',
  'unsuspend',
].map((value) => ({ value, label: value }))

function getStatusDotColorClass(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) {
    return 'bg-success-foreground'
  }
  if (statusCode >= 300 && statusCode < 400) {
    return 'bg-info'
  }
  if (statusCode >= 400) {
    return 'bg-destructive'
  }
  return 'bg-muted-foreground'
}

function StatusCodeLabel({ code, reason }: { code: number; reason: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn('size-2 shrink-0 rounded-full', getStatusDotColorClass(code))} aria-hidden="true" />
      <span className="shrink-0 font-mono">{code}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{reason}</span>
    </span>
  )
}

const STATUS_CODE_OPTIONS: readonly FacetedFilterOption[] = [
  { code: 200, reason: 'OK' },
  { code: 201, reason: 'Created' },
  { code: 204, reason: 'No Content' },
  { code: 400, reason: 'Bad Request' },
  { code: 401, reason: 'Unauthorized' },
  { code: 403, reason: 'Forbidden' },
  { code: 404, reason: 'Not Found' },
  { code: 409, reason: 'Conflict' },
  { code: 429, reason: 'Too Many Requests' },
  { code: 500, reason: 'Internal Server Error' },
].map(({ code, reason }) => ({ value: String(code), label: <StatusCodeLabel code={code} reason={reason} /> }))

export const AUDIT_FILTER_FIELDS: readonly AuditFilterFieldDef[] = [
  {
    field: 'action',
    label: 'Action',
    type: 'enum',
    icon: Activity,
    operators: STRING_OPERATORS,
    defaultOperator: 'in',
    options: COMMON_ACTION_OPTIONS,
    allowCustom: true,
    placeholder: 'Action',
  },
  {
    field: 'targetType',
    label: 'Target type',
    type: 'enum',
    icon: Boxes,
    operators: STRING_OPERATORS,
    defaultOperator: 'in',
    options: TARGET_TYPE_OPTIONS,
    placeholder: 'Target type',
  },
  {
    field: 'targetId',
    label: 'Target ID',
    type: 'text',
    icon: Target,
    operators: STRING_OPERATORS,
    defaultOperator: 'eq',
    placeholder: 'Target ID',
  },
  {
    field: 'actorEmail',
    label: 'User email',
    type: 'text',
    icon: Mail,
    operators: STRING_OPERATORS,
    defaultOperator: 'eq',
    placeholder: 'user@example.com',
  },
  {
    field: 'actorId',
    label: 'User ID',
    type: 'text',
    icon: User,
    operators: STRING_OPERATORS,
    defaultOperator: 'eq',
    placeholder: 'User ID',
  },
  {
    field: 'actorApiKeySuffix',
    label: 'API key',
    type: 'enum',
    icon: KeyRound,
    operators: [
      { value: 'in', label: 'is any of', symbol: '∈' },
      { value: 'eq', label: 'is', symbol: '=' },
    ],
    defaultOperator: 'in',
    options: [],
    allowCustom: true,
    placeholder: 'Search API keys',
  },
  {
    field: 'statusCode',
    label: 'Status code',
    type: 'enum',
    icon: Gauge,
    operators: STRING_OPERATORS,
    defaultOperator: 'in',
    options: STATUS_CODE_OPTIONS,
    placeholder: 'Status code',
  },
  {
    field: 'id',
    label: 'Log ID',
    type: 'text',
    icon: Fingerprint,
    operators: [
      { value: 'eq', label: 'is', symbol: '=' },
      { value: 'in', label: 'is any of', symbol: '∈' },
    ],
    defaultOperator: 'eq',
    placeholder: 'Log ID',
  },
]

const FIELD_DEF_BY_KEY = new Map(AUDIT_FILTER_FIELDS.map((def) => [def.field, def]))

export function getAuditFilterFieldDef(field: string): AuditFilterFieldDef | undefined {
  return FIELD_DEF_BY_KEY.get(field)
}

export function getAuditValueLabel(
  def: AuditFilterFieldDef,
  value: string,
  options?: readonly FacetedFilterOption[],
): ReactNode {
  const resolved = options ?? def.options
  const option = resolved?.find((opt) => opt.value === value)
  return option?.label ?? value
}
