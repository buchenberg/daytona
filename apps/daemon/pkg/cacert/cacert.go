// Package cacert installs the secret-injection proxy's CA certificate into the
// sandbox's system trust store. The runner points common TLS stacks at the
// mounted CA via SSL_CERT_FILE / *_CA_BUNDLE env vars, but clients that only
// consult the system store — notably GnuTLS builds of wget — ignore those env
// vars entirely, so without a system-store install every HTTPS request they
// make inside a secret-using sandbox fails certificate verification.
package cacert

import (
	"bytes"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

// DefaultProxyCAPath is where the runner bind-mounts the shared secret proxy's
// CA bundle into secret-using sandboxes (the runner's secretCAContainerPath).
// The file does not exist in sandboxes that use no secrets.
const DefaultProxyCAPath = "/etc/daytona/netleash/ca.crt"

// anchorFileName is the file the CA is written to inside distro trust-anchor
// source directories, so tools that regenerate the system bundle from anchors
// (update-ca-certificates, update-ca-trust) keep the proxy CA trusted.
const anchorFileName = "daytona-secret-proxy-ca.crt"

// systemBundlePaths are the well-known CA bundle files that OpenSSL / GnuTLS
// builds across distros use as their default trust store (the same set Go's
// crypto/x509 probes). The CA is appended to every one that exists; paths that
// are symlinks to another entry are naturally skipped by the idempotency check.
var systemBundlePaths = []string{
	"/etc/ssl/certs/ca-certificates.crt",                // Debian/Ubuntu/Alpine
	"/etc/pki/tls/certs/ca-bundle.crt",                  // Fedora/RHEL 6
	"/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem", // CentOS/RHEL 7+
	"/etc/ssl/ca-bundle.pem",                            // openSUSE
	"/etc/pki/tls/cacert.pem",                           // OpenELEC
	"/etc/ssl/cert.pem",                                 // Alpine (symlink), macOS-style layouts
}

// anchorDirs are the distro trust-anchor source directories; a copy of the CA
// is dropped into every one that exists.
var anchorDirs = []string{
	"/usr/local/share/ca-certificates", // Debian/Ubuntu/Alpine (update-ca-certificates)
	"/etc/pki/ca-trust/source/anchors", // Fedora/RHEL (update-ca-trust)
	"/etc/pki/trust/anchors",           // openSUSE (update-ca-certificates)
}

// InstallProxyCA installs the mounted secret proxy CA into the sandbox's system
// trust store: it appends the CA to every existing well-known bundle file and
// drops an anchor copy into every existing trust-anchor directory. Idempotent,
// best-effort (failures are logged, never fatal — the env-var wiring still
// covers most clients), and a no-op when the sandbox uses no secrets (the CA
// file is not mounted).
func InstallProxyCA(logger *slog.Logger) {
	installProxyCA(logger, DefaultProxyCAPath, systemBundlePaths, anchorDirs)
}

func installProxyCA(logger *slog.Logger, caPath string, bundlePaths, anchorDirs []string) {
	raw, err := os.ReadFile(caPath)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			logger.Warn("Failed to read secret proxy CA", "path", caPath, "error", err)
		}
		return
	}

	caPEM, err := normalizeCertPEM(raw)
	if err != nil {
		logger.Warn("Secret proxy CA is not a valid certificate; not installing into system trust store", "path", caPath, "error", err)
		return
	}

	installed := false

	for _, dir := range anchorDirs {
		if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
			continue
		}
		dst := filepath.Join(dir, anchorFileName)
		if existing, err := os.ReadFile(dst); err == nil && bytes.Equal(existing, caPEM) {
			continue
		}
		if err := os.WriteFile(dst, caPEM, 0644); err != nil {
			logger.Warn("Failed to write secret proxy CA anchor", "path", dst, "error", err)
			continue
		}
		installed = true
	}

	for _, bundle := range bundlePaths {
		appended, err := appendToBundle(bundle, caPEM)
		if err != nil {
			logger.Warn("Failed to append secret proxy CA to system bundle", "path", bundle, "error", err)
			continue
		}
		installed = installed || appended
	}

	if installed {
		logger.Info("Installed secret proxy CA into system trust store")
	}
}

// appendToBundle appends caPEM to the bundle file if the file exists and does
// not already contain it. Reports whether it wrote anything.
func appendToBundle(path string, caPEM []byte) (bool, error) {
	existing, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil // no trust store there to begin with — not ours to create
		}
		return false, err
	}
	if bytes.Contains(existing, caPEM) {
		return false, nil
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		return false, err
	}
	defer f.Close()

	// Keep the bundle a valid concatenation: PEM blocks must start on their own line.
	if len(existing) > 0 && existing[len(existing)-1] != '\n' {
		if _, err := f.Write([]byte("\n")); err != nil {
			return false, err
		}
	}
	if _, err := f.Write(caPEM); err != nil {
		return false, err
	}
	return true, f.Close()
}

// normalizeCertPEM validates that data holds at least one parseable PEM
// certificate and re-encodes the certificate blocks canonically, so the
// bundle idempotency check is byte-stable regardless of the mounted file's
// formatting and no non-certificate material leaks into the system store.
func normalizeCertPEM(data []byte) ([]byte, error) {
	var out bytes.Buffer
	rest := data
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			break
		}
		if block.Type != "CERTIFICATE" {
			continue
		}
		if _, err := x509.ParseCertificate(block.Bytes); err != nil {
			return nil, fmt.Errorf("invalid certificate in CA bundle: %w", err)
		}
		if err := pem.Encode(&out, &pem.Block{Type: "CERTIFICATE", Bytes: block.Bytes}); err != nil {
			return nil, err
		}
	}
	if out.Len() == 0 {
		return nil, errors.New("no certificate PEM blocks found")
	}
	return out.Bytes(), nil
}
