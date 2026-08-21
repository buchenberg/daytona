import { IsFQDN, IsNotEmpty, IsString } from 'class-validator'

export class AddDomainWhitelistDto {
  @IsString()
  @IsNotEmpty()
  @IsFQDN()
  domain: string
}
