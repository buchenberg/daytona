package proxy

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrCreateCA_PersistsAndReloads(t *testing.T) {
	dir := t.TempDir()
	certPath := filepath.Join(dir, "ca.crt")
	keyPath := filepath.Join(dir, "ca.key")

	ca1, err := LoadOrCreateCA(certPath, keyPath)
	if err != nil {
		t.Fatalf("first LoadOrCreateCA failed: %v", err)
	}
	if _, err := os.Stat(certPath); err != nil {
		t.Fatalf("CA cert file not written: %v", err)
	}
	if _, err := os.Stat(keyPath); err != nil {
		t.Fatalf("CA key file not written: %v", err)
	}

	// A second call must load the same CA from disk (stable across restarts),
	// not generate a new one.
	ca2, err := LoadOrCreateCA(certPath, keyPath)
	if err != nil {
		t.Fatalf("second LoadOrCreateCA failed: %v", err)
	}
	if !bytes.Equal(ca1.PEM, ca2.PEM) {
		t.Fatal("expected the same CA to be loaded from disk on the second call")
	}

	// The reloaded CA must still be able to mint working certs.
	if _, err := ca2.MintCert("example.com"); err != nil {
		t.Fatalf("reloaded CA failed to mint cert: %v", err)
	}
}
