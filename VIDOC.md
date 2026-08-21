# Daytona Platform Architecture

Context file for automated security review. Daytona runs arbitrary, untrusted user code in
isolated sandboxes at scale. The security model is a cascade of trust boundaries from the
public control plane down to the per-sandbox runtime that executes user code.

Verified against the `prod` branch. Re-confirm against code before relying on any single line.

Monorepo: TypeScript (primary), Go (performance-critical and sandbox-side services), Python/Ruby
(SDKs). Nx + Yarn 4. Control plane on AWS; sandbox compute on dedicated hosts (bare metal in
Daytona's cloud; EC2 / Kubernetes / any Docker host for self-hosted).

## Applications (apps/)

Internet-facing (control plane):

- `apps/api` — TypeScript, NestJS. Primary public API: all CRUD/auth for users, orgs, sandboxes,
  snapshots, volumes. TypeORM + PostgreSQL. Has its own public ingress and also serves the
  dashboard's static build (`ServeStaticModule`). Talks to runners to manage sandbox lifecycle.
  Holds control-plane PII. Auth: JWT (Auth0) and API keys. Highest-value control-plane target.
- `apps/proxy` — Go (Gin). Separate public ingress that fronts ONLY sandbox preview and toolbox
  traffic. Forwards directly to the runner hosting the sandbox (`get_sandbox_target.go`), using the
  API only as a metadata/auth lookup; it does not front the API or serve the dashboard.
  Public-sandbox preview ports are served WITHOUT authentication by design. CORS is permissive by
  design on preview traffic.
- `apps/ssh-gateway` — Go. A third, independent internet-facing entry point: a raw TCP SSH listener
  (port 2222). The SSH username carries an access token, validated post-handshake against the API
  (`/sandbox/ssh-access/validate`). Server runs `NoClientAuth: true` (token check is
  application-layer); password auth explicitly refused; no public-key auth. Host/client keys loaded
  from `SSH_HOST_KEY` / `SSH_PRIVATE_KEY` env. Dials the runner's SSH endpoint (port 2220) directly.

Sandbox compute plane (not directly internet-exposed; reachable by the proxy and ssh-gateway, not
only by the API):

- `apps/runner` — Go. A systemd service on the compute host (NOT TypeScript, NOT
  Docker-in-Docker). Talks to the host Docker daemon to launch sandbox containers, with runtime set
  from `CONTAINER_RUNTIME`, defaulting to `sysbox-runc` for container-level isolation and falling
  back to a Kata Containers microVM (`kata-clh`) when Sysbox fails. Manages lifecycle and S3-backed
  artifacts.
- `apps/daemon` — Go (Gin). Runs INSIDE each sandbox container and is the innermost trust boundary:
  untrusted user code executes here. Exposes the toolbox API on port 2280 on all interfaces with no
  auth middleware of its own. Routes: `/files`, `/git`, `/lsp`, `/process` (+ `/process/pty`),
  `/computeruse` (GUI automation: screenshots, input injection, AT-SPI), `/computeruse/recordings`,
  `/port`, `/proxy/:port/*path`. Uses `gorilla/websocket`, `gliderlabs/ssh`, `go-git`, `go-plugin`.

Internal admin plane:

- `apps/backoffice-api` — TypeScript, NestJS. Internal admin API (port 8080), imports the main API's
  entities, sensitive secrets (`JWT_SECRET`, `ADMIN_API_KEY`). Privileged surface.
- `apps/backoffice-dashboard` — TypeScript, React + Vite. Admin UI, built into the backoffice-api image.
- `apps/snapshot-manager` — Go. Internal OCI registry (CNCF `distribution/v3`) storing sandbox
  snapshot images on S3/filesystem. Auth is htpasswd/basic, default `none`
  (`SNAPSHOT_MANAGER_AUTH_TYPE`). Data-at-rest surface.
- `apps/otel-collector` — Go. Custom OpenTelemetry Collector. First-party exporter forwards
  per-tenant telemetry to customer-configured OTLP endpoints (SSRF-class surface) plus a ClickHouse
  exporter.

Client and non-production:

- `apps/cli` — Go. Auth0 OAuth (authorization-code, NO PKCE) plus API-key auth. Note: released
  binary embeds an Auth0 client secret via build-time ldflags (tracked issue #360). Config at
  `~/.config/daytona/config.json`, 0644, plaintext keys.
- `apps/daytona-e2e` — Go end-to-end tests. Non-production.

## Trust boundaries and data paths

Three public entry points, not one funnel:

1. HTTPS to the API (own ingress; also serves the dashboard).
2. HTTPS to the Proxy (sandbox preview + toolbox only; forwards straight to the runner).
3. SSH to the SSH Gateway on port 2222.

Data paths deliberately skip layers: Proxy and SDK toolbox traffic reach the daemon via
Proxy -> Runner -> Daemon (the API is not in that data path); SSH is Internet -> SSH Gateway ->
Runner -> sandbox. Public-sandbox preview ports carry internet traffic through to the sandbox
unauthenticated.

Inter-sandbox isolation is configurable, not absolute: `INTER_SANDBOX_NETWORK_ENABLED` defaults to
`true` in the runner, so by default sandboxes are not placed on the isolated per-runner bridge.
Combined with the unauthenticated daemon toolbox port (2280), treat cross-sandbox reachability as
possible under default configuration.

## Sandbox isolation

- Sandboxes are OCI containers launched by the runner via the host Docker daemon, isolated with the
  Sysbox runtime (`sysbox-runc`), with Kata microVM fallback.
- Four sandbox classes: `container` (Sysbox, daemon inside), `android` (container, no daemon, ADB),
  `linux-vm`, and `windows` (full VM; Windows snapshots are VHD blobs in S3).
- Egress is default-OPEN, not whitelist-only. `networkBlockAll` defaults false and `networkAllowList`
  is null, leaving only a traffic-marking limiter (no drop). Restriction is opt-in per sandbox or
  tier-imposed. Do not assume SSRF/exfiltration is contained by default.

## Data stores

PostgreSQL (primary, TypeORM), Redis (cache, rate limiting, locks, failed-auth tracking, pub/sub),
S3-compatible object storage (sandbox artifacts and snapshot-registry backend), ClickHouse (sandbox
telemetry derived from user workloads), plus optional, off-by-default OpenSearch (audit/search) and
Kafka (audit-log publishing).

## Scan scope

Scan all first-party code, including everything under `libs/` EXCEPT the generated clients:

- Exclude (generated from OpenAPI/proto specs): `libs/*api-client*`, `libs/runner-api-client`,
  `libs/analytics-api-client`, `libs/backoffice-api-client`, `libs/billing-api-client`,
  `libs/toolbox-api-client*`, `libs/runner-proto/gen`.
- DO scan the rest of `libs/`, especially `libs/common-go` (proxy/runner request-forwarding core),
  `libs/computer-use`, and the hand-written SDKs (`libs/sdk-*`). These are
  first-party production code, not external dependencies.

Down-rate findings in non-production paths: `docker/` compose (explicitly not for production),
`examples/`, `hack/`, `apps/daytona-e2e`, `*_test.go`, `__tests__/`.

## Severity calibration (per SECURITY.md)

Prioritize: sandbox-to-host escape, cross-tenant/cross-org access, control-plane authz bypass,
secret or cross-tenant data exposure. Out of scope / low: privilege escalation or root WITHIN a
sandbox (root in the sandbox is by design), and findings confined to non-production paths.
