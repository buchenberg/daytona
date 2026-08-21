package proxy

import (
	"bytes"
	"io"
	"net/http"
	"strings"
)

// replacement maps a real secret value to the placeholder the sandbox is
// supposed to see in its place.
type replacement struct {
	value       string
	placeholder string
}

// scrubString replaces every real secret value in s with its placeholder. Used
// for response headers, which are small and fully in memory.
func scrubString(s string, repls []replacement) string {
	for _, r := range repls {
		if r.value == "" {
			continue
		}
		s = strings.ReplaceAll(s, r.value, r.placeholder)
	}
	return s
}

// scrubHeader rewrites every response header value in place, replacing real
// secret values with their placeholders (e.g. an upstream that reflects the
// Authorization header back, or a verbose 4xx that echoes it).
func scrubHeader(h http.Header, repls []replacement) {
	for key, vals := range h {
		for i, v := range vals {
			h[key][i] = scrubString(v, repls)
		}
	}
}

// scrubbingReader wraps an upstream response body and replaces every occurrence
// of a real secret value with its placeholder as the body streams through, so
// the sandbox only ever sees placeholders even when an upstream echoes a secret
// back (debug/echo routes, header-reflecting redirects). It buffers at most
// (longest value − 1) bytes between reads to catch a value split across reads,
// so memory stays bounded regardless of body size (preserving the NL-REQ-01
// streaming property).
type scrubbingReader struct {
	src    io.ReadCloser
	repls  []replacement
	maxLen int          // length of the longest secret value
	buf    []byte       // reusable read buffer
	out    bytes.Buffer // scrubbed bytes ready to be returned
	tail   []byte       // raw trailing bytes that may begin a value spanning reads
	srcErr error        // sticky source error (EOF or a real error)
	closed bool

	// trailer, when non-nil, is the response's HTTP trailer map. Trailer values
	// are populated by the transport only as the body streams to EOF, so they are
	// scrubbed in place the moment the source reaches EOF — before resp.Write
	// emits them — rather than up front while still empty.
	trailer http.Header
}

// newScrubbingReader wraps src so that occurrences of any repls[i].value are
// rewritten to repls[i].placeholder. Callers must pass a non-empty repls.
func newScrubbingReader(src io.ReadCloser, repls []replacement) *scrubbingReader {
	maxLen := 0
	for _, r := range repls {
		if len(r.value) > maxLen {
			maxLen = len(r.value)
		}
	}
	return &scrubbingReader{
		src:    src,
		repls:  repls,
		maxLen: maxLen,
		buf:    make([]byte, 32*1024),
	}
}

func (s *scrubbingReader) Read(p []byte) (int, error) {
	for s.out.Len() == 0 && s.srcErr == nil {
		s.fill()
	}
	if s.out.Len() > 0 {
		return s.out.Read(p)
	}
	return 0, s.srcErr
}

// fill reads one chunk from the source, scrubs it together with any retained
// tail, emits everything that can no longer be part of a cross-read match, and
// retains the trailing bytes that still could be.
func (s *scrubbingReader) fill() {
	n, err := s.src.Read(s.buf)
	if n > 0 {
		// Scrub the full (tail + chunk) window first, so a value straddling the
		// previous read boundary is caught. Only a value PREFIX can remain at the
		// very end (its suffix not yet read); retain up to maxLen-1 raw bytes to
		// complete it on the next read.
		combined := s.replace(append(append([]byte(nil), s.tail...), s.buf[:n]...))
		keep := s.maxLen - 1
		if keep < 0 {
			keep = 0
		}
		if keep > len(combined) {
			keep = len(combined)
		}
		s.out.Write(combined[:len(combined)-keep])
		s.tail = append(s.tail[:0:0], combined[len(combined)-keep:]...)
	}
	if err != nil {
		// At EOF (or error) the retained tail can't grow further; emit it as-is
		// (a never-completed value prefix was not the secret).
		if len(s.tail) > 0 {
			s.out.Write(s.tail)
			s.tail = nil
		}
		// The transport has now populated any trailer values (it does so when the
		// underlying body reaches EOF); scrub them before resp.Write emits them.
		if s.trailer != nil {
			scrubHeader(s.trailer, s.repls)
		}
		s.srcErr = err
	}
}

func (s *scrubbingReader) replace(b []byte) []byte {
	for _, r := range s.repls {
		if r.value == "" {
			continue
		}
		b = bytes.ReplaceAll(b, []byte(r.value), []byte(r.placeholder))
	}
	return b
}

// Close closes the underlying body. It is idempotent so the proxy can safely
// close both via http.Response.Write and explicitly.
func (s *scrubbingReader) Close() error {
	if s.closed {
		return nil
	}
	s.closed = true
	return s.src.Close()
}
