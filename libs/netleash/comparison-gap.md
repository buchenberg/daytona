# Comparison: ebpf-firewall vs GAP vs httpjail

## What each project is

| | **ebpf-firewall** | **GAP** | **httpjail** |
|---|---|---|---|
| Language | Go + eBPF C | Rust + JS (Boa) | Rust + JS (V8) |
| Approach | Kernel-level egress filter (eBPF cgroup hooks) + optional MITM proxy | Application-level CONNECT proxy with plugin system | Transparent proxy via nftables + network namespaces |
| Primary goal | Default-deny egress firewall with JIT secret injection | Credential proxy for AI agents | HTTP request filtering / jailing for untrusted processes |
| Repo | [gdraganic/ebpf-jail](https://github.com/gdraganic/ebpf-jail) | [mikekelly/gap](https://github.com/mikekelly/gap) | [coder/httpjail](https://github.com/coder/httpjail) |
| Version | Pre-release | 0.6.1 (14+ releases) | 0.6.1 |
| License | — | MIT | CC0-1.0 |

They solve overlapping but different problems. GAP is a credential management proxy -- agents route traffic through it to get credentials injected. httpjail is a network isolator -- it jails processes and filters HTTP requests via rules. ebpf-firewall is a kernel-level egress firewall that also does secret injection.

---

## Enforcement mechanism comparison

This is the most architecturally significant difference between the three projects.

| | **ebpf-firewall** | **GAP** | **httpjail** |
|---|---|---|---|
| **Mechanism** | eBPF cgroup_skb hooks | HTTPS proxy (cooperative) | nftables + network namespaces (Linux), env vars only (macOS) |
| **Kernel involvement** | Yes -- BPF programs in kernel | None | Yes -- nftables + netns |
| **Filtering level** | IP/packet level | HTTP request level (proxy) | HTTP request level (proxy) |
| **Can be bypassed from userspace?** | No -- kernel-enforced | Yes -- agent ignores `HTTPS_PROXY` | No on Linux (all traffic redirected via nftables), Yes on macOS (weak mode) |
| **Non-HTTP traffic** | Allowed/blocked at IP level (any protocol) | Not handled -- only HTTP/HTTPS | Blocked entirely (nftables drops non-80/443) |
| **Root required** | Yes (eBPF + cgroup) | No | Yes on Linux (netns), No on macOS |
| **DNS control** | Intercepts DNS responses in eBPF, populates allowed_ips dynamically | No DNS handling | Dummy DNS server returns `6.6.6.6` for all queries; actual resolution at proxy level |
| **DNS exfiltration** | Not specifically addressed (DNS allowed for resolution) | Not addressed | Prevented -- dummy DNS server blocks data exfiltration via DNS queries |

**Key insight**: ebpf-firewall and httpjail both provide hard enforcement boundaries, but at different layers. ebpf-firewall operates at the IP/packet level (can filter any protocol), while httpjail operates at the HTTP level (only HTTP/HTTPS, but with richer request-level visibility). GAP has no enforcement boundary at all -- it's purely cooperative.

---

## Feature comparison

| Feature | **ebpf-firewall** | **GAP** | **httpjail** |
|---|---|---|---|
| **Egress filtering** | Kernel-level (eBPF cgroup_skb) | Proxy-level only (cooperative) | nftables + netns (Linux), env vars (macOS) |
| **Domain allowlist** | DNS interception in eBPF + proxy enforcement (defense in depth) | Plugin host-pattern matching at proxy level | JS/shell rule evaluation per HTTP request |
| **Wildcard domains** | Yes (`*.github.com`) in eBPF maps | Yes (single-level only, `*.example.com`) | No built-in support; user writes JS regex |
| **Secret injection** | Placeholder-based, host-scoped, in headers + body | JS plugin transforms with encrypted credential store | None |
| **Plugin system** | None -- declarative config only | Full sandboxed JS runtime (Boa) with crypto utilities | JS rule expressions (V8), shell scripts, line processors |
| **Rule flexibility** | Static allowlist (domains) | Plugin transforms (arbitrary JS logic) | Full JS expressions with access to method, host, path, scheme |
| **Credential storage** | Secrets passed as CLI flags | Encrypted database (write-only API, macOS Keychain on macOS) | N/A |
| **Token/auth for agents** | IP-based ACL (container IP restriction) | Bearer tokens with scope restrictions (host, path, method, port) | N/A (process-level isolation via namespace) |
| **Protocol support** | Any protocol (IP-level filtering) + HTTP/1.1 HTTPS (proxy) | HTTP/1.1, HTTP/2 (ALPN negotiation) | HTTP/1.1, HTTPS (CONNECT + transparent TLS) |
| **TLS** | Ephemeral ECDSA CA, per-host leaf certs | Ephemeral CA, per-host certs, TLS 1.3 with post-quantum KX | Persistent CA in `~/.config/httpjail/`, per-host certs with LRU cache |
| **Runtime trust injection** | OpenSSL, Node.js, Python, curl, JVM (6 env vars + keytool truststore) | CA cert install only | 6 env vars (SSL_CERT_FILE, CURL_CA_BUNDLE, GIT_SSL_CAINFO, REQUESTS_CA_BUNDLE, NODE_EXTRA_CA_CERTS, DENO_CERT) + macOS keychain option |
| **Container support** | Docker SDK (cgroup resolve, env injection, attach to existing) | Docker image available, no container-aware features | Docker run mode only (creates new containers, cannot attach to existing) |
| **Cross-platform** | Linux only (eBPF requirement) | macOS + Linux | Linux (strong) + macOS (weak/env-var only) |
| **Multi-tenancy** | Container IP-based proxy isolation | Token scoping (host/path/method/port) | Process-level via separate namespaces |
| **Audit/observability** | slog structured logging, eBPF ring buffer events | Activity log DB, SSE streaming, credential scrubbing | Request logging to stdout |
| **Management API** | None (CLI flags only) | REST API (26+ endpoints) for plugins, tokens, credentials | None (CLI flags only) |
| **IPv6** | Not filtered (security gap) | Supported | Not specifically addressed |
| **Deployment** | Static Go binary, requires Linux + root | macOS DMG, Linux systemd, Docker, install script | Cargo install, requires Linux + root for strong mode |
| **Request body limiting** | No | No | Yes (`max_tx_bytes` per-request byte limit) |

---

## Modes of operation

| Mode | **ebpf-firewall** | **GAP** | **httpjail** |
|---|---|---|---|
| Process wrapper (`-- cmd`) | Yes | No | Yes (primary mode) |
| Cgroup attach | Yes (`--cgroup`) | No | No |
| Container attach (existing) | Yes (`--container`) | No | No |
| Container run (new) | No | No | Yes (`--docker-run`) |
| Standalone proxy server | No | Yes (only mode) | Yes (`--server`) |
| Dry-run / test mode | No | No | Yes (`--test`) |
| Cleanup mode | No | No | Yes (`--cleanup` for orphaned jails) |

**Notable**: Only ebpf-firewall can attach to an already-running container. httpjail can only jail new containers via `docker run`. GAP doesn't interact with containers at all.

---

## Production readiness

| Dimension | **ebpf-firewall** | **GAP** | **httpjail** |
|---|---|---|---|
| **Tests** | 62 test functions across 5 files | 300+ Rust tests, Go integration tests, Bash smoke tests | Inline unit tests + 13 integration test files (~2,755 lines) + benchmarks |
| **CI** | GitHub Actions (build, vet, test-unit, codecov) | Build workflow (manual dispatch) | GitHub Actions (macOS + Linux, clippy, fmt, udeps, nextest) |
| **Error handling** | Consistent `fmt.Errorf` wrapping | `thiserror` enum with 12+ variants | Rust `anyhow` + typed errors |
| **Documentation** | CLI `--help` + this comparison doc | README, agent orientation guide, design docs, transparent proxy proposal | README with examples, `--help` |
| **Packaging** | Static binary + devcontainer | DMG, systemd, Docker, install script | crates.io, cargo install |
| **Release history** | 7 commits | 14+ releases | 235 commits, v0.6.1 |
| **Contributors** | Solo | Solo | Solo (Coder org) |

---

## Where ebpf-firewall is stronger

### vs both GAP and httpjail

1. **Packet-level filtering.** eBPF cgroup_skb operates at the IP/packet level. It can filter any protocol (TCP, UDP, ICMP) -- not just HTTP. httpjail explicitly drops non-HTTP traffic but can't selectively allow non-HTTP protocols. GAP doesn't see non-HTTP traffic at all.

2. **Defense in depth.** Both the eBPF kernel filter and the proxy enforce the domain allowlist independently. Even if the proxy has a bug, the kernel filter still blocks unauthorized IPs.

3. **Attach to existing containers.** The only project that can attach to an already-running container via its cgroup, inject environment variables, and configure proxy trust -- zero config inside the container.

4. **Zero-overhead allowed traffic.** Once a DNS response populates `allowed_ips`, all subsequent packets to that IP flow at wire speed -- zero userspace involvement. Both GAP and httpjail proxy every byte through userspace.

5. **Zero-infrastructure.** A single static binary, no database, no management API, no persistent state, no external dependencies at runtime.

### vs GAP specifically

6. **Kernel-level enforcement.** Cannot be bypassed from userspace. GAP relies entirely on the agent cooperating by routing traffic through the proxy.

7. **DNS-based dynamic allowlisting.** Domains are resolved to IPs in real time via DNS interception in eBPF. GAP only sees hostnames in CONNECT requests.

### vs httpjail specifically

8. **Cgroup-based isolation.** Attaches to existing cgroups without requiring a network namespace. httpjail creates a new network namespace per jail, which has higher overhead and doesn't support attaching to already-running processes.

9. **Declarative domain allowlists.** Simple `--allow-domain` flags vs writing JavaScript expressions. Lower barrier to use for the common case.

---

## Where GAP is stronger

### vs both ebpf-firewall and httpjail

1. **Plugin system.** Sandboxed JS transforms with crypto primitives (HMAC, Ed25519, ECDSA, RSA, RFC 9421 HTTP signatures). Neither ebpf-firewall nor httpjail can do credential transformation logic.

2. **Credential management.** Encrypted write-only database with macOS Keychain integration. Secrets are never CLI args (no `/proc/<pid>/cmdline` leak).

3. **Token scoping.** Fine-grained per-token access control: host, path, method, port. Multi-tenant by design.

4. **Management API.** REST API with 26+ endpoints for managing plugins, tokens, credentials, and activity logs. The only project with programmatic management.

5. **Observability.** Queryable activity logs with automatic credential scrubbing, SSE real-time streaming.

6. **HTTP/2 support.** ALPN negotiation on both client and upstream sides. ebpf-firewall and httpjail only support HTTP/1.1.

7. **Namespace/scope isolation.** Multi-tenant resource isolation via namespaces threaded through the entire pipeline.

### vs ebpf-firewall specifically

8. **Cross-platform.** macOS + Linux. ebpf-firewall is Linux-only.

9. **No root required.** Runs as a regular user process (though this is because it doesn't enforce anything at the kernel level).

---

## Where httpjail is stronger

### vs both ebpf-firewall and GAP

1. **Request-level rule granularity.** Rules have access to method, host, path, scheme, and requester IP. Can express policies like "allow GET to api.github.com/repos/* but deny POST" in a single JS expression. ebpf-firewall only filters by domain/IP. GAP only filters by plugin host matching.

2. **DNS exfiltration protection.** Dummy DNS server returns `6.6.6.6` for all queries from jailed processes. Actual resolution happens at the proxy level. Prevents data exfiltration via DNS TXT records, subdomain encoding, etc. Neither ebpf-firewall nor GAP specifically address DNS exfiltration.

3. **Cross-platform (with degradation).** Works on macOS (weak mode, env-var proxy) and Linux (strong mode, nftables + netns). ebpf-firewall is Linux-only. GAP is cross-platform but always weak.

4. **Request body size limiting.** `max_tx_bytes` allows rules to cap how much data a request can transmit. Neither ebpf-firewall nor GAP have this.

5. **Rule reloading.** `--js-file` watches for file changes and hot-reloads rules without restarting. Neither of the others support runtime config changes.

6. **Orphan cleanup.** `--cleanup` mode scans for and removes stale jails, namespaces, and Docker networks. Handles crashes gracefully.

7. **Docker run integration.** Creates isolated Docker networks with nftables routing for new containers. ebpf-firewall attaches to existing containers (different use case). GAP has no Docker integration.

### vs GAP specifically

8. **Kernel-level enforcement on Linux.** nftables + network namespaces provide a hard enforcement boundary. Traffic cannot bypass the proxy.

### vs ebpf-firewall specifically

9. **No eBPF dependency.** Uses nftables + netns, which are available on any modern Linux kernel without requiring BPF JIT, BTF, or specific kernel config. Lower kernel version requirements.

10. **Transparent TLS interception.** Extracts SNI from ClientHello for transparent HTTPS interception via nftables DNAT. ebpf-firewall requires explicit proxy configuration.

---

## Key gaps in all three

| Gap | ebpf-firewall | GAP | httpjail |
|---|---|---|---|
| IPv6 | Unfiltered -- security hole on dual-stack | Supported | Not specifically addressed |
| Response scrubbing | Secrets could echo back in API responses | Same (only audit logs scrubbed) | N/A (no secrets) |
| Rate limiting | None | None | None (but has `max_tx_bytes`) |
| Proxy memory | Buffers entire response bodies | Similar | Similar |
| HTTP/2 | Not supported in proxy | Supported | Not supported |
| QUIC/HTTP3 | Not specifically handled | Not supported | Explicitly blocked (nftables drops UDP 443) |
| Windows | N/A (eBPF) | N/A | Planned but not implemented |

---

## Isolation architecture deep dive

### How each project isolates a process

**ebpf-firewall:**

```
Process → cgroup → eBPF cgroup_skb/egress (kernel) → allowed? → wire
                 → eBPF cgroup_skb/ingress (kernel) → DNS response? → populate allowed_ips
                 → [optional] MITM proxy → secret injection → upstream
```

- Isolation boundary: **kernel cgroup + BPF programs**
- BPF maps (allowed_ips, allowed_domains) are per-cgroup instance
- A compromised process cannot modify BPF maps or detach BPF programs
- Non-HTTP traffic is filtered at IP level without proxy involvement

**GAP:**

```
Process → HTTPS_PROXY env var → GAP proxy → token auth → plugin match → transform → upstream
Process → direct HTTP (bypasses proxy) → unfiltered internet
```

- Isolation boundary: **none** (cooperative)
- Token scoping provides logical multi-tenancy
- A compromised process can simply ignore the proxy

**httpjail (Linux strong mode):**

```
Process → network namespace → nftables DNAT → proxy on host veth
       → veth pair (10.99.X.2 ↔ 10.99.X.1)
       → DNS → dummy server (6.6.6.6)
       → HTTP/HTTPS → rule evaluation → allow/block
       → non-HTTP → nftables DROP
```

- Isolation boundary: **network namespace + nftables**
- Per-jail /30 subnet, separate nftables rules
- A compromised process cannot escape the network namespace without privilege escalation
- Non-HTTP traffic is dropped, not filtered

### Comparison at 200 containers per host

| Resource | **ebpf-firewall** | **GAP** | **httpjail** |
|---|---|---|---|
| Processes | **200** (one per container) | **1** (shared proxy) | **200** (one per jail) |
| Runtime memory | 200 × ~15MB = **~3GB** | ~20MB total | 200 × ~20MB = **~4GB** (V8 is heavier than Go runtime) |
| Kernel resources | 400 BPF programs + 800 maps | 0 | 200 network namespaces + 200 veth pairs + 200 nftables rulesets |
| Network namespaces | 0 (uses existing cgroups) | 0 | 200 |
| Isolation guarantee | Kernel-enforced per cgroup | Token-scoped, cooperative | Kernel-enforced per namespace |
| Cross-container leakage | Impossible (separate BPF maps) | Possible (misconfigured tokens) | Impossible (separate namespaces) |
| Single-process failure | Loses 1 container | Loses all 200 | Loses 1 jail |
| Credential compromise | 1 container's secrets | All 200 containers' secrets | N/A (no secrets) |

**Scaling bottleneck**: Both ebpf-firewall and httpjail have per-container process overhead. ebpf-firewall could solve this with a daemon mode (one process managing multiple cgroups). httpjail's architecture is more tightly coupled to one-namespace-per-jail. GAP scales trivially but has no real isolation.

---

## Concept evaluation: is there a major flaw in ebpf-firewall's approach?

### Strengths of the eBPF cgroup approach

The core concept is sound and architecturally the strongest of the three:

1. **Deepest enforcement layer.** eBPF cgroup_skb operates below userspace, below the network namespace layer, at the packet scheduling level. This is the hardest boundary to bypass without kernel exploitation.

2. **Protocol-agnostic filtering.** Unlike httpjail (HTTP-only) and GAP (HTTP-only), eBPF can filter any IP traffic. This matters for non-HTTP protocols (database connections, gRPC over raw TCP, SSH, etc.).

3. **Attach-to-existing.** The only approach that can secure an already-running container without restarting it or creating a new network namespace.

4. **Zero data-path overhead for non-proxied traffic.** Allowed packets flow at kernel speed. httpjail proxies everything. GAP proxies everything.

### Identified weaknesses (not fundamental flaws)

1. **IPv6 bypass.** This is the most critical gap. On dual-stack systems, IPv6 traffic is unfiltered. This is a real security hole but straightforward to fix -- extend the eBPF programs to handle IPv6 headers.

2. **DNS exfiltration.** The eBPF ingress program parses DNS A records to populate allowed_ips, but DNS queries themselves are always allowed (UDP port 53). A malicious process could exfiltrate data via DNS subdomain encoding or TXT queries. httpjail's dummy DNS server approach is a good solution to this. ebpf-firewall could address this by routing DNS through a controlled resolver.

3. **Process-per-container scaling.** At high density (200+ containers per host), the per-container Go process overhead is significant (~3GB RAM). This is an architectural choice, not a fundamental flaw -- a daemon mode managing multiple cgroups would eliminate it while preserving the per-cgroup isolation properties.

4. **Secrets in CLI args.** Secrets passed as CLI flags are visible in `/proc/<pid>/cmdline`. GAP's encrypted database approach is more secure. This could be addressed with environment variable injection or a secrets file.

5. **No request-level granularity.** eBPF operates at the IP/packet level, so it can only allow/deny by destination IP. It cannot distinguish between `GET /public` and `POST /admin` to the same host. httpjail's rule system and GAP's plugin system both offer this. For ebpf-firewall this is by design -- the proxy layer could add request-level rules if needed.

### Is the concept fundamentally flawed?

**No.** The eBPF cgroup approach is the strongest isolation mechanism of the three. The weaknesses are all fixable without architectural changes:

- IPv6: extend BPF programs (same pattern, different header offsets)
- DNS exfiltration: add a controlled DNS resolver or BPF-based DNS filtering
- Scaling: daemon mode (one process, multiple cgroups)
- Secrets in CLI: environment variables or secrets file

The combination of kernel-level packet filtering + optional MITM proxy is architecturally sound -- it provides both hard network isolation (which neither GAP nor httpjail achieve at the same depth) and application-level secret injection (which httpjail doesn't attempt at all).

The main strategic risk is **scope**: ebpf-firewall tries to solve both network isolation AND secret injection, while GAP focuses purely on credential management and httpjail focuses purely on request filtering. This dual scope means more surface area to get right, but also means ebpf-firewall is the only project that could serve as a complete sandbox solution.

---

## Summary

| Dimension | **ebpf-firewall** | **GAP** | **httpjail** |
|---|---|---|---|
| **Best at** | Kernel-hard network isolation + secret injection in one tool | Credential management, plugin extensibility, multi-tenant API | HTTP-level request filtering, cross-platform, DNS exfiltration prevention |
| **Enforcement** | Strongest (kernel BPF) | Weakest (cooperative proxy) | Strong on Linux (nftables+netns), weak on macOS |
| **Secret injection** | Yes (placeholder replacement) | Yes (JS plugin transforms) | No |
| **Rule granularity** | Domain/IP only | Host pattern + plugin logic | Full HTTP request (method, path, host, scheme) |
| **Container story** | Attach to existing (unique capability) | None | Docker run only (new containers) |
| **Maturity** | Early (7 commits, 62 tests, CI) | Most mature (14+ releases, 300+ tests, management API) | Active (235 commits, extensive tests, CI) |

The three projects are more complementary than competitive. ebpf-firewall provides the hardest network boundary. GAP provides the richest credential management. httpjail provides the most flexible request-level filtering. A production deployment could reasonably combine ebpf-firewall's kernel-level isolation with GAP's credential management or httpjail's request-level rules -- they operate at different layers of the stack.
