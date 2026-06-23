# netleash

Kernel-level network containment for AI agents and sandboxed workloads. Netleash uses eBPF to enforce domain-based egress filtering, ensuring that untrusted code can only reach explicitly allowed destinations — and never sees real API secrets.

## How it works

Netleash attaches eBPF programs to filter all outbound network traffic at the kernel level. It supports two attachment modes:

- **Cgroup mode** (`cgroup_skb`) — attaches to a Linux cgroup, filtering traffic for all processes in that cgroup. Used for process wrapping, container attach, and cgroup attach.
- **Interface mode** (`TC/TCX`) — attaches to a network interface (veth, tap), filtering all traffic traversing that interface. Used for VMs running in network namespaces where cgroup-based filtering doesn't apply.

Both modes use the same filtering logic:

1. **Egress filter** — drops all outbound packets except those destined for allowed IPs. DNS queries for non-allowed domains are blocked before they leave the host (preventing DNS exfiltration). Two exceptions keep server workloads usable under an allow list: replies on connections a remote peer initiated _into_ the workload are allowed (so SSH/terminal, toolbox, and preview ports keep working — see the connection tracking below), and DNS queries for configured cluster-internal zones (`InternalDNSZones`, e.g. `cluster.local`) are passed through to the resolver rather than dropped.

2. **DNS response interceptor** — watches incoming DNS responses for allowed domains and dynamically populates the IP allowlist. This means you configure domains, not IPs — and the filter adapts as DNS records change.

3. **Inbound connection tracking** — the ingress program records connections a remote peer opens to the workload (inbound `SYN`). The egress program allows the workload's reply traffic on exactly those connections, so a workload acting as a server can answer without its peer's IP ever being DNS-learned. Workload-initiated outbound connections are unaffected (they go through the IP allowlist as usual).

4. **MITM proxy** (optional) — an ephemeral-CA HTTPS proxy that intercepts outbound requests and replaces placeholder values with real secrets on the wire. The sandboxed process sees `__LEASH_SECRET_a1b2c3...` in its environment; the proxy swaps it for `sk-real-key` before the request reaches the upstream API. The process never has access to the actual secret.

```
┌─────────────────────────────────────────────────────────┐
│  Sandboxed Process                                      │
│  OPENAI_API_KEY=__LEASH_SECRET_a1b2c3__                 │
│  HTTPS_PROXY=http://127.0.0.1:18080                     │
│                                                         │
│  curl https://api.openai.com/v1/chat/completions        │
│       -H "Authorization: Bearer $OPENAI_API_KEY"        │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  eBPF egress    │  ← kernel-level, can't be bypassed
              │  filter (cgroup)│     from inside the cgroup
              │                 │
              │  ✓ api.openai.com (DNS resolved → IP allowed)
              │  ✗ evil.com     (blocked, event emitted)
              │  ✗ DNS exfil    (query for evil.com dropped)
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  MITM Proxy     │  ← replaces placeholder with real secret
              │  (ephemeral CA) │     before forwarding to upstream
              │                 │
              │  Authorization: Bearer sk-real-key-here
              └────────┬────────┘
                       │
                       ▼
              api.openai.com
```

## Features

- **Domain-based egress filtering** — allow by domain name, not IP. Supports exact match and `*.example.com` wildcards
- **DNS exfiltration prevention** — outbound DNS queries are filtered against the allowlist in the eBPF program itself; queries for unauthorized domains are dropped at the kernel level
- **Secret injection** — MITM proxy replaces placeholders with real secrets on the wire, scoped to specific hosts. The sandboxed process never sees real credentials
- **Interface mode (TC eBPF)** — attach to any network interface (veth, tap) using TC/TCX programs. Filters VM traffic in network namespaces where cgroup-based filtering doesn't apply
- **Multiple operation modes** — wrap a process, attach to a cgroup, attach to a Docker container, attach to a network interface, or run as a standalone proxy server
- **JVM support** — auto-generates PKCS12 truststores and sets `JAVA_TOOL_OPTIONS` for Java applications that ignore `*_PROXY` env vars
- **Proxy authentication** — optional `Proxy-Authorization: Bearer <token>` with constant-time comparison
- **Per-container IP ACL** — in container mode, proxy access is restricted to the container's IP address
- **Blocked connection events** — ring buffer events for every blocked packet, with callbacks or structured logging

## Requirements

- Linux with cgroup v2 (for cgroup/process/container modes)
- Root or `CAP_BPF` + `CAP_SYS_ADMIN` (for eBPF and cgroup operations)
- Kernel 5.7+ (for `CLONE_INTO_CGROUP` support in process wrapper mode)
- Kernel 6.6+ (for TCX support in interface mode)
- Server mode requires no special privileges

### Build dependencies

- Go 1.25+
- clang (for eBPF C compilation)
- libbpf-dev (or kernel headers with BPF helpers)

## Installation

```bash
git clone https://github.com/daytona/netleash.git
cd netleash
make build
# Binary at bin/netleash
```

## Usage

### Process wrapper mode

Run a command inside a network jail. Only traffic to allowed domains gets through:

```bash
sudo netleash --allow api.openai.com -- curl https://api.openai.com/v1/models
```

With wildcard domains:

```bash
sudo netleash --allow "*.github.com" --allow api.openai.com -- python agent.py
```

### Secret injection

Inject API keys without exposing them to the sandboxed process:

```bash
sudo netleash \
  --allow api.openai.com \
  --secret OPENAI_API_KEY=sk-real-key:api.openai.com \
  -- python agent.py
```

The process sees `OPENAI_API_KEY=__LEASH_SECRET_<random>__` in its environment. When it makes a request to `api.openai.com`, the MITM proxy swaps the placeholder for `sk-real-key` in headers and body before forwarding upstream.

### Secret file

Avoid exposing secrets in `/proc/<pid>/cmdline` by reading them from a file:

```bash
sudo netleash \
  --allow api.openai.com \
  --secret-file /etc/netleash/secrets.conf \
  -- python agent.py
```

Secret file format (`#` comments, one per line):

```
# secrets.conf
OPENAI_API_KEY=sk-real-key:api.openai.com
GITHUB_TOKEN=ghp-xxx:api.github.com,github.com
```

Read from stdin with `--secret-file -` for piping from a secret manager.

### Container mode

Attach to a running Docker container — the firewall applies instantly to all processes in the container:

```bash
sudo netleash --allow api.openai.com --container my-sandbox
```

With secret injection into the container:

```bash
sudo netleash \
  --allow api.openai.com \
  --secret OPENAI_API_KEY=sk-real-key:api.openai.com \
  --container my-sandbox
```

The proxy binds to the Docker bridge gateway IP, and the container receives env vars via an injected file at `/tmp/.netleash-env`. Run `source /tmp/.netleash-env` inside the container to activate.

### Interface mode (TC eBPF)

Attach to a network interface using TC/TCX eBPF programs. This filters all traffic traversing the interface — useful for VMs running in network namespaces where cgroup-based filtering doesn't apply.

netleash resolves the interface by name in its current network namespace, so **you must run netleash inside the netns where the target interface exists**. For VMs that run inside a dedicated network namespace (e.g., Firecracker with a tap device in a netns), use `ip netns exec` or `nsenter` to enter the namespace before launching netleash.

For a veth interface (standard direction semantics):

```bash
sudo netleash --allow api.openai.com --interface veth0
```

For a tap device (e.g., Firecracker VM tap), use `--tap` to swap TC directions since VM-originated traffic arrives as ingress on the tap:

```bash
sudo netleash --allow api.openai.com --interface tap0 --tap
```

With secret injection:

```bash
sudo netleash \
  --allow api.openai.com \
  --secret OPENAI_API_KEY=sk-real-key:api.openai.com \
  --interface veth0
```

#### VM in a network namespace

A typical Firecracker setup places each VM in its own netns with a bridge, veth pair, and tap device:

```
Host netns                          VM netns (e.g., fc-vm-1)
──────────                          ────────────────────────
fcbr0 (bridge)                      veth0 ←─── host-side veth
  └── host-veth ──────────────────→   │
                                    tap0 ──── Firecracker VM
                                      │         └── guest eth0
                                    iptables MASQUERADE
```

To filter VM traffic, run netleash inside the VM's netns and attach to either the veth or tap:

```bash
# Enter the netns and attach to tap0 (filters VM traffic directly)
sudo ip netns exec fc-vm-1 netleash --allow api.openai.com --interface tap0 --tap

# Or attach to veth0 (filters at the namespace boundary)
sudo ip netns exec fc-vm-1 netleash --allow api.openai.com --interface veth0
```

Use `--tap` only when attaching to a tap device — it swaps the TC egress/ingress directions because the kernel's perspective on tap traffic is inverted relative to the VM's. On a veth, standard directions apply.

If the netns was created with `ip netns add`, you can use `ip netns exec`. For namespaces created by a container runtime without a named entry, use `nsenter --net=/proc/<pid>/ns/net` where `<pid>` is a process running inside the namespace.

### Cgroup attach mode

Attach to any cgroup v2 path directly:

```bash
sudo netleash --allow example.com --cgroup /sys/fs/cgroup/my-scope
```

### Standalone proxy mode (no eBPF)

Run as a standalone HTTPS proxy — no root required, no eBPF. Applications configure their proxy settings to point at it:

```bash
netleash --server --listen 0.0.0.0:8080 \
  --allow api.openai.com \
  --secret-file secrets.conf
```

The proxy enforces the domain allowlist and injects secrets. A Bearer token is auto-generated when listening on non-localhost addresses:

```bash
# Client usage:
HTTPS_PROXY=http://proxy-host:8080 \
SSL_CERT_FILE=/path/to/ca.pem \
curl https://api.openai.com/v1/models
```

### Proxy authentication

Require a Bearer token for proxy access:

```bash
sudo netleash \
  --allow api.openai.com \
  --proxy-token my-secret-token \
  -- python agent.py
```

## CLI reference

```
Usage:
  netleash [options] -- <command> [args...]     (process wrapper mode)
  netleash [options] --cgroup <path>            (attach to cgroup)
  netleash [options] --container <id>           (attach to Docker container)
  netleash [options] --interface <name>         (attach to network interface)
  netleash [options] --server                   (standalone proxy mode)

Options:
  --allow <domain>       Domain to whitelist (repeatable, comma-separated)
  --secret <spec>        Secret in NAME=VALUE:host1,host2 format (repeatable)
  --secret-file <path>   Read secrets from file (use - for stdin)
  --proxy-token <token>  Require Bearer token for proxy authentication
  --server               Run as standalone proxy (no eBPF, no root)
  --listen <addr>        Proxy listen address, server mode (default 127.0.0.1:8080)
  --cgroup <path>        Attach to existing cgroup path
  --container <id>       Attach to Docker container by ID or name
  --interface <name>     Attach TC eBPF to network interface (e.g., tap0, veth0)
  --tap                  Swap TC directions for tap devices (use with --interface)
  --dns <server>         Custom DNS server for proxy resolution (e.g., 8.8.8.8)
  -v                     Verbose output
```

## Go library

Netleash can be used as a Go library for programmatic control:

```go
import "github.com/daytonaio/daytona/libs/netleash/pkg/jail"

exitCode, err := jail.Exec(ctx, jail.Config{
    Domains: []string{"api.openai.com", "*.github.com"},
    Secrets: []jail.Secret{{
        Name:  "OPENAI_API_KEY",
        Value: "sk-real-key",
        Hosts: []string{"api.openai.com"},
    }},
    OnBlocked: func(dstIP string, dstPort uint16, proto string) {
        log.Printf("blocked: %s:%d (%s)", dstIP, dstPort, proto)
    },
}, []string{"python", "agent.py"})
```

## How DNS exfiltration prevention works

A common attack against domain-based firewalls is encoding data in DNS queries — e.g., querying `stolen-data.attacker.com`. Even if the IP is blocked, the DNS query itself reaches an attacker-controlled nameserver and leaks data.

Netleash prevents this by filtering DNS queries in the eBPF egress program. Before any UDP port 53 packet leaves the cgroup (or interface in TC mode), the program:

1. Parses the DNS question section to extract the queried domain name
2. Checks it against the `allowed_domains` and `allowed_wildcards` eBPF maps
3. If the domain isn't allowed, drops the packet and emits a ring buffer event

This happens entirely in the kernel — no userspace DNS component, no race conditions.

## Architecture

```
pkg/
├── firewall/              # eBPF program management, map population, event reading
│   ├── bpf/
│   │   ├── common.h       # Shared eBPF structs, maps, constants (used by both programs)
│   │   ├── firewall.c     # Cgroup eBPF programs (cgroup_skb/egress + ingress)
│   │   └── firewall_tc.c  # TC eBPF programs (tc/egress + ingress for interfaces)
│   ├── firewall.go        # Cgroup + TC eBPF lifecycle, dual-mode setup
│   ├── maps.go            # Uniform map accessor for cgroup and TC modes
│   ├── resolver.go        # Domain → IP resolution for eBPF maps
│   └── events.go          # Ring buffer event reader
├── jail/                  # High-level jailing API (process wrapper mode)
│   └── jail.go            # Exec(), New(), Setup(), Run(), Close()
└── proxy/                 # MITM proxy with secret injection
    ├── proxy.go           # Forward proxy server (CONNECT + HTTP)
    ├── injector.go        # Placeholder → real secret replacement
    ├── certs.go           # Ephemeral CA, per-host cert minting, trust stores
    └── options.go         # Functional options (WithAuthToken, WithLogger)

internal/
└── container/             # Docker-specific operations (cgroup resolve, env inject)

cmd/
└── netleash/              # CLI entry point
```

## Development

```bash
# Generate eBPF Go bindings from C source
make generate

# Build
make build

# Run unit tests
make test-unit

# Run e2e tests (requires root)
make test-e2e
```

## License

[MIT](LICENSE)
