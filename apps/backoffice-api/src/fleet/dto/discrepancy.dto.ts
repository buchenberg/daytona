import { ApiProperty } from '@nestjs/swagger'

export enum DiscrepancyKind {
  NOT_IN_PROD = 'not_in_prod',
  PROD_ONLY = 'prod_only',
  DISABLED_BUT_ACTIVE = 'disabled_but_active',
  UNRESPONSIVE = 'unresponsive',
}

/** A place where the inventory and production disagree. */
export class DiscrepancyDto {
  @ApiProperty({ enum: DiscrepancyKind, enumName: 'DiscrepancyKind' })
  kind: DiscrepancyKind

  @ApiProperty({ type: String, nullable: true })
  runnerName: string | null

  @ApiProperty({ type: String, nullable: true })
  domain: string | null

  @ApiProperty()
  detail: string
}
