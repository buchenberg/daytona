import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'

export class RangeDto {
  @ApiPropertyOptional({ description: 'Minimum value (inclusive)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  min?: number

  @ApiPropertyOptional({ description: 'Maximum value (inclusive)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  max?: number
}
