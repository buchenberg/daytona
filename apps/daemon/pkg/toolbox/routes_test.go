package toolbox

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/daytonaio/daemon/pkg/toolbox/fs"
)

// TestRegisterRootServesBothForms checks that registerRoot exposes a handler at
// both a group's exact path and its trailing-slash form, per method, with no
// redirect in between (a 301 would strip the body from a DELETE).
func TestRegisterRootServesBothForms(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	files := router.Group("/files")
	registerRoot(files, http.MethodGet, fs.ListFiles)
	registerRoot(files, http.MethodDelete, fs.DeleteFile)

	call := func(method, target string) int {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(method, target, nil))
		return rec.Code
	}

	dir := t.TempDir()
	for _, form := range []string{"/files", "/files/"} {
		if code := call(http.MethodGet, form+"?path="+dir); code != http.StatusOK {
			t.Errorf("GET %q = %d, want %d", form, code, http.StatusOK)
		}
	}

	for _, form := range []string{"/files", "/files/"} {
		victim, err := os.CreateTemp(t.TempDir(), "victim")
		if err != nil {
			t.Fatal(err)
		}
		_ = victim.Close()
		if code := call(http.MethodDelete, form+"?path="+victim.Name()); code != http.StatusNoContent {
			t.Errorf("DELETE %q = %d, want %d", form, code, http.StatusNoContent)
		}
	}
}

// TestNewServerReturnsInstance is a construction smoke test.
func TestNewServerReturnsInstance(t *testing.T) {
	svc := NewServer(ServerConfig{
		Logger:    slog.New(slog.NewTextHandler(io.Discard, nil)),
		WorkDir:   t.TempDir(),
		ConfigDir: t.TempDir(),
		SandboxId: "smoke-test",
	})
	if svc == nil {
		t.Fatal("NewServer returned nil")
	}
}
