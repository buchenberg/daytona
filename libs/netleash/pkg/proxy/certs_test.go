package proxy

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"os"
	"testing"
)

func TestGenerateCA(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	if ca.cert == nil {
		t.Fatal("CA cert is nil")
	}
	if ca.key == nil {
		t.Fatal("CA key is nil")
	}
	if len(ca.PEM) == 0 {
		t.Fatal("CA PEM is empty")
	}

	// Verify PEM is valid.
	block, _ := pem.Decode(ca.PEM)
	if block == nil {
		t.Fatal("failed to decode CA PEM")
	}
	if block.Type != "CERTIFICATE" {
		t.Fatalf("expected CERTIFICATE PEM block, got %q", block.Type)
	}

	// Verify it's actually a CA cert.
	if !ca.cert.IsCA {
		t.Fatal("cert should be a CA")
	}
	if ca.cert.BasicConstraintsValid != true {
		t.Fatal("BasicConstraintsValid should be true")
	}
}

func TestGenerateCA_PEMParseable(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	// Should be loadable into a cert pool.
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca.PEM) {
		t.Fatal("failed to add CA PEM to cert pool")
	}
}

func TestMintCert(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	cert, err := ca.MintCert("api.example.com")
	if err != nil {
		t.Fatalf("MintCert failed: %v", err)
	}

	if cert == nil {
		t.Fatal("minted cert is nil")
	}
	if len(cert.Certificate) == 0 {
		t.Fatal("minted cert has no certificate data")
	}

	// Parse and verify the minted cert.
	parsed, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatalf("failed to parse minted cert: %v", err)
	}

	if parsed.Subject.CommonName != "api.example.com" {
		t.Fatalf("expected CN=api.example.com, got %q", parsed.Subject.CommonName)
	}
	if len(parsed.DNSNames) != 1 || parsed.DNSNames[0] != "api.example.com" {
		t.Fatalf("expected SAN=[api.example.com], got %v", parsed.DNSNames)
	}

	// Verify cert chains to our CA.
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(ca.PEM)
	if _, err := parsed.Verify(x509.VerifyOptions{
		DNSName: "api.example.com",
		Roots:   pool,
	}); err != nil {
		t.Fatalf("cert verification failed: %v", err)
	}
}

func TestMintCert_Cached(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	cert1, err := ca.MintCert("cached.example.com")
	if err != nil {
		t.Fatalf("first MintCert failed: %v", err)
	}

	cert2, err := ca.MintCert("cached.example.com")
	if err != nil {
		t.Fatalf("second MintCert failed: %v", err)
	}

	// Should return the same pointer (cached).
	if cert1 != cert2 {
		t.Fatal("expected same cert pointer from cache")
	}
}

func TestMintCert_DifferentHosts(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	cert1, err := ca.MintCert("host1.example.com")
	if err != nil {
		t.Fatalf("MintCert(host1) failed: %v", err)
	}

	cert2, err := ca.MintCert("host2.example.com")
	if err != nil {
		t.Fatalf("MintCert(host2) failed: %v", err)
	}

	if cert1 == cert2 {
		t.Fatal("different hosts should get different certs")
	}
}

func TestMintCert_TLSHandshake(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	hostname := "handshake.example.com"
	cert, err := ca.MintCert(hostname)
	if err != nil {
		t.Fatalf("MintCert failed: %v", err)
	}

	// Set up a TLS server with the minted cert.
	serverCfg := &tls.Config{
		Certificates: []tls.Certificate{*cert},
	}
	ln, err := tls.Listen("tcp", "127.0.0.1:0", serverCfg)
	if err != nil {
		t.Fatalf("tls.Listen failed: %v", err)
	}
	defer ln.Close()

	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		// Complete the TLS handshake on the server side before closing.
		conn.(*tls.Conn).Handshake()
		conn.Close()
	}()

	// Connect as a client trusting our CA.
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(ca.PEM)
	clientCfg := &tls.Config{
		RootCAs:    pool,
		ServerName: hostname,
	}

	conn, err := tls.Dial("tcp", ln.Addr().String(), clientCfg)
	if err != nil {
		t.Fatalf("TLS handshake failed: %v", err)
	}
	conn.Close()
}

func TestWriteCombinedCACert(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	path, err := WriteCombinedCACert(ca.PEM)
	if err != nil {
		t.Fatalf("WriteCombinedCACert failed: %v", err)
	}
	defer os.Remove(path)

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read combined cert: %v", err)
	}

	// Should contain our CA PEM.
	if !containsPEM(data, ca.PEM) {
		t.Fatal("combined cert should contain our CA PEM")
	}

	// Should be parseable by a cert pool.
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(data) {
		t.Fatal("failed to parse combined cert bundle")
	}
}

func TestWriteCombinedCACert_ContainsSystemCAs(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	path, err := WriteCombinedCACert(ca.PEM)
	if err != nil {
		t.Fatalf("WriteCombinedCACert failed: %v", err)
	}
	defer os.Remove(path)

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read combined cert: %v", err)
	}

	// The combined file should contain more than just our CA
	// (system CAs should be prepended if available).
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(data)

	// Should have at least our CA PEM.
	if !containsPEM(data, ca.PEM) {
		t.Fatal("combined cert should contain our CA PEM")
	}

	// On most systems, file should be larger than just our CA cert.
	if len(data) <= len(ca.PEM)+1 {
		t.Log("warning: no system CAs found, combined file only contains our CA")
	}
}

func TestCreateJavaTrustStore_NoKeytool(t *testing.T) {
	// Save PATH, set to empty so keytool can't be found.
	origPath := os.Getenv("PATH")
	os.Setenv("PATH", "")
	defer os.Setenv("PATH", origPath)

	result := CreateJavaTrustStore("/nonexistent.pem")
	if result != "" {
		os.Remove(result)
		t.Fatal("expected empty string when keytool is not available")
	}
}

func TestMintCert_ExtKeyUsage(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	cert, err := ca.MintCert("test.example.com")
	if err != nil {
		t.Fatalf("MintCert failed: %v", err)
	}

	parsed, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatalf("failed to parse cert: %v", err)
	}

	if len(parsed.ExtKeyUsage) != 1 || parsed.ExtKeyUsage[0] != x509.ExtKeyUsageServerAuth {
		t.Fatalf("expected ServerAuth ExtKeyUsage, got %v", parsed.ExtKeyUsage)
	}

	if parsed.IsCA {
		t.Fatal("minted cert should not be a CA")
	}
}

func TestGenerateCA_UniqueSerials(t *testing.T) {
	ca1, err := GenerateCA()
	if err != nil {
		t.Fatalf("first GenerateCA failed: %v", err)
	}
	ca2, err := GenerateCA()
	if err != nil {
		t.Fatalf("second GenerateCA failed: %v", err)
	}

	if ca1.cert.SerialNumber.Cmp(ca2.cert.SerialNumber) == 0 {
		t.Fatal("two CAs should have different serial numbers")
	}
}

// containsPEM checks if target PEM block is present in data.
func containsPEM(data, target []byte) bool {
	targetBlock, _ := pem.Decode(target)
	if targetBlock == nil {
		return false
	}

	rest := data
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			break
		}
		if block.Type == targetBlock.Type && string(block.Bytes) == string(targetBlock.Bytes) {
			return true
		}
	}
	return false
}
