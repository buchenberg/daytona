import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator'
import { MaintenanceStatus, MaintenanceType } from '../../backoffice-db/entities/maintenance-request.entity'

export class CreateMaintenanceRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ enum: MaintenanceType, enumName: 'MaintenanceType' })
  @IsEnum(MaintenanceType)
  type: MaintenanceType

  @ApiProperty({ type: [String], description: 'Targeted inventory hostnames' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  runnerNames: string[]

  @ApiProperty({ description: 'Who asked for the work' })
  @IsString()
  @IsNotEmpty()
  requestedBy: string

  @ApiPropertyOptional({ description: '0 = p0 (most urgent) … 3 = p3; defaults to 2' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  priority?: number
}

export class UpdateMaintenanceRequestDto {
  // title/description are not nullable columns, so unlike @IsOptional() the
  // ValidateIf guard only skips validation for undefined and rejects null.
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  title?: string

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string

  @ApiPropertyOptional({ description: '0 = p0 (most urgent) … 3 = p3' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(3)
  priority?: number
}

export class TransitionMaintenanceRequestDto {
  @ApiProperty({ enum: MaintenanceStatus, enumName: 'MaintenanceStatus' })
  @IsEnum(MaintenanceStatus)
  status: MaintenanceStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string
}

export class AddMaintenanceNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string
}
