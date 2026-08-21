import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { WarmPool } from '../entities/warm-pool.entity'

@ApiSchema({ name: 'WarmPool' })
export class WarmPoolDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  organizationId: string

  @ApiProperty()
  snapshot: string

  @ApiProperty()
  target: string

  @ApiProperty({ description: 'Desired number of warm sandboxes' })
  pool: number

  @ApiProperty({ description: 'Current number of ready warm sandboxes in the pool' })
  currentSize: number

  @ApiProperty()
  cpu: number

  @ApiProperty()
  mem: number

  @ApiProperty()
  disk: number

  @ApiProperty()
  osUser: string

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  env: { [key: string]: string }

  @ApiProperty({ required: false, nullable: true })
  errorReason?: string | null

  @ApiProperty()
  createdAt: string

  @ApiProperty()
  updatedAt: string

  static from(warmPool: WarmPool, currentSize: number): WarmPoolDto {
    const dto = new WarmPoolDto()
    dto.id = warmPool.id
    dto.organizationId = warmPool.organizationId ?? ''
    dto.snapshot = warmPool.snapshot
    dto.target = warmPool.target
    dto.pool = warmPool.pool
    dto.currentSize = currentSize
    dto.cpu = warmPool.cpu
    dto.mem = warmPool.mem
    dto.disk = warmPool.disk
    dto.osUser = warmPool.osUser
    dto.env = warmPool.env ?? {}
    dto.errorReason = warmPool.errorReason ?? null
    dto.createdAt = warmPool.createdAt?.toISOString()
    dto.updatedAt = warmPool.updatedAt?.toISOString()
    return dto
  }
}
