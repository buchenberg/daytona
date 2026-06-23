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
		NotAfter:              time.Now().Add(24 * time.Hour),
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
		NotAfter:  time.Now().Add(24 * time.Hour),
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

// WriteCombinedCACert reads the system CA bundle, appends the given CA PEM,
// and writes the combined result to a temp file. Returns the file path.
func WriteCombinedCACert(caPEM []byte) (string, error) {
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

	f, err := os.CreateTemp("", "netleash-ca-*.pem")
	if err != nil {
		return "", fmt.Errorf("creating temp CA file: %w", err)
	}

	if _, err := f.Write(combined); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", fmt.Errorf("writing CA file: %w", err)
	}
	f.Close()

	slog.Debug("combined CA cert written", "path", f.Name())
	return f.Name(), nil
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
