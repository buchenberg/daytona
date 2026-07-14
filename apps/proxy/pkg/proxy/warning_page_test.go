package proxy

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestServeWarningPage_EscapesXSSPayloadInBody(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/?><ScRiPt>alert(1)</ScRiPt>", nil)
	c.Request.Host = "daytonaproxy01.net"

	serveWarningPage(c, false)

	body := w.Body.String()
	if strings.Contains(body, "<ScRiPt>") || strings.Contains(body, "<script>") {
		t.Fatalf("XSS payload was rendered raw in warning page body:\n%s", body)
	}
	if !strings.Contains(body, "&lt;ScRiPt&gt;alert(1)&lt;/ScRiPt&gt;") {
		t.Fatalf("expected the script tag to be HTML-escaped; body did not contain the escaped form:\n%s", body)
	}
}

func TestServeWarningPage_EscapesHostHeader(t *testing.T) {
	// Host header is technically attacker-controllable on forged requests. Even
	// though browsers won't normally let an attacker forge it through a victim,
	// escape defensively.
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/", nil)
	c.Request.Host = "evil\"<img src=x>.example.com"

	serveWarningPage(c, false)

	body := w.Body.String()
	if strings.Contains(body, "<img src=x>") {
		t.Fatalf("Host header was rendered raw in warning page body:\n%s", body)
	}
}

func TestServeWarningPage_RendersBenignURLReadably(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/dashboard/index.html", nil)
	c.Request.Host = "3000-abc.daytonaproxy01.net"

	serveWarningPage(c, true)

	body := w.Body.String()
	if !strings.Contains(body, "https://3000-abc.daytonaproxy01.net/dashboard/index.html") {
		t.Fatalf("expected benign redirect path to be rendered as readable text; got:\n%s", body)
	}
}

func TestServeWarningPage_SetsCSPAndNosniffHeaders(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/", nil)
	c.Request.Host = "daytonaproxy01.net"

	serveWarningPage(c, false)

	csp := w.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "default-src 'none'") {
		t.Fatalf("expected restrictive CSP on warning page; got %q", csp)
	}
	if got := w.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("expected X-Content-Type-Options: nosniff; got %q", got)
	}
}

func TestHandleAcceptProxyWarning_NavigatesViaMetaRefreshNotHTTPRedirect(t *testing.T) {
	// The consent POST must complete on this origin (200) and hand off to a
	// meta-refresh navigation, so the cross-origin auth redirect for private
	// sandboxes is not subject to the warning page's form-action CSP.
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	target := "https://8000-abc.daytonaproxy01.net/"
	c.Request = httptest.NewRequest("POST", ACCEPT_PREVIEW_PAGE_WARNING_PATH+"?redirect="+url.QueryEscape(target), nil)
	c.Request.Host = "8000-abc.daytonaproxy01.net"

	handleAcceptProxyWarning(c, true)

	if w.Code != 200 {
		t.Fatalf("expected 200 so the form submission completes on this origin; got %d", w.Code)
	}
	if loc := w.Header().Get("Location"); loc != "" {
		t.Fatalf("expected no HTTP redirect (would re-enter form-action chain); got Location %q", loc)
	}
	body := w.Body.String()
	if !strings.Contains(body, `http-equiv="refresh"`) || !strings.Contains(body, target) {
		t.Fatalf("expected a meta refresh to the target URL; got:\n%s", body)
	}
}

func TestHandleAcceptProxyWarning_EscapesRedirectInMetaRefresh(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", ACCEPT_PREVIEW_PAGE_WARNING_PATH+`?redirect="><script>alert(1)</script>`, nil)
	c.Request.Host = "daytonaproxy01.net"

	handleAcceptProxyWarning(c, false)

	body := w.Body.String()
	if strings.Contains(body, "<script>") {
		t.Fatalf("redirect param broke out of the meta refresh attribute:\n%s", body)
	}
}

func TestServeWarningPage_FormActionUrlEncodesPayload(t *testing.T) {
	// The redirectUrl is built via url.QueryEscape; confirm dangerous chars do
	// not reach the action attribute as a literal '"' or '<'.
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/?\"><script>x</script>", nil)
	c.Request.Host = "daytonaproxy01.net"

	serveWarningPage(c, false)

	body := w.Body.String()
	if strings.Contains(body, `action="`) && strings.Contains(body, `"><script>`) {
		t.Fatalf("form action attribute appears to allow attribute breakout:\n%s", body)
	}
}

func TestHandleAcceptProxyWarning_AllowsSameHostAbsoluteRedirect(t *testing.T) {
	// This is exactly what serveWarningPage produces: an absolute URL on the
	// same host the request arrived on. It must be honored, not downgraded.
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(
		"POST",
		ACCEPT_PREVIEW_PAGE_WARNING_PATH+"?redirect=https%3A%2F%2F3000-abc.daytonaproxy01.net%2Fdashboard%2Findex.html",
		nil,
	)
	c.Request.Host = "3000-abc.daytonaproxy01.net"

	handleAcceptProxyWarning(c, true)

	// The consent POST completes on this origin (200) and hands off via meta
	// refresh, so the same-host target must appear in the page, not a Location header.
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 so the form submission completes on this origin; got %d", w.Code)
	}
	if loc := w.Header().Get("Location"); loc != "" {
		t.Fatalf("expected no HTTP redirect; got Location %q", loc)
	}
	if body := w.Body.String(); !strings.Contains(body, "https://3000-abc.daytonaproxy01.net/dashboard/index.html") {
		t.Fatalf("expected same-host redirect to be honored in the meta refresh; got:\n%s", body)
	}
}

func TestHandleAcceptProxyWarning_AllowsSameHostWithPortAndQuery(t *testing.T) {
	// Dev http://localhost:port and host:port must pass: serveWarningPage and the
	// validator both read the full raw Request.Host (incl. port).
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(
		"POST",
		ACCEPT_PREVIEW_PAGE_WARNING_PATH+"?redirect=http%3A%2F%2Flocalhost%3A8080%2Fdashboard%3Ftab%3Dlogs",
		nil,
	)
	c.Request.Host = "localhost:8080"

	handleAcceptProxyWarning(c, false)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 so the form submission completes on this origin; got %d", w.Code)
	}
	if loc := w.Header().Get("Location"); loc != "" {
		t.Fatalf("expected no HTTP redirect; got Location %q", loc)
	}
	if body := w.Body.String(); !strings.Contains(body, "http://localhost:8080/dashboard?tab=logs") {
		t.Fatalf("expected same-host:port redirect to be honored in the meta refresh; got:\n%s", body)
	}
}

func TestHandleAcceptProxyWarning_AllowsSameHostWithForwardedHostHeader(t *testing.T) {
	// Custom Preview Proxy: the consent POST reaches Daytona on a daytona proxy
	// host; X-Forwarded-Host is never read for host resolution, so the same-host
	// redirect must still be honored.
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(
		"POST",
		ACCEPT_PREVIEW_PAGE_WARNING_PATH+"?redirect=https%3A%2F%2F3000-abc.daytonaproxy01.net%2Fapp",
		nil,
	)
	c.Request.Host = "3000-abc.daytonaproxy01.net"
	c.Request.Header.Set("X-Forwarded-Host", "preview.yourcompany.com")

	handleAcceptProxyWarning(c, true)

	body := w.Body.String()
	if !strings.Contains(body, "https://3000-abc.daytonaproxy01.net/app") {
		t.Fatalf("expected redirect to be unaffected by X-Forwarded-Host; got:\n%s", body)
	}
	if strings.Contains(body, "preview.yourcompany.com") {
		t.Fatalf("X-Forwarded-Host leaked into the redirect target:\n%s", body)
	}
}

func TestHandleAcceptProxyWarning_AllowsSafeRelativePath(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", ACCEPT_PREVIEW_PAGE_WARNING_PATH+"?redirect=%2Fdashboard", nil)
	c.Request.Host = "3000-abc.daytonaproxy01.net"

	handleAcceptProxyWarning(c, true)

	if body := w.Body.String(); !strings.Contains(body, `content="0; url=/dashboard"`) {
		t.Fatalf("expected safe relative path to be honored in the meta refresh; got:\n%s", body)
	}
}

func TestHandleAcceptProxyWarning_RejectsOpenRedirectTargets(t *testing.T) {
	cases := []struct {
		name     string
		redirect string
	}{
		{"absolute-cross-host", "https://evil.com/phish"},
		{"protocol-relative", "//evil.com/x"},
		{"backslash-slash", "/\\evil.com"},
		{"double-backslash", "\\\\evil.com"},
		{"userinfo-confusion", "https://3000-abc.daytonaproxy01.net@evil.com"},
		{"subdomain-lookalike", "https://host.evil.com"},
		{"javascript-scheme", "javascript:alert(1)"},
		{"data-scheme", "data:text/html,<script>alert(1)</script>"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("POST", ACCEPT_PREVIEW_PAGE_WARNING_PATH, nil)
			q := c.Request.URL.Query()
			q.Set("redirect", tc.redirect)
			c.Request.URL.RawQuery = q.Encode()
			c.Request.Host = "3000-abc.daytonaproxy01.net"

			handleAcceptProxyWarning(c, true)

			// The unsafe target must be dropped: the meta refresh points at "/"
			// and the rejected value never appears in the page.
			body := w.Body.String()
			if !strings.Contains(body, `content="0; url=/"`) {
				t.Fatalf("expected unsafe redirect %q to fall back to \"/\"; got:\n%s", tc.redirect, body)
			}
			if strings.Contains(body, tc.redirect) {
				t.Fatalf("rejected redirect %q leaked into the page:\n%s", tc.redirect, body)
			}
		})
	}
}

func TestHandleAcceptProxyWarning_EmptyRedirectFallsBackToRoot(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", ACCEPT_PREVIEW_PAGE_WARNING_PATH, nil)
	c.Request.Host = "3000-abc.daytonaproxy01.net"

	handleAcceptProxyWarning(c, true)

	if body := w.Body.String(); !strings.Contains(body, `content="0; url=/"`) {
		t.Fatalf("expected empty redirect to fall back to \"/\"; got:\n%s", body)
	}
}
