export class RunnerApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'RunnerApiError'
  }
}
