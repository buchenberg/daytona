/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

const DAYTONA_API_BASE = 'https://app.daytona.io/api'

const ORCHESTRATOR_SCRIPT = `
import anthropic, json, os, re, subprocess, sys

REPO = "/home/daytona/repo"

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO, timeout=60)
    out = r.stdout
    if r.stderr:
        out += "\\n" + r.stderr if out else r.stderr
    return out

def read_file(path):
    full = os.path.join(REPO, path) if not os.path.isabs(path) else path
    with open(full) as f:
        return f.read()

def write_file(path, content):
    full = os.path.join(REPO, path) if not os.path.isabs(path) else path
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(content)
    return "OK"

def replace_in_file(path, old_string, new_string):
    full = os.path.join(REPO, path) if not os.path.isabs(path) else path
    with open(full) as f:
        content = f.read()
    if old_string not in content:
        return f"Error: old_string not found in {path}"
    content = content.replace(old_string, new_string, 1)
    with open(full, "w") as f:
        f.write(content)
    return "OK — replaced successfully"

TOOLS = [
    {"name": "bash", "description": "Run a shell command in the repo directory.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "read_file", "description": "Read a file (path relative to repo root).",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "write_file", "description": "Write/overwrite a file with full content.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "replace_in_file", "description": "Replace the first occurrence of old_string with new_string in a file. Use this for targeted edits instead of rewriting the whole file.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_string": {"type": "string", "description": "Exact text to find (must match exactly, including whitespace)"}, "new_string": {"type": "string", "description": "Replacement text"}}, "required": ["path", "old_string", "new_string"]}},
]

def execute_tool(name, inp):
    try:
        if name == "bash":
            return run(inp["command"])
        if name == "read_file":
            return read_file(inp["path"])
        if name == "write_file":
            return write_file(inp["path"], inp["content"])
        if name == "replace_in_file":
            return replace_in_file(inp["path"], inp["old_string"], inp["new_string"])
        return f"Unknown tool: {name}"
    except Exception as e:
        return f"Error: {e}"

with open("/home/daytona/task.txt") as f:
    task = f.read().strip()

client = anthropic.Anthropic()
messages = [{"role": "user", "content": task}]
system = (
    "You are a coding agent. Your job is to FIX the issue by EDITING files. "
    "You MUST use replace_in_file or write_file to make actual code changes. "
    "Do NOT just analyze or describe — actually edit the code. "
    "Use bash to explore, read_file to read, then replace_in_file for targeted edits. "
    "After editing, use bash to verify the change (e.g. grep the modified lines). "
    "Be precise and minimal. Summarise what you changed at the end."
)

for _ in range(25):
    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        system=system,
        tools=TOOLS,
        messages=messages,
    )
    messages.append({"role": "assistant", "content": resp.content})
    if resp.stop_reason != "tool_use":
        for b in resp.content:
            if hasattr(b, "text") and b.text:
                print(b.text, flush=True)
        break
    results = []
    for b in resp.content:
        if b.type == "tool_use":
            print(f"[tool] {b.name}: {json.dumps(b.input)[:200]}", flush=True)
            out = execute_tool(b.name, b.input)
            results.append({"type": "tool_result", "tool_use_id": b.id, "content": out[:12000]})
    messages.append({"role": "user", "content": results})
`

const PR_SCRIPT_TEMPLATE = `
import json, urllib.request, sys

with open("/home/daytona/pr_payload.json") as f:
    payload = f.read()

req = urllib.request.Request(
    "{{api_url}}",
    data=payload.encode(),
    headers={{
        "Authorization": "token {{pat}}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }},
    method="POST",
)
try:
    resp = urllib.request.urlopen(req)
    print(resp.read().decode())
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(json.dumps({{"error": body, "status": e.code}}))
    sys.exit(1)
`

interface SandboxInfo {
  id: string
  name?: string
  state?: string
  snapshot?: string
  target?: string
  cpu?: number
  memory?: number
  disk?: number
}

interface ExecResult {
  exitCode: number
  result: string
}

const TOOLCHAIN_INSTALLERS: Record<string, string> = {
  go:
    'export GOVERSION=1.23.6 && ' +
    'mkdir -p $HOME/.local && ' +
    'curl -sL https://go.dev/dl/go${GOVERSION}.linux-amd64.tar.gz | tar -C $HOME/.local -xz && ' +
    'export PATH=$HOME/.local/go/bin:$PATH && ' +
    "echo 'export PATH=$HOME/.local/go/bin:$PATH' >> $HOME/.bashrc && " +
    'go version',
  node: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && ' + 'sudo apt-get install -y nodejs',
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name)
  private readonly githubRepoUrl: string
  private readonly githubPat: string

  constructor(private readonly configService: ConfigService) {
    this.githubRepoUrl = this.configService.get<string>('mali.sandbox.githubRepoUrl') || ''
    this.githubPat = this.configService.get<string>('mali.sandbox.githubPat') || ''
    this.logger.log('Sandbox service initialized')
  }

  isConfigured(): boolean {
    return true
  }

  private createClient(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: DAYTONA_API_BASE,
      timeout: 120_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private extractSandboxInfo(sandbox: Record<string, unknown>): SandboxInfo {
    return {
      id: sandbox.id as string,
      name: sandbox.name as string | undefined,
      state: sandbox.state != null ? String(sandbox.state) : undefined,
      snapshot: sandbox.snapshot as string | undefined,
      target: sandbox.target as string | undefined,
      cpu: sandbox.cpu as number | undefined,
      memory: sandbox.memory as number | undefined,
      disk: sandbox.disk as number | undefined,
    }
  }

  // Fetches the toolbox proxy base URL from the Daytona API config endpoint,
  // then builds the full URL for a specific sandbox.
  private proxyBaseUrl: string | null = null
  private async getToolboxUrl(client: AxiosInstance, sandboxId: string): Promise<string> {
    if (!this.proxyBaseUrl) {
      const resp = await client.get('/config')
      const template = resp.data.proxyToolboxUrl || resp.data.proxy_toolbox_url
      this.proxyBaseUrl = String(template).replace(/\/+$/, '')
    }
    if (this.proxyBaseUrl.includes('{sandboxId}')) {
      return this.proxyBaseUrl.replace('{sandboxId}', sandboxId)
    }
    return `${this.proxyBaseUrl}/${sandboxId}`
  }

  private async execInSandbox(
    client: AxiosInstance,
    sandboxId: string,
    command: string,
    timeout = 30,
    cwd?: string,
    env?: Record<string, string>,
  ): Promise<ExecResult> {
    const toolboxUrl = await this.getToolboxUrl(client, sandboxId)
    const body: Record<string, unknown> = { command, timeout }
    if (cwd) body.cwd = cwd
    if (env) body.env = env
    const resp = await axios.post(`${toolboxUrl}/process/execute`, body, {
      headers: {
        Authorization: client.defaults.headers['Authorization'] as string,
        'Content-Type': 'application/json',
      },
      timeout: (timeout + 10) * 1000,
    })
    return {
      exitCode: resp.data.exitCode ?? resp.data.exit_code ?? -1,
      result: resp.data.result ?? '',
    }
  }

  private async uploadFile(
    client: AxiosInstance,
    sandboxId: string,
    content: string,
    remotePath: string,
  ): Promise<void> {
    const toolboxUrl = await this.getToolboxUrl(client, sandboxId)
    const FormData = (await import('form-data')).default
    const form = new FormData()
    form.append('file', Buffer.from(content, 'utf-8'), {
      filename: remotePath.split('/').pop(),
      contentType: 'application/octet-stream',
    })
    await axios.post(`${toolboxUrl}/files/upload`, form, {
      params: { path: remotePath },
      headers: {
        Authorization: client.defaults.headers['Authorization'] as string,
        ...form.getHeaders(),
      },
      timeout: 30_000,
    })
  }

  private async waitForSandboxReady(client: AxiosInstance, sandboxId: string, maxWaitMs = 120_000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      const resp = await client.get(`/sandbox/${sandboxId}`)
      const state = resp.data.state as string
      if (state === 'started' || state === 'STARTED') return
      if (state === 'error' || state === 'ERROR' || state === 'BUILD_FAILED') {
        throw new Error(`Sandbox entered error state: ${state}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error('Sandbox did not become ready within timeout')
  }

  async sandboxCreate(
    apiKey: string,
    snapshot?: string,
    language?: string,
    name?: string,
    autoStopInterval?: number,
  ): Promise<SandboxInfo> {
    const client = this.createClient(apiKey)
    const body: Record<string, unknown> = {}
    if (snapshot) body.snapshot = snapshot
    if (language) body.language = language
    if (name) body.name = name
    if (autoStopInterval != null) body.autoStopInterval = autoStopInterval
    const resp = await client.post('/sandbox', body)
    const sandbox = resp.data
    await this.waitForSandboxReady(client, sandbox.id as string)
    return this.extractSandboxInfo(sandbox)
  }

  async sandboxList(apiKey: string): Promise<SandboxInfo[]> {
    const client = this.createClient(apiKey)
    const resp = await client.get('/sandbox')
    const items = (resp.data.items || resp.data) as Array<Record<string, unknown>>
    return items.map((s) => this.extractSandboxInfo(s))
  }

  async sandboxGet(apiKey: string, sandboxId: string): Promise<SandboxInfo> {
    const client = this.createClient(apiKey)
    const resp = await client.get(`/sandbox/${sandboxId}`)
    return this.extractSandboxInfo(resp.data)
  }

  async sandboxDelete(apiKey: string, sandboxId: string): Promise<{ status: string; sandboxId: string }> {
    const client = this.createClient(apiKey)
    await client.delete(`/sandbox/${sandboxId}`)
    return { status: 'deleted', sandboxId }
  }

  async sandboxExec(
    apiKey: string,
    sandboxId: string,
    command: string,
    timeout = 30,
  ): Promise<{ exitCode: number; output: string }> {
    const client = this.createClient(apiKey)
    const result = await this.execInSandbox(client, sandboxId, command, timeout)
    return {
      exitCode: result.exitCode,
      output: (result.result || '').trim(),
    }
  }

  async createFixPr(
    apiKey: string,
    title: string,
    task: string,
    context?: string,
    buildCmd?: string,
  ): Promise<Record<string, unknown>> {
    const client = this.createClient(apiKey)
    const branch = `auto-fix/${Math.floor(Date.now() / 1000)}`
    let sandboxId: string | null = null

    try {
      this.logger.log(`Creating sandbox for: ${task.substring(0, 80)}...`)
      const createResp = await client.post('/sandbox', { snapshot: 'daytona-large' })
      sandboxId = createResp.data.id as string
      this.logger.log(`Sandbox ${sandboxId} created`)

      await this.waitForSandboxReady(client, sandboxId)

      const anthropicApiKey = this.configService.get<string>('mali.anthropicApiKey') || ''
      const env: Record<string, string> = {
        ANTHROPIC_API_KEY: anthropicApiKey,
        DEBIAN_FRONTEND: 'noninteractive',
      }

      this.logger.log('Installing anthropic SDK...')
      const pipResult = await this.execInSandbox(client, sandboxId, 'pip install -q anthropic', 120, undefined, env)
      this.logger.log(`SDK installed (exit ${pipResult.exitCode})`)

      // Normalize repo URL: accept both "org/repo" and "https://github.com/org/repo" formats
      const repoPath = this.githubRepoUrl
        .replace(/^https?:\/\/github\.com\//, '')
        .replace(/\.git$/, '')
        .replace(/\/$/, '')
      const cloneUrl = `https://x-access-token:${this.githubPat}@github.com/${repoPath}.git`
      this.logger.log(`Cloning ${repoPath}...`)
      const cloneResult = await this.execInSandbox(
        client,
        sandboxId,
        `git clone --depth 50 ${cloneUrl} /home/daytona/repo 2>&1`,
        120,
      )
      if (cloneResult.exitCode !== 0) {
        const sanitized = (cloneResult.result || '').replace(this.githubPat, '***')
        return { status: 'error', error: `git clone failed: ${sanitized}` }
      }

      await this.execInSandbox(
        client,
        sandboxId,
        `git config user.name 'Daytona Ops Bot' && ` +
          `git config user.email 'ops-bot@daytona.io' && ` +
          `git checkout -b ${branch}`,
        30,
        '/home/daytona/repo',
      )

      const fullTask = this.buildTaskPrompt(task, context || '', branch)
      await this.uploadFile(client, sandboxId, fullTask, '/home/daytona/task.txt')
      await this.uploadFile(client, sandboxId, ORCHESTRATOR_SCRIPT, '/home/daytona/orchestrator.py')

      this.logger.log('Running Claude coding agent...')
      const agentResult = await this.execInSandbox(
        client,
        sandboxId,
        'python3 /home/daytona/orchestrator.py',
        600,
        '/home/daytona/repo',
        env,
      )
      const agentOutput = agentResult.result || ''
      this.logger.log(`Agent finished (exit ${agentResult.exitCode})`)
      if (agentResult.exitCode !== 0) {
        this.logger.warn(`Agent stderr/output: ${agentOutput.substring(0, 1000)}`)
      }

      const diffResult = await this.execInSandbox(
        client,
        sandboxId,
        'git diff --stat && git diff --stat --cached',
        30,
        '/home/daytona/repo',
      )
      const statusResult = await this.execInSandbox(
        client,
        sandboxId,
        'git status --porcelain',
        30,
        '/home/daytona/repo',
      )
      const hasChanges = !!((diffResult.result || '').trim() || (statusResult.result || '').trim())

      if (!hasChanges) {
        return {
          status: 'no_changes',
          message: 'Claude did not make any code changes.',
          agentOutput: agentOutput.substring(0, 3000),
        }
      }

      if (buildCmd) {
        await this.ensureToolchain(client, sandboxId, buildCmd)
        const pathPrefix = 'export PATH=$HOME/.local/go/bin:$PATH && '
        const fullBuild = `${pathPrefix}${buildCmd} 2>&1`
        this.logger.log(`Verifying build: ${buildCmd}`)
        const buildResult = await this.execInSandbox(client, sandboxId, fullBuild, 300, '/home/daytona/repo')
        if (buildResult.exitCode !== 0) {
          const buildErr = (buildResult.result || '').substring(0, 2000)
          this.logger.warn(`Build FAILED:\n${buildErr}`)
          return {
            status: 'build_failed',
            error: `Build check failed:\n${buildErr}`,
            agentOutput: agentOutput.substring(0, 2000),
            changes: (diffResult.result || '').trim(),
          }
        }
        this.logger.log('Build passed')
      }

      const prTitle = title || this.generateTitle(task)
      await this.execInSandbox(
        client,
        sandboxId,
        `git add -A && git commit -m ${JSON.stringify(prTitle)}`,
        30,
        '/home/daytona/repo',
      )
      const pushResult = await this.execInSandbox(
        client,
        sandboxId,
        `git push ${cloneUrl} ${branch} 2>&1`,
        60,
        '/home/daytona/repo',
      )
      if (pushResult.exitCode !== 0) {
        return {
          status: 'error',
          error: `git push failed (exit ${pushResult.exitCode}): ${pushResult.result || ''}`,
        }
      }
      this.logger.log(`Pushed branch ${branch}`)

      const prBody = this.buildPrBody(prTitle, task, context || '', diffResult.result || '', agentOutput)
      const prPayload = JSON.stringify({
        title: prTitle,
        body: prBody,
        head: branch,
        base: 'main',
      })
      await this.uploadFile(client, sandboxId, prPayload, '/home/daytona/pr_payload.json')

      const prScript = PR_SCRIPT_TEMPLATE.replace(
        '{{api_url}}',
        `https://api.github.com/repos/${this.githubRepoUrl}/pulls`,
      ).replace('{{pat}}', this.githubPat)
      await this.uploadFile(client, sandboxId, prScript, '/home/daytona/create_pr.py')

      const prResult = await this.execInSandbox(client, sandboxId, 'python3 /home/daytona/create_pr.py', 30)
      let prData: Record<string, unknown> = {}
      const prRaw = prResult.result || ''
      try {
        prData = JSON.parse(prRaw) as Record<string, unknown>
      } catch {
        this.logger.warn(`PR script output: ${prRaw.substring(0, 500)}`)
      }

      if (prData.error || prData.message) {
        this.logger.warn(`PR API error: ${JSON.stringify(prData)}`)
      }
      const prUrl = (prData.html_url as string) || ''
      this.logger.log(`PR created: ${prUrl}`)

      return {
        status: 'success',
        prUrl,
        branch,
        changes: (diffResult.result || '').trim(),
        prNumber: prData.number,
        agentSummary: agentOutput.substring(0, 3000),
      }
    } catch (exc) {
      const err = exc instanceof Error ? exc : new Error(String(exc))
      return { status: 'error', error: `${err.constructor.name}: ${err.message}` }
    } finally {
      if (sandboxId) {
        try {
          await client.delete(`/sandbox/${sandboxId}`)
          this.logger.log('Sandbox cleaned up')
        } catch {
          // best-effort cleanup
        }
      }
    }
  }

  private async ensureToolchain(client: AxiosInstance, sandboxId: string, buildCmd: string): Promise<void> {
    const needs = new Set<string>()
    if (buildCmd.includes('go ') || buildCmd.startsWith('go')) needs.add('go')
    if (['npx ', 'npm ', 'node ', 'yarn ', 'nx '].some((t) => buildCmd.includes(t))) needs.add('node')

    for (const tool of needs) {
      const check = await this.execInSandbox(client, sandboxId, `which ${tool} 2>/dev/null`, 10)
      if (check.exitCode === 0) continue
      const installer = TOOLCHAIN_INSTALLERS[tool]
      if (!installer) continue
      this.logger.log(`Installing ${tool} toolchain...`)
      const r = await this.execInSandbox(client, sandboxId, installer, 180)
      if (r.exitCode !== 0) {
        this.logger.warn(`${tool} install exited ${r.exitCode}: ${(r.result || '').substring(0, 300)}`)
      } else {
        this.logger.log(`${tool} installed`)
      }
    }
  }

  private buildTaskPrompt(task: string, context: string, branch: string): string {
    const parts = [
      `You are fixing an issue in the ${this.githubRepoUrl} repository.`,
      `The code is checked out at /home/daytona/repo on branch '${branch}'.`,
      '',
      '## Task',
      task,
    ]
    if (context) {
      parts.push('', '## Monitoring Context', context)
    }
    parts.push(
      '',
      '## Instructions',
      '1. Explore the repo structure to understand the codebase.',
      '2. Make the minimal, targeted changes needed to fix the issue.',
      '3. Do NOT modify unrelated files.',
      '4. Ensure the code compiles / passes basic checks if possible.',
      '5. When done, stop. Do NOT commit or push — that is handled externally.',
    )
    return parts.join('\n')
  }

  private generateTitle(task: string): string {
    const firstLine = task.split('\n')[0].trim().replace(/\.$/, '')
    if (firstLine.length <= 72) return firstLine
    return firstLine.substring(0, 69) + '...'
  }

  private buildPrBody(_title: string, task: string, context: string, diffStat: string, agentOutput: string): string {
    const sections: string[] = []

    sections.push('## Summary\n')
    sections.push(task.split('\n')[0].trim())

    let rootCause = ''
    let fixDesc = ''
    for (const line of task.split('\n')) {
      const low = line.toLowerCase().trim()
      if (low.includes('root cause') || low.includes('the fix') || low.includes('replace')) {
        if (low.includes('fix') || low.includes('replace')) {
          fixDesc += line.trim() + ' '
        } else {
          rootCause += line.trim() + ' '
        }
      }
    }
    if (rootCause) sections.push(`\n**Root cause:** ${rootCause.trim()}`)
    if (fixDesc) sections.push(`\n**Fix:** ${fixDesc.trim()}`)

    if (context) {
      sections.push('\n## Evidence\n')
      const ctxLines = context.trim().split('\n')
      const display = ctxLines.length > 10 ? [...ctxLines.slice(0, 10), '...'] : ctxLines
      sections.push('```\n' + display.join('\n') + '\n```')
    }

    if (diffStat) {
      sections.push('\n## Changes\n')
      sections.push('```\n' + diffStat.trim() + '\n```')
    }

    if (agentOutput) {
      const summaryLines: string[] = []
      for (const line of agentOutput.split('\n')) {
        if (line.trim() && !line.startsWith('[tool]')) {
          summaryLines.push(line.trim())
        }
      }
      if (summaryLines.length) {
        const trimmed = summaryLines.slice(-15).join('\n').substring(0, 1000)
        sections.push('\n## Agent Summary\n')
        sections.push(trimmed)
      }
    }

    sections.push(
      '\n---\n_Automated by [Daytona Ops Agent]' +
        '(https://github.com/daytonaio/daytona) — ' +
        'detected via production monitoring._',
    )
    return sections.join('\n')
  }
}
