export type OutcomeCategory = 'informational' | 'success' | 'redirect' | 'client-error' | 'server-error' | 'unknown'

export interface OutcomeInfo {
  label: string
  colorClass: string
  dotClass: string
}

export function getOutcomeCategory(statusCode: number | null | undefined): OutcomeCategory {
  if (!statusCode) return 'unknown'

  if (statusCode >= 100 && statusCode < 200) return 'informational'
  if (statusCode >= 200 && statusCode < 300) return 'success'
  if (statusCode >= 300 && statusCode < 400) return 'redirect'
  if (statusCode >= 400 && statusCode < 500) return 'client-error'
  if (statusCode >= 500 && statusCode < 600) return 'server-error'

  return 'unknown'
}

export function getOutcomeInfo(statusCode: number | null | undefined): OutcomeInfo {
  switch (getOutcomeCategory(statusCode)) {
    case 'informational':
      return { label: 'Info', colorClass: 'text-blue-500 dark:text-blue-300', dotClass: 'bg-info' }
    case 'success':
      return {
        label: 'Success',
        colorClass: 'text-green-600 dark:text-green-400',
        dotClass: 'bg-success-foreground',
      }
    case 'redirect':
      return { label: 'Redirect', colorClass: 'text-blue-600 dark:text-blue-400', dotClass: 'bg-info' }
    case 'client-error':
    case 'server-error':
      return { label: 'Error', colorClass: 'text-red-600 dark:text-red-400', dotClass: 'bg-destructive' }
    case 'unknown':
    default:
      return { label: 'Unknown', colorClass: 'text-gray-600 dark:text-gray-400', dotClass: 'bg-muted-foreground' }
  }
}
