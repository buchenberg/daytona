package jail_test

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/daytonaio/daytona/libs/netleash/pkg/jail"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

// requireRoot fails the test if not running as root.
func requireRoot(t *testing.T) {
	t.Helper()
	if os.Geteuid() != 0 {
		t.Fatal("requires root (CAP_BPF + cgroup access)")
	}
}

// requireLSM skips the test if BPF LSM is not available.
func requireLSM(t *testing.T) {
	t.Helper()
	data, err := os.ReadFile("/sys/kernel/security/lsm")
	if err != nil {
		t.Skipf("cannot read LSM list: %v", err)
	}
	if !strings.Contains(string(data), "bpf") {
		t.Skip("BPF LSM not enabled (need 'bpf' in /sys/kernel/security/lsm)")
	}
}

// requireCurl fails the test if curl is not installed.
func requireCurl(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("curl"); err != nil {
		t.Fatal("requires curl")
	}
}

// --- Validation tests (no root needed) ---

func TestNew_NoDomains(t *testing.T) {
	_, err := jail.New(jail.Config{Logger: quiet})
	if err == nil {
		t.Fatal("expected error for empty domains")
	}
	if !strings.Contains(err.Error(), "at least one") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNew_Valid(t *testing.T) {
	j, err := jail.New(jail.Config{Domains: []string{"example.com"}, Logger: quiet})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	j.Close()
}

// --- E2E tests (require root) ---

func TestExec_OutputCapture(t *testing.T) {
	requireRoot(t)

	var stdout, stderr bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains: []string{"example.com"},
		Stdout:  &stdout,
		Stderr:  &stderr,
		Logger:  quiet,
	}, []string{"echo", "hello from jail"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d (stderr: %s)", exitCode, stderr.String())
	}
	if got := stdout.String(); got != "hello from jail\n" {
		t.Fatalf("expected %q, got %q", "hello from jail\n", got)
	}
}

func TestExec_ExitCodePropagation(t *testing.T) {
	requireRoot(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains: []string{"example.com"},
		Stdout:  &bytes.Buffer{},
		Stderr:  &bytes.Buffer{},
		Logger:  quiet,
	}, []string{"sh", "-c", "exit 42"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 42 {
		t.Fatalf("expected exit code 42, got %d", exitCode)
	}
}

func TestExec_EnvInjection(t *testing.T) {
	requireRoot(t)

	var stdout bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains: []string{"example.com"},
		Env:     []string{"MY_TEST_VAR=jail_value"},
		Stdout:  &stdout,
		Stderr:  &bytes.Buffer{},
		Logger:  quiet,
	}, []string{"sh", "-c", "echo $MY_TEST_VAR"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", exitCode)
	}
	if got := strings.TrimSpace(stdout.String()); got != "jail_value" {
		t.Fatalf("expected %q, got %q", "jail_value", got)
	}
}

func TestExec_AllowedDomain(t *testing.T) {
	requireRoot(t)
	requireCurl(t)

	var stderr bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains: []string{"example.com"},
		Stdout:  &bytes.Buffer{},
		Stderr:  &stderr,
		Logger:  quiet,
	}, []string{"curl", "-sf", "-o", "/dev/null", "http://example.com"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d (stderr: %s)", exitCode, stderr.String())
	}
}

func TestExec_BlockedDomain(t *testing.T) {
	requireRoot(t)
	requireCurl(t)

	var stderr bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains: []string{"example.com"},
		Stdout:  &bytes.Buffer{},
		Stderr:  &stderr,
		Logger:  quiet,
	}, []string{"curl", "-sf", "--max-time", "5", "-o", "/dev/null", "http://httpbin.org"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode == 0 {
		t.Fatal("expected non-zero exit code for blocked domain")
	}
}

func TestExec_OnBlockedCallback(t *testing.T) {
	requireRoot(t)
	requireCurl(t)

	var blocked atomic.Int32
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	jail.Exec(ctx, jail.Config{
		Domains: []string{"example.com"},
		Stdout:  &bytes.Buffer{},
		Stderr:  &bytes.Buffer{},
		Logger:  quiet,
		OnBlocked: func(dstIP string, dstPort uint16, proto string) {
			blocked.Add(1)
		},
	}, []string{"curl", "-sf", "--max-time", "5", "-o", "/dev/null", "http://httpbin.org"})

	if blocked.Load() == 0 {
		t.Fatal("expected OnBlocked to be called at least once")
	}
}

func TestExec_WildcardDomain(t *testing.T) {
	requireRoot(t)
	requireCurl(t)

	var stderr bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains: []string{"*.example.com"},
		Stdout:  &bytes.Buffer{},
		Stderr:  &stderr,
		Logger:  quiet,
	}, []string{"curl", "-sf", "-o", "/dev/null", "http://www.example.com"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected exit code 0 for wildcard match, got %d (stderr: %s)", exitCode, stderr.String())
	}
}

func TestJail_LifecycleNewSetupRunClose(t *testing.T) {
	requireRoot(t)

	var stdout bytes.Buffer
	j, err := jail.New(jail.Config{
		Domains: []string{"example.com"},
		Stdout:  &stdout,
		Stderr:  &bytes.Buffer{},
		Logger:  quiet,
	})
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer j.Close()

	if err := j.Setup(); err != nil {
		t.Fatalf("Setup failed: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	exitCode, err := j.Run(ctx, []string{"echo", "lifecycle test"})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", exitCode)
	}
	if got := strings.TrimSpace(stdout.String()); got != "lifecycle test" {
		t.Fatalf("expected %q, got %q", "lifecycle test", got)
	}
}

func TestJail_RunWithoutSetup(t *testing.T) {
	j, err := jail.New(jail.Config{Domains: []string{"example.com"}, Logger: quiet})
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer j.Close()

	// Run without Setup should panic or error (fw is nil).
	_, err = j.Run(context.Background(), []string{"echo", "test"})
	if err == nil {
		t.Fatal("expected error when calling Run without Setup")
	}
}

func TestExec_NoArgs(t *testing.T) {
	requireRoot(t)

	_, err := jail.Exec(context.Background(), jail.Config{
		Domains: []string{"example.com"},
		Stdout:  &bytes.Buffer{},
		Stderr:  &bytes.Buffer{},
		Logger:  quiet,
	}, nil)
	if err == nil {
		t.Fatal("expected error for nil args")
	}
}

// --- Exec filtering tests (require root + BPF LSM) ---

func TestExec_AllowedExec(t *testing.T) {
	requireRoot(t)
	requireLSM(t)

	var stdout bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains:      []string{"example.com"},
		AllowedExecs: []string{"/usr/bin/echo"},
		Stdout:       &stdout,
		Stderr:       &bytes.Buffer{},
		Logger:       quiet,
	}, []string{"/usr/bin/echo", "exec allowed"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", exitCode)
	}
	if got := strings.TrimSpace(stdout.String()); got != "exec allowed" {
		t.Fatalf("expected %q, got %q", "exec allowed", got)
	}
}

func TestExec_BlockedExec(t *testing.T) {
	requireRoot(t)
	requireLSM(t)

	var stderr bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Allow only /usr/bin/echo, but run /usr/bin/id — should be blocked.
	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains:      []string{"example.com"},
		AllowedExecs: []string{"/usr/bin/echo"},
		Stdout:       &bytes.Buffer{},
		Stderr:       &stderr,
		Logger:       quiet,
	}, []string{"/usr/bin/id"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode == 0 {
		t.Fatal("expected non-zero exit code for blocked exec")
	}
}

func TestExec_BlockedChildExec(t *testing.T) {
	requireRoot(t)
	requireLSM(t)

	var stdout, stderr bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Allow sh and echo, but not id. sh can run, but when it tries to exec id, it should fail.
	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains:      []string{"example.com"},
		AllowedExecs: []string{"/bin/sh", "/usr/bin/echo"},
		Stdout:       &stdout,
		Stderr:       &stderr,
		Logger:       quiet,
	}, []string{"/bin/sh", "-c", "echo before; /usr/bin/id 2>/dev/null || echo id_blocked"})

	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d (stderr: %s)", exitCode, stderr.String())
	}
	output := stdout.String()
	if !strings.Contains(output, "before") {
		t.Fatal("expected 'before' in output")
	}
	if !strings.Contains(output, "id_blocked") {
		t.Fatal("expected 'id_blocked' in output — /usr/bin/id should have been denied")
	}
}

func TestExec_OnExecBlockedCallback(t *testing.T) {
	requireRoot(t)
	requireLSM(t)

	var blocked atomic.Int32
	var blockedPath atomic.Value
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	jail.Exec(ctx, jail.Config{
		Domains:      []string{"example.com"},
		AllowedExecs: []string{"/bin/sh"},
		Stdout:       &bytes.Buffer{},
		Stderr:       &bytes.Buffer{},
		Logger:       quiet,
		OnExecBlocked: func(path string) {
			blocked.Add(1)
			blockedPath.Store(path)
		},
	}, []string{"/bin/sh", "-c", "/usr/bin/id 2>/dev/null; true"})

	if blocked.Load() == 0 {
		t.Fatal("expected OnExecBlocked to be called at least once")
	}
	if p, ok := blockedPath.Load().(string); !ok || !strings.Contains(p, "id") {
		t.Fatalf("expected blocked path to contain 'id', got %q", p)
	}
}

// With EnforceProxy, web traffic is steered through the MITM proxy by the eBPF
// connect4 hook — transparently, so it works whether or not the client honors
// the injected HTTP(S)_PROXY env. A curl that honors the env and a curl that
// bypasses it (--noproxy '*') both reach an allowed domain (the second via
// transparent redirect + splice), while a no-SNI connection (IP literal) that
// the proxy can't map to an allowed host is dropped — enforcement still holds.
func TestExec_EnforceProxy(t *testing.T) {
	requireRoot(t)
	requireCurl(t)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Through the proxy (default env wiring): allowed.
	var stderr bytes.Buffer
	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains:      []string{"example.com"},
		EnforceProxy: true,
		Stdout:       &bytes.Buffer{},
		Stderr:       &stderr,
		Logger:       quiet,
	}, []string{"curl", "-sf", "--max-time", "15", "-o", "/dev/null", "https://example.com"})
	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected exit code 0 through the proxy, got %d (stderr: %s)", exitCode, stderr.String())
	}

	// Bypassing the proxy env: the direct TCP 443 connect() is transparently
	// redirected to the proxy by connect4, which splices it to the allowed host —
	// so it now succeeds too. This is the fix for clients that ignore proxy env
	// vars (Node's global fetch/undici, Deno, gRPC), which previously timed out.
	var stderr2 bytes.Buffer
	exitCode, err = jail.Exec(ctx, jail.Config{
		Domains:      []string{"example.com"},
		EnforceProxy: true,
		Stdout:       &bytes.Buffer{},
		Stderr:       &stderr2,
		Logger:       quiet,
	}, []string{"curl", "-sf", "--noproxy", "*", "--max-time", "15", "-o", "/dev/null", "https://example.com"})
	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected transparently-redirected direct egress to an allowed host to succeed, got %d (stderr: %s)", exitCode, stderr2.String())
	}

	// A direct TLS connection to an IP literal carries no SNI, so the proxy can't
	// map it to an allowed host: it must be dropped (fail closed), proving the
	// redirect doesn't become an open bypass.
	exitCode, err = jail.Exec(ctx, jail.Config{
		Domains:      []string{"example.com"},
		EnforceProxy: true,
		Stdout:       &bytes.Buffer{},
		Stderr:       &bytes.Buffer{},
		Logger:       quiet,
	}, []string{"curl", "-sf", "--noproxy", "*", "--max-time", "5", "-o", "/dev/null", "https://1.1.1.1"})
	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode == 0 {
		t.Fatal("expected a no-SNI (IP-literal) web connection to be dropped under EnforceProxy")
	}
}

// Without EnforceProxy, direct web egress to an allowed domain keeps working —
// the gate must stay off by default.
func TestExec_NoEnforceProxy_DirectAllowed(t *testing.T) {
	requireRoot(t)
	requireCurl(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var stderr bytes.Buffer
	exitCode, err := jail.Exec(ctx, jail.Config{
		Domains: []string{"example.com"},
		Stdout:  &bytes.Buffer{},
		Stderr:  &stderr,
		Logger:  quiet,
	}, []string{"curl", "-sf", "--noproxy", "*", "--max-time", "15", "-o", "/dev/null", "https://example.com"})
	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("expected direct egress to allowed domain to work without enforcement, got %d (stderr: %s)", exitCode, stderr.String())
	}
}
