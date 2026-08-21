/**
 * Thrown by a mali datasource service when a tool is invoked for a user who
 * has the corresponding source `{disabled: true}` in their override blob.
 * Caught by ChatService.executeTool and rendered as a clean tool error
 * instead of a generic 500.
 */
export class DatasourceDisabledError extends Error {
  constructor(
    public readonly source: string,
    public readonly userId: string,
  ) {
    super(`The ${source} tool is disabled for your account.`)
    this.name = 'DatasourceDisabledError'
  }
}
