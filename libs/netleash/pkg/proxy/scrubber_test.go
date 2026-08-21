package proxy

import (
	"io"
	"strings"
	"testing"
)

// chunkReader yields data in fixed-size pieces so the scrubber's cross-read
// boundary handling is exercised at every offset.
type chunkReader struct {
	data []byte
	size int
	pos  int
}

func (c *chunkReader) Read(p []byte) (int, error) {
	if c.pos >= len(c.data) {
		return 0, io.EOF
	}
	n := c.size
	if n > len(p) {
		n = len(p)
	}
	if c.pos+n > len(c.data) {
		n = len(c.data) - c.pos
	}
	copy(p, c.data[c.pos:c.pos+n])
	c.pos += n
	return n, nil
}

func (c *chunkReader) Close() error { return nil }

func scrubAll(t *testing.T, in string, chunk int, repls []replacement) string {
	t.Helper()
	r := newScrubbingReader(&chunkReader{data: []byte(in), size: chunk}, repls)
	out, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("scrub read failed: %v", err)
	}
	return string(out)
}

func TestScrubbingReader(t *testing.T) {
	repls := []replacement{
		{value: "real-secret-token", placeholder: "PH_TOKEN"},
		{value: "sk-LIVE-9999", placeholder: "__PH_KEY__"}, // placeholder longer than value
	}

	cases := []struct {
		name string
		in   string
		want string
	}{
		{"none", "nothing to see here", "nothing to see here"},
		{"middle", "a real-secret-token b", "a PH_TOKEN b"},
		{"start", "real-secret-token tail", "PH_TOKEN tail"},
		{"end", "head real-secret-token", "head PH_TOKEN"},
		{"twice", "real-secret-token real-secret-token", "PH_TOKEN PH_TOKEN"},
		{"adjacent", "real-secret-tokenreal-secret-token", "PH_TOKENPH_TOKEN"},
		{"two-secrets", "x real-secret-token y sk-LIVE-9999 z", "x PH_TOKEN y __PH_KEY__ z"},
		{"longer-placeholder", "k=sk-LIVE-9999", "k=__PH_KEY__"},
		{"prefix-not-completed", "real-secret-toke", "real-secret-toke"}, // value prefix, never completes
	}

	// Run across chunk sizes (including 1, which splits the secret at every byte)
	// to prove boundary-independence.
	for _, chunk := range []int{1, 2, 3, 7, 16, 1024} {
		for _, tc := range cases {
			got := scrubAll(t, tc.in, chunk, repls)
			if got != tc.want {
				t.Errorf("chunk=%d %s: got %q, want %q", chunk, tc.name, got, tc.want)
			}
		}
	}
}

// The real secret value must never appear in the scrubbed output, at any chunk
// boundary, even when surrounded by arbitrary data.
func TestScrubbingReader_NeverLeaksValue(t *testing.T) {
	const secret = "real-secret-token"
	repls := []replacement{{value: secret, placeholder: "PH"}}
	for _, chunk := range []int{1, 2, 5, 13, 17, 64} {
		in := strings.Repeat("x", chunk) + secret + strings.Repeat("y", chunk)
		got := scrubAll(t, in, chunk, repls)
		if strings.Contains(got, secret) {
			t.Fatalf("chunk=%d: scrubbed output still contains the secret: %q", chunk, got)
		}
		if strings.Count(got, "PH") != 1 {
			t.Fatalf("chunk=%d: expected exactly one placeholder, got %q", chunk, got)
		}
	}
}
