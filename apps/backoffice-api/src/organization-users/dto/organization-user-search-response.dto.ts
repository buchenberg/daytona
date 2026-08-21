import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { OrganizationUser } from '@api/organization/entities/organization-user.entity'
import { OrganizationMemberRole } from '@api/organization/enums/organization-member-role.enum'
import { PaginationResponseDto } from '../../common/dto/pagination.dto'

// Minimal DTO for backoffice operations - only fields used in TableView
export class OrganizationUserResponseDto implements Partial<OrganizationUser> {
  @ApiProperty() organizationId: string
  @ApiProperty() userId: string
  @ApiProperty({ enum: OrganizationMemberRole }) role: OrganizationMemberRole
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
  @ApiPropertyOptional() userEmail?: string
}

export class OrganizationUserSearchDataDto {
  @ApiProperty({ type: [OrganizationUserResponseDto], description: 'List of organization users' })
  organizationUsers: OrganizationUserResponseDto[]
}

export class OrganizationUserSearchResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: OrganizationUserSearchDataDto, description: 'Search results data' })
  data: OrganizationUserSearchDataDto

  @ApiProperty({ type: PaginationResponseDto, description: 'Pagination information' })
  pagination: PaginationResponseDto
}
