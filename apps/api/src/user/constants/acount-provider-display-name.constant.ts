import { AccountProvider } from '../enums/account-provider.enum'

export const ACCOUNT_PROVIDER_DISPLAY_NAME: Record<AccountProvider, string> = {
  [AccountProvider.GOOGLE]: 'Google',
  [AccountProvider.GITHUB]: 'GitHub',
}
