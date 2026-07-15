package proxy

import (
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gin-gonic/gin"
)

func newBuildLogsContext(clientRawQuery string) *gin.Context {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/snapshots/snap-1/build-logs?"+clientRawQuery, nil)
	return c
}

// TestApplyBuildLogsQuery is the regression test for the cross-tenant build-log
// read via HTTP parameter pollution: a client-supplied snapshotRef must never
// override the server-resolved ref, and no client query must survive to the
// runner.
func TestApplyBuildLogsQuery(t *testing.T) {
	const serverRef = "daytona-server-ref:daytona"

	tests := []struct {
		name           string
		clientRawQuery string
		wantFollow     string
	}{
		{"no client params", "", ""},
		{"client sends follow only", "follow=true", "true"},
		{"client spoofs snapshotRef", "snapshotRef=evil", ""},
		{"client spoofs snapshotRef and follow", "snapshotRef=evil&follow=true", "true"},
		{"client injects extra params", "snapshotRef=evil&follow=true&injected=1&foo=bar", "true"},
		{"follow not literal true is dropped", "follow=1", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ctx := newBuildLogsContext(tc.clientRawQuery)
			target := &url.URL{Scheme: "http", Host: "runner.local", Path: "/snapshots/logs"}

			applyBuildLogsQuery(ctx, target, serverRef)

			q := target.Query()

			// The runner reads the FIRST value of snapshotRef; it must be the server ref.
			if got := q.Get("snapshotRef"); got != serverRef {
				t.Fatalf("snapshotRef = %q, want server ref %q", got, serverRef)
			}
			// Exactly one snapshotRef value — no smuggled duplicate.
			if n := len(q["snapshotRef"]); n != 1 {
				t.Fatalf("snapshotRef has %d values %v, want exactly 1", n, q["snapshotRef"])
			}
			// follow is forwarded only when the client set the literal "true".
			if got := q.Get("follow"); got != tc.wantFollow {
				t.Fatalf("follow = %q, want %q", got, tc.wantFollow)
			}
			// No non-allowlisted client param leaks into the forwarded query.
			if got := q.Get("injected"); got != "" {
				t.Fatalf("non-allowlisted param leaked to runner query: injected=%q", got)
			}
			// The inbound client query must be cleared so the shared reverse-proxy
			// Director cannot re-append it (and its spoofed snapshotRef) downstream.
			if ctx.Request.URL.RawQuery != "" {
				t.Fatalf("client RawQuery not cleared: %q", ctx.Request.URL.RawQuery)
			}
		})
	}
}
