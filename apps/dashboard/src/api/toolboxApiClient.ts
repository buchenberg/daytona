import { SandboxApi } from '@daytona/api-client'
import { ComputerUseApi, Configuration as ToolboxConfiguration } from '@daytona/toolbox-api-client'
import { AxiosInstance } from 'axios'

/**
 * Exposes the toolbox endpoints used by the dashboard, forwarding each call to the
 * matching `@daytona/toolbox-api-client` API. Requests go directly to the sandbox's
 * toolbox proxy: `{toolboxProxyUrl}/{sandboxId}/{endpoint}`.
 */
export class ToolboxApiClient {
  private toolboxUrlCache = new Map<string, string>()

  constructor(
    private readonly sandboxApi: SandboxApi,
    private readonly axiosInstance: AxiosInstance,
    private readonly getAccessToken: () => string,
  ) {}

  public async getComputerUseStatus(sandboxId: string, organizationId?: string) {
    const api = await this.getComputerUseApi(sandboxId, organizationId)
    return api.getComputerUseStatus()
  }

  public async startComputerUse(sandboxId: string, organizationId?: string) {
    const api = await this.getComputerUseApi(sandboxId, organizationId)
    return api.startComputerUse()
  }

  private async getComputerUseApi(sandboxId: string, organizationId?: string): Promise<ComputerUseApi> {
    return new ComputerUseApi(await this.getToolboxConfiguration(sandboxId, organizationId), '', this.axiosInstance)
  }

  private async getToolboxConfiguration(sandboxId: string, organizationId?: string): Promise<ToolboxConfiguration> {
    let toolboxProxyUrl = this.toolboxUrlCache.get(sandboxId)
    if (!toolboxProxyUrl) {
      toolboxProxyUrl = (await this.sandboxApi.getSandbox(sandboxId, organizationId)).data.toolboxProxyUrl
      this.toolboxUrlCache.set(sandboxId, toolboxProxyUrl)
    }

    return new ToolboxConfiguration({
      basePath: `${toolboxProxyUrl.replace(/\/+$/, '')}/${sandboxId}`,
      baseOptions: {
        headers: {
          Authorization: `Bearer ${this.getAccessToken()}`,
          // The toolbox proxy serves an interstitial warning page to browser requests unless this is set
          'X-Daytona-Skip-Preview-Warning': 'true',
          ...(organizationId ? { 'X-Daytona-Organization-ID': organizationId } : {}),
        },
      },
    })
  }
}
