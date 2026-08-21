package proxy

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"io"
	"net"
	"testing"
	"time"
)

// captureClientHello performs the client side of a TLS handshake over an
// in-memory pipe with the given SNI and returns the raw ClientHello bytes the
// client emits (the handshake is abandoned once its first flight is captured).
func captureClientHello(t *testing.T, serverName string) []byte {
	t.Helper()
	client, server := net.Pipe()
	defer client.Close()
	defer server.Close()

	go func() {
		// Handshake will block after writing the ClientHello (no ServerHello ever
		// comes); we only need the bytes it writes, so the error is expected.
		_ = tls.Client(client, &tls.Config{
			ServerName:         serverName,
			InsecureSkipVerify: true,
		}).Handshake()
	}()

	_ = server.SetReadDeadline(time.Now().Add(2 * time.Second))
	// Read the 5-byte record header, then the full record body, so a split write
	// can't truncate the capture.
	hdr := make([]byte, 5)
	if _, err := io.ReadFull(server, hdr); err != nil {
		t.Fatalf("reading record header: %v", err)
	}
	recordLen := int(hdr[3])<<8 | int(hdr[4])
	body := make([]byte, recordLen)
	if _, err := io.ReadFull(server, body); err != nil {
		t.Fatalf("reading record body: %v", err)
	}
	return append(hdr, body...)
}

func peekReader(b []byte) *bufio.Reader {
	return bufio.NewReaderSize(bytes.NewReader(b), maxClientHelloPeek)
}

func TestSniffClientHelloSNI(t *testing.T) {
	cases := []string{"api.openai.com", "example.com", "sub.domain.githubusercontent.com"}
	for _, want := range cases {
		hello := captureClientHello(t, want)
		got, err := sniffClientHelloSNI(peekReader(hello))
		if err != nil {
			t.Errorf("sniffClientHelloSNI(%q) errored: %v", want, err)
			continue
		}
		if got != want {
			t.Errorf("sniffClientHelloSNI = %q, want %q", got, want)
		}
	}
}

func TestSniffClientHelloSNI_DoesNotConsume(t *testing.T) {
	hello := captureClientHello(t, "api.openai.com")
	br := peekReader(hello)
	if _, err := sniffClientHelloSNI(br); err != nil {
		t.Fatalf("sniff failed: %v", err)
	}
	// The whole ClientHello must still be readable afterwards (Peek, not consume),
	// so it can be replayed to a TLS server or a spliced upstream.
	rest, err := io.ReadAll(br)
	if err != nil {
		t.Fatalf("ReadAll after sniff: %v", err)
	}
	if !bytes.Equal(rest, hello) {
		t.Fatalf("sniffing consumed bytes: got %d of %d back", len(rest), len(hello))
	}
}

// fragmentRecords re-frames a single-record ClientHello into multiple TLS
// handshake records with bodies of at most chunk bytes, mimicking clients that
// fragment the handshake across records.
func fragmentRecords(t *testing.T, hello []byte, chunk int) []byte {
	t.Helper()
	if len(hello) < 5 {
		t.Fatalf("captured hello too short: %d bytes", len(hello))
	}
	body := hello[5:]
	var out []byte
	for len(body) > 0 {
		n := min(chunk, len(body))
		out = append(out, hello[0], hello[1], hello[2], byte(n>>8), byte(n))
		out = append(out, body[:n]...)
		body = body[n:]
	}
	return out
}

func TestSniffClientHelloSNI_FragmentedRecords(t *testing.T) {
	// A ClientHello split across multiple TLS records must still yield its SNI
	// (the handshake payload is reassembled before parsing).
	want := "api.openai.com"
	hello := captureClientHello(t, want)
	for _, chunk := range []int{1, 17, 64, 100} {
		frag := fragmentRecords(t, hello, chunk)
		got, err := sniffClientHelloSNI(peekReader(frag))
		if err != nil {
			t.Errorf("chunk %d: sniffClientHelloSNI errored: %v", chunk, err)
			continue
		}
		if got != want {
			t.Errorf("chunk %d: sniffClientHelloSNI = %q, want %q", chunk, got, want)
		}
	}
}

func TestSniffClientHelloSNI_FragmentedDoesNotConsume(t *testing.T) {
	hello := fragmentRecords(t, captureClientHello(t, "api.openai.com"), 32)
	br := peekReader(hello)
	if _, err := sniffClientHelloSNI(br); err != nil {
		t.Fatalf("sniff failed: %v", err)
	}
	rest, err := io.ReadAll(br)
	if err != nil {
		t.Fatalf("ReadAll after sniff: %v", err)
	}
	if !bytes.Equal(rest, hello) {
		t.Fatalf("sniffing consumed bytes: got %d of %d back", len(rest), len(hello))
	}
}

func TestSniffClientHelloSNI_NotTLS(t *testing.T) {
	// An ASCII HTTP request must be rejected as not-a-ClientHello (this is how the
	// dispatcher tells transparent TLS from an explicit HTTP proxy request).
	br := peekReader([]byte("CONNECT example.com:443 HTTP/1.1\r\n\r\n"))
	if _, err := sniffClientHelloSNI(br); err == nil {
		t.Fatal("expected error for non-TLS input")
	}
}

func TestSniffClientHelloSNI_NoSNI(t *testing.T) {
	// A ClientHello with no ServerName (IP-based TLS) has no SNI to enforce on.
	hello := captureClientHello(t, "")
	if _, err := sniffClientHelloSNI(peekReader(hello)); err == nil {
		t.Fatal("expected errNoSNI for a ClientHello without SNI")
	}
}

func TestParseServerNameExtension_EmptyHost(t *testing.T) {
	// A malformed empty host_name (zero-length, or a lone ".") must be rejected
	// rather than treated as a usable SNI: an allow-all binding would otherwise
	// dial ":443" and could reach a service on the proxy host itself.
	inputs := [][]byte{
		{0x00, 0x03, 0x00, 0x00, 0x00},      // host_name of length 0
		{0x00, 0x04, 0x00, 0x00, 0x01, '.'}, // "." trims to ""
	}
	for i, in := range inputs {
		if host, err := parseServerNameExtension(in); err == nil {
			t.Errorf("case %d: expected error, got host %q", i, host)
		}
	}
}

func TestParseSNIFromRecord_Garbage(t *testing.T) {
	// Random/truncated bytes must not panic and must report no SNI.
	inputs := [][]byte{
		{},
		{0x01},
		{0x01, 0x00, 0x00, 0x10},
		bytes.Repeat([]byte{0xff}, 64),
	}
	for i, in := range inputs {
		if _, err := parseSNIFromRecord(in); err == nil {
			t.Errorf("case %d: expected error, got nil", i)
		}
	}
}
