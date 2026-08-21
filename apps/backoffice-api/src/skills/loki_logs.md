# Loki Log Querying — Daytona Platform

Use the `query_loki` tool with datasource UID `dejer43m2bpj4b` to query
application logs for the Daytona platform.

## Key Deployments

| Deployment | Purpose |
|---|---|
| `daytona-api` | Core API server — sandbox lifecycle, auth, org management |
| `daytona-proxy` | Reverse proxy — routes traffic to sandboxes |
| `daytona-proxy-toolbox` | Toolbox proxy — handles IDE/toolbox connections |

All deployments run in **namespace `daytona`** on **cluster `prod-eks`**.

## Label Selectors

The standard label set for Daytona pod logs:

```logql
{namespace="daytona", container="<deployment-name>"}
```

Common labels available:

- `namespace` — always `daytona` for platform services
- `container` — matches the deployment name (e.g. `daytona-api`)
- `pod` — specific pod instance
- `node` — k8s node
- `stream` — `stdout` or `stderr`

## Common LogQL Patterns

### Errors in a deployment (last 1h)

```logql
{namespace="daytona", container="daytona-api"} |= "error" | logfmt
```

### Specific error pattern

```logql
{namespace="daytona", container="daytona-api"} |~ "(?i)(panic|fatal|exception|fail)"
```

### HTTP status codes (5xx)

```logql
{namespace="daytona", container="daytona-api"} | json | status >= 500
```

### Error rate (metric query)

```logql
sum(rate({namespace="daytona", container="daytona-api"} |= "error" [5m]))
```

### Logs for a specific sandbox or request

```logql
{namespace="daytona", container="daytona-api"} |= "<sandbox-id>"
```

### Cross-deployment error scan

```logql
{namespace="daytona", container=~"daytona-api|daytona-proxy|daytona-proxy-toolbox"} |~ "(?i)error|panic|fatal"
```

## Query Guidelines

- Use `limit=200` by default; increase to 500 for broader sweeps.
- Always specify a time window (`start`/`end`) — default to last 1 hour.
- Use `direction=backward` (newest first) for recent issues.
- Filter aggressively: start with `|= "error"` or `|= "panic"`, then broaden.
- For structured logs, use `| json` or `| logfmt` to parse fields.
- When investigating an incident, query all three deployments in parallel.

## Workflow: Investigating an Issue

1. Start with a broad error scan across all deployments (last 1h).
2. Identify which deployment has the most errors.
3. Narrow down with specific patterns (status codes, error messages).
4. Check temporal correlation across deployments.
5. If a code fix is needed, use `create_fix_pr` with log evidence as context.
