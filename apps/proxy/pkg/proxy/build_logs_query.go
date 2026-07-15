package proxy

import (
	"net/url"

	"github.com/gin-gonic/gin"
)

// applyBuildLogsQuery sets the query string forwarded to the runner's
// build-logs endpoint from server-controlled values only.
//
// The proxy authorizes the sandbox/snapshot in the request PATH (via the
// caller's bearer token) and then must serve exactly that entity's build log.
// The runner keys the log solely on the snapshotRef query param and reads its
// first value, so the client must never be able to influence it. We build a
// fresh allowlist (snapshotRef, plus the caller's follow flag) instead of
// appending to the incoming client query, and clear ctx.Request.URL.RawQuery:
// the shared reverse-proxy Director re-appends the inbound RawQuery to every
// forwarded request, so a client-supplied ?snapshotRef=... would otherwise
// reach the runner and, being read first, override the server ref
// (HTTP parameter pollution -> cross-tenant build-log read).
func applyBuildLogsQuery(ctx *gin.Context, target *url.URL, snapshotRef string) {
	forwarded := url.Values{}
	if ctx.Query("follow") == "true" {
		forwarded.Set("follow", "true")
	}
	forwarded.Set("snapshotRef", snapshotRef)
	target.RawQuery = forwarded.Encode()

	// Drop the client's query so the Director's re-append cannot smuggle a
	// duplicate snapshotRef (or any other param) through to the trusted runner.
	ctx.Request.URL.RawQuery = ""
}
