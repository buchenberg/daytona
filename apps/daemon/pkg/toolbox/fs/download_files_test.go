// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package fs

import (
	"bytes"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newTestContext(method string) *gin.Context {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(method, "/files/bulk-download", nil)
	return ctx
}

func TestOpenDownloadFile(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("rejects empty paths as validation errors", func(t *testing.T) {
		ctx := newTestContext(http.MethodPost)

		f, _, errorResponse := openDownloadFile(ctx, "")
		if f != nil {
			f.Close()
			t.Fatal("expected no file handle for empty path")
		}

		if errorResponse == nil {
			t.Fatal("expected an error response")
		}

		if errorResponse.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected status %d, got %d", http.StatusBadRequest, errorResponse.StatusCode)
		}

		if errorResponse.Code != "INVALID_FILE_PATH" {
			t.Fatalf("expected INVALID_FILE_PATH, got %s", errorResponse.Code)
		}

		if errorResponse.Method != http.MethodPost {
			t.Fatalf("expected method %s, got %s", http.MethodPost, errorResponse.Method)
		}
	})

	t.Run("rejects directories as invalid file paths", func(t *testing.T) {
		ctx := newTestContext(http.MethodPost)
		tempDir := t.TempDir()

		f, _, errorResponse := openDownloadFile(ctx, tempDir)
		if f != nil {
			f.Close()
			t.Fatal("expected no file handle for directory")
		}

		if errorResponse == nil {
			t.Fatal("expected an error response")
		}

		if errorResponse.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected status %d, got %d", http.StatusBadRequest, errorResponse.StatusCode)
		}

		if errorResponse.Code != "INVALID_FILE_PATH" {
			t.Fatalf("expected INVALID_FILE_PATH, got %s", errorResponse.Code)
		}

		if !strings.Contains(errorResponse.Message, "directory") {
			t.Fatalf("expected directory message, got %q", errorResponse.Message)
		}

		if errorResponse.Path != tempDir {
			t.Fatalf("expected path %q, got %q", tempDir, errorResponse.Path)
		}
	})

	t.Run("returns file handle and info for a regular file", func(t *testing.T) {
		ctx := newTestContext(http.MethodPost)
		tempDir := t.TempDir()
		path := filepath.Join(tempDir, "regular.txt")
		const payload = "abcdef"
		if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
			t.Fatalf("write file: %v", err)
		}

		f, info, errorResponse := openDownloadFile(ctx, path)
		if errorResponse != nil {
			t.Fatalf("expected no error, got %+v", errorResponse)
		}
		if f == nil {
			t.Fatal("expected an open file handle")
		}
		defer f.Close()

		if info == nil {
			t.Fatal("expected file info")
		}
		if got := info.Size(); got != int64(len(payload)) {
			t.Fatalf("expected size %d, got %d", len(payload), got)
		}
	})
}

func TestClassifyPathStatError(t *testing.T) {
	t.Run("maps missing files to not found", func(t *testing.T) {
		statusCode, errorCode, message := classifyPathStatError("/tmp/missing.txt", os.ErrNotExist)

		if statusCode != http.StatusNotFound {
			t.Fatalf("expected status %d, got %d", http.StatusNotFound, statusCode)
		}

		if errorCode != "FILE_NOT_FOUND" {
			t.Fatalf("expected FILE_NOT_FOUND, got %s", errorCode)
		}

		if !strings.Contains(message, "file not found") {
			t.Fatalf("expected not found message, got %q", message)
		}
	})

	t.Run("maps permission failures to access denied", func(t *testing.T) {
		statusCode, errorCode, message := classifyPathStatError("/tmp/locked.txt", os.ErrPermission)

		if statusCode != http.StatusForbidden {
			t.Fatalf("expected status %d, got %d", http.StatusForbidden, statusCode)
		}

		if errorCode != "FILE_ACCESS_DENIED" {
			t.Fatalf("expected FILE_ACCESS_DENIED, got %s", errorCode)
		}

		if !strings.Contains(message, "permission denied") {
			t.Fatalf("expected permission message, got %q", message)
		}
	})
}

func TestLatin1QuotedFilename(t *testing.T) {
	assertLatin1QuotedFilename(t, "report.pdf", "report.pdf")
	assertLatin1QuotedFilename(t, "nul\x00cr\rlf\n.txt", "nul_cr_lf_.txt")
	assertLatin1QuotedFilename(t, "smørrebrød.txt", "sm\xf8rrebr\xf8d.txt")
	assertLatin1QuotedFilename(t, "emoji-🙂.txt", "emoji-_.txt")
	assertLatin1QuotedFilename(t, "unit\x1f-del\x7f.txt", "unit_-del_.txt")
	assertLatin1QuotedFilename(t, `a"b\c.txt`, `a\"b\\c.txt`)
	assertLatin1QuotedFilename(t, "", "")
}

func assertLatin1QuotedFilename(t *testing.T, input string, want string) {
	t.Helper()
	if got := latin1QuotedFilename(input); got != want {
		t.Fatalf("latin1QuotedFilename(%q) = %q, want %q", input, got, want)
	}
}

func TestRFC5987FilenameStarEncoding(t *testing.T) {
	assertRFC5987Encoding(t, "plain ASCII filename", "report-2026.txt", "report-2026.txt")
	assertRFC5987Encoding(t, "NUL byte is percent encoded", "nul\x00byte.txt", "nul%00byte.txt")
	assertRFC5987Encoding(t, "Latin-1 text is encoded as UTF-8", "smørrebrød", "sm%C3%B8rrebr%C3%B8d")
	assertRFC5987Encoding(t, "non-BMP runes use their UTF-8 bytes", "emoji-🙂", "emoji-%F0%9F%99%82")
	assertRFC5987Encoding(t, "spaces and parentheses are escaped", "draft copy (final).md", "draft%20copy%20%28final%29.md")
	assertRFC5987Encoding(t, "attr-char punctuation stays literal", "!#$&+-.^_`|~", "!#$&+-.^_`|~")
	assertRFC5987Encoding(t, "empty filename", "", "")
}

func assertRFC5987Encoding(t *testing.T, name string, input string, want string) {
	t.Helper()
	t.Run(name, func(t *testing.T) {
		if got := encodeRFC5987(input); got != want {
			t.Fatalf("encodeRFC5987(%q) = %q, want %q", input, got, want)
		}
	})
}

func TestMultipartContentDispositionFilenameVariants(t *testing.T) {
	assertMultipartContentDisposition(
		t,
		"ASCII filename uses matching fallback and extended values",
		"file",
		"report-2026.txt",
		`form-data; name="file"; filename="report-2026.txt"; filename*=utf-8''report-2026.txt`,
	)
	assertMultipartContentDisposition(
		t,
		"fallback escapes quoted-string characters",
		"file",
		`daily "notes"\draft.txt`,
		`form-data; name="file"; filename="daily \"notes\"\\draft.txt"; filename*=utf-8''daily%20%22notes%22%5Cdraft.txt`,
	)
	assertMultipartContentDisposition(
		t,
		"fallback replaces unsupported runes while filename star keeps UTF-8",
		"file",
		"emoji-🙂.txt",
		`form-data; name="file"; filename="emoji-_.txt"; filename*=utf-8''emoji-%F0%9F%99%82.txt`,
	)
	assertMultipartContentDisposition(
		t,
		"control characters are preserved only in filename star",
		"file",
		"line\r\nbreak.txt",
		`form-data; name="file"; filename="line__break.txt"; filename*=utf-8''line%0D%0Abreak.txt`,
	)
}

func assertMultipartContentDisposition(t *testing.T, name string, formName string, path string, want string) {
	t.Helper()
	t.Run(name, func(t *testing.T) {
		if got := multipartContentDisposition(formName, path); got != want {
			t.Fatalf("multipartContentDisposition(%q, %q) = %q, want %q", formName, path, got, want)
		}
	})
}

func TestWriteErrorPart(t *testing.T) {
	gin.SetMode(gin.TestMode)

	ctx := newTestContext(http.MethodPost)
	buffer := bytes.NewBuffer(nil)
	writer := multipart.NewWriter(buffer)
	sourcePath := filepath.Join("/tmp", "missing.txt")

	writeErrorPart(
		ctx,
		writer,
		sourcePath,
		newFileDownloadErrorResponse(ctx, sourcePath, http.StatusNotFound, "FILE_NOT_FOUND", "file not found"),
	)

	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	reader := multipart.NewReader(bytes.NewReader(buffer.Bytes()), writer.Boundary())
	part, err := reader.NextPart()
	if err != nil {
		t.Fatalf("failed to read multipart part: %v", err)
	}

	if got := part.FormName(); got != "error" {
		t.Fatalf("expected form name error, got %s", got)
	}

	if got := part.Header.Get("Content-Disposition"); !strings.Contains(got, `filename="`+sourcePath+`"`) {
		t.Fatalf("expected raw filename %q in content disposition, got %q", sourcePath, got)
	}

	if got := part.Header.Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
		t.Fatalf("expected JSON content type, got %q", got)
	}

	var errorResponse struct {
		Code       string `json:"code"`
		Message    string `json:"message"`
		Method     string `json:"method"`
		Path       string `json:"path"`
		StatusCode int    `json:"statusCode"`
	}

	if err := json.NewDecoder(part).Decode(&errorResponse); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}

	if errorResponse.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, errorResponse.StatusCode)
	}

	if errorResponse.Code != "FILE_NOT_FOUND" {
		t.Fatalf("expected FILE_NOT_FOUND, got %s", errorResponse.Code)
	}

	if errorResponse.Method != http.MethodPost {
		t.Fatalf("expected method %s, got %s", http.MethodPost, errorResponse.Method)
	}

	if errorResponse.Path != sourcePath {
		t.Fatalf("expected path %q, got %q", sourcePath, errorResponse.Path)
	}
}

// Exercises DownloadFiles end-to-end and asserts that successful file parts
// carry an accurate Content-Length header (the load-bearing claim downstream
// SDKs depend on for progress totalBytes), including for empty files. Mixed
// in a directory path to verify the error part is still emitted correctly
// alongside the file parts.
func TestDownloadFilesEmitsContentLength(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tempDir := t.TempDir()

	smallPath := filepath.Join(tempDir, "small.txt")
	const smallBody = "hello, world"
	if err := os.WriteFile(smallPath, []byte(smallBody), 0o644); err != nil {
		t.Fatalf("write small file: %v", err)
	}

	emptyPath := filepath.Join(tempDir, "empty.bin")
	if err := os.WriteFile(emptyPath, nil, 0o644); err != nil {
		t.Fatalf("write empty file: %v", err)
	}

	dirPath := filepath.Join(tempDir, "subdir")
	if err := os.Mkdir(dirPath, 0o755); err != nil {
		t.Fatalf("create dir: %v", err)
	}

	body, err := json.Marshal(FilesDownloadRequest{Paths: []string{smallPath, emptyPath, dirPath}})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/files/bulk-download", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	_, engine := gin.CreateTestContext(rec)
	engine.POST("/files/bulk-download", DownloadFiles)
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d (body: %s)", http.StatusOK, rec.Code, rec.Body.String())
	}

	mediaType, params, err := mime.ParseMediaType(rec.Header().Get("Content-Type"))
	if err != nil {
		t.Fatalf("parse content type: %v", err)
	}
	if mediaType != "multipart/form-data" {
		t.Fatalf("expected multipart/form-data, got %q", mediaType)
	}

	type wantPart struct {
		formName   string
		path       string
		hasLength  bool
		wantLength int
		wantBody   string
	}
	wants := []wantPart{
		{formName: "file", path: smallPath, hasLength: true, wantLength: len(smallBody), wantBody: smallBody},
		{formName: "file", path: emptyPath, hasLength: true, wantLength: 0, wantBody: ""},
		{formName: "error", path: dirPath, hasLength: false},
	}

	reader := multipart.NewReader(rec.Body, params["boundary"])
	for i, want := range wants {
		part, err := reader.NextPart()
		if err != nil {
			t.Fatalf("part %d (%s): read: %v", i, want.path, err)
		}

		if got := part.FormName(); got != want.formName {
			t.Fatalf("part %d (%s): expected form name %q, got %q", i, want.path, want.formName, got)
		}

		gotLength := part.Header.Get("Content-Length")
		if want.hasLength {
			if gotLength == "" {
				t.Fatalf("part %d (%s): expected Content-Length header, got none", i, want.path)
			}
			parsed, parseErr := strconv.Atoi(gotLength)
			if parseErr != nil {
				t.Fatalf("part %d (%s): Content-Length %q is not numeric: %v", i, want.path, gotLength, parseErr)
			}
			if parsed != want.wantLength {
				t.Fatalf("part %d (%s): expected Content-Length %d, got %d", i, want.path, want.wantLength, parsed)
			}
		} else if gotLength != "" {
			t.Fatalf("part %d (%s): expected no Content-Length on error part, got %q", i, want.path, gotLength)
		}

		gotBody, err := io.ReadAll(part)
		if err != nil {
			t.Fatalf("part %d (%s): read body: %v", i, want.path, err)
		}
		if want.formName == "file" && string(gotBody) != want.wantBody {
			t.Fatalf("part %d (%s): expected body %q, got %q", i, want.path, want.wantBody, string(gotBody))
		}
	}

	if _, err := reader.NextPart(); err != io.EOF {
		t.Fatalf("expected io.EOF after final part, got %v", err)
	}
}
