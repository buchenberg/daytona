package proxy

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// CA holds an ephemeral certificate authority used to mint per-host TLS certs.
type CA struct {
	cert    *x509.Certificate
	key     *ecdsa.PrivateKey
	tlsCert tls.Certificate
	PEM     []byte // PEM-encoded CA certificate (for trust injection)

	cache sync.Map // hostname → *tls.Certificate
}

const (
	// caCertValidity is how long a generated CA certificate is valid. It is
	// long-lived so a persisted CA (e.g. the runner's shared secret-injection
	// proxy) is not forced to rotate during normal operation — rotating would
	// invalidate the CA already trusted by running workloads and break their TLS.
	caCertValidity = 10 * 365 * 24 * time.Hour
	// hostCertValidity is how long a minted per-host leaf certificate is valid.
	// Minted certs are cached for the lifetime of the CA instance, so this must
	// comfortably exceed a long-lived proxy's uptime between restarts.
	hostCertValidity = 365 * 24 * time.Hour
)

// GenerateCA creates a new ephemeral CA that lives only in memory.
func GenerateCA() (*CA, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generating CA key: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, fmt.Errorf("generating serial: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			Organization: []string{"netleash ephemeral CA"},
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(caCertValidity),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            0,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return nil, fmt.Errorf("creating CA cert: %w", err)
	}

	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, fmt.Errorf("parsing CA cert: %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})

	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("marshaling CA key: %w", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("creating TLS cert: %w", err)
	}

	return &CA{
		cert:    cert,
		key:     key,
		tlsCert: tlsCert,
		PEM:     certPEM,
	}, nil
}

// LoadOrCreateCA loads a persisted CA from certPath/keyPath when both files
// exist, otherwise it generates a fresh ephemeral CA and writes it to those
// paths (0600). Persisting the CA lets a long-lived service — e.g. the runner's
// shared secret-injection proxy — keep the same CA across restarts, so the CA
// cert already trusted by running workloads stays valid and their TLS through
// the proxy keeps working.
func LoadOrCreateCA(certPath, keyPath string) (*CA, error) {
	certPEM, certErr := os.ReadFile(certPath)
	keyPEM, keyErr := os.ReadFile(keyPath)
	switch {
	case certErr == nil && keyErr == nil:
		ca, err := caFromPEM(certPEM, keyPEM)
		if err != nil {
			return nil, fmt.Errorf("loading persisted CA from %s: %w", certPath, err)
		}
		// Reuse the persisted CA only while it is still within its validity
		// window. A CA past its NotAfter (or not yet valid) would mint certs that
		// clients reject, so fall through and regenerate, overwriting the stale
		// files.
		if now := time.Now(); now.After(ca.cert.NotBefore) && now.Before(ca.cert.NotAfter) {
			return ca, nil
		}
	case (certErr != nil && !os.IsNotExist(certErr)) || (keyErr != nil && !os.IsNotExist(keyErr)):
		// A real read failure (e.g. permissions, I/O) — surface it rather than
		// silently regenerating, which would rotate the CA and break workloads
		// that already trust the old one.
		return nil, fmt.Errorf("reading persisted CA (cert %s: %v; key %s: %v)", certPath, certErr, keyPath, keyErr)
	}

	ca, err := GenerateCA()
	if err != nil {
		return nil, err
	}

	keyDER, err := x509.MarshalECPrivateKey(ca.key)
	if err != nil {
		return nil, fmt.Errorf("marshaling CA key: %w", err)
	}
	keyPEMOut := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	if err := os.MkdirAll(filepath.Dir(certPath), 0o700); err != nil {
		return nil, fmt.Errorf("creating CA dir: %w", err)
	}
	if err := os.WriteFile(certPath, ca.PEM, 0o600); err != nil {
		return nil, fmt.Errorf("writing CA cert %s: %w", certPath, err)
	}
	if err := os.WriteFile(keyPath, keyPEMOut, 0o600); err != nil {
		return nil, fmt.Errorf("writing CA key %s: %w", keyPath, err)
	}
	return ca, nil
}

// caFromPEM reconstructs a CA from its PEM-encoded certificate and private key.
func caFromPEM(certPEM, keyPEM []byte) (*CA, error) {
	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("parsing CA key pair: %w", err)
	}
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, fmt.Errorf("no PEM block in CA certificate")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parsing CA certificate: %w", err)
	}
	key, ok := tlsCert.PrivateKey.(*ecdsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("CA private key is not ECDSA")
	}
	return &CA{
		cert:    cert,
		key:     key,
		tlsCert: tlsCert,
		PEM:     certPEM,
	}, nil
}

// MintCert generates a TLS certificate for the given hostname, signed by this CA.
// Results are cached so repeated connections to the same host reuse the cert.
func (ca *CA) MintCert(hostname string) (*tls.Certificate, error) {
	if cached, ok := ca.cache.Load(hostname); ok {
		return cached.(*tls.Certificate), nil
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generating host key: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, fmt.Errorf("generating serial: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName: hostname,
		},
		DNSNames:  []string{hostname},
		NotBefore: time.Now().Add(-1 * time.Hour),
		NotAfter:  time.Now().Add(hostCertValidity),
		KeyUsage:  x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth,
		},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, ca.cert, &key.PublicKey, ca.key)
	if err != nil {
		return nil, fmt.Errorf("creating host cert: %w", err)
	}

	tlsCert := &tls.Certificate{
		Certificate: [][]byte{certDER},
		PrivateKey:  key,
	}

	ca.cache.Store(hostname, tlsCert)
	return tlsCert, nil
}

// combinedCACert returns the system CA bundle with caPEM appended.
func combinedCACert(caPEM []byte) []byte {
	caBundlePaths := []string{
		"/etc/ssl/certs/ca-certificates.crt", // Debian/Ubuntu
		"/etc/pki/tls/certs/ca-bundle.crt",   // RHEL/Fedora
		"/etc/ssl/ca-bundle.pem",             // OpenSUSE
		"/etc/ssl/cert.pem",                  // Alpine/macOS
	}

	var systemCAs []byte
	for _, p := range caBundlePaths {
		data, err := os.ReadFile(p)
		if err == nil {
			systemCAs = data
			slog.Debug("using system CA bundle", "path", p)
			break
		}
	}

	combined := append(systemCAs, '\n')
	combined = append(combined, caPEM...)
	return combined
}

// WriteCombinedCACert reads the system CA bundle, appends the given CA PEM,
// and writes the combined result to a temp file. Returns the file path.
func WriteCombinedCACert(caPEM []byte) (string, error) {
	f, err := os.CreateTemp("", "netleash-ca-*.pem")
	if err != nil {
		return "", fmt.Errorf("creating temp CA file: %w", err)
	}
	path := f.Name()
	f.Close()

	if err := WriteCombinedCACertTo(caPEM, path); err != nil {
		os.Remove(path)
		return "", err
	}
	slog.Debug("combined CA cert written", "path", path)
	return path, nil
}

// WriteCombinedCACertTo writes the system CA bundle plus caPEM to path,
// creating parent directories as needed. The file is written world-readable
// (0644): it contains only public certificates and is mounted into workloads
// that may run as an unprivileged user and must be able to read it to verify the
// proxy's MITM certificates. (The CA private key is written separately and kept
// 0600; it is never mounted into a workload.)
func WriteCombinedCACertTo(caPEM []byte, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("creating CA bundle dir: %w", err)
	}
	if err := os.WriteFile(path, combinedCACert(caPEM), 0o644); err != nil {
		return fmt.Errorf("writing CA bundle %s: %w", path, err)
	}
	return nil
}

// CreateJavaTrustStore creates a PKCS12 keystore containing the system CAs plus
// the given CA cert, for JVM applications. Returns the path to the truststore,
// or empty string if keytool is not available.
func CreateJavaTrustStore(caCertFile string) string {
	if _, err := exec.LookPath("keytool"); err != nil {
		return ""
	}

	cacertsLocations := []string{
		filepath.Join(os.Getenv("JAVA_HOME"), "lib", "security", "cacerts"),
		"/etc/ssl/certs/java/cacerts",
		"/etc/pki/java/cacerts",
	}
	var defaultCacerts string
	for _, p := range cacertsLocations {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			defaultCacerts = p
			break
		}
	}

	f, err := os.CreateTemp("", "netleash-truststore-*.p12")
	if err != nil {
		return ""
	}
	f.Close()

	if defaultCacerts != "" {
		data, err := os.ReadFile(defaultCacerts)
		if err == nil {
			os.WriteFile(f.Name(), data, 0644)
		}
	}

	cmd := exec.Command("keytool", "-importcert", "-noprompt",
		"-alias", "netleash-ca",
		"-file", caCertFile,
		"-keystore", f.Name(),
		"-storepass", "changeit")
	if err := cmd.Run(); err != nil {
		os.Remove(f.Name())
		return ""
	}

	return f.Name()
}
