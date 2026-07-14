package cacert

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"log/slog"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testCertPEM(t *testing.T) []byte {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "daytona test proxy CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}

func testLogger() *slog.Logger {
	return slog.New(slog.DiscardHandler)
}

func countCertBlocks(t *testing.T, path string) int {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	count := 0
	for {
		var block *pem.Block
		block, data = pem.Decode(data)
		if block == nil {
			return count
		}
		if block.Type == "CERTIFICATE" {
			count++
		}
	}
}

func TestInstallProxyCA(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.crt")
	caPEM := testCertPEM(t)
	require.NoError(t, os.WriteFile(caPath, caPEM, 0644))

	systemCert := testCertPEM(t)
	bundle := filepath.Join(dir, "ca-certificates.crt")
	require.NoError(t, os.WriteFile(bundle, systemCert, 0644))
	missingBundle := filepath.Join(dir, "ca-bundle.pem")

	anchorDir := filepath.Join(dir, "anchors")
	require.NoError(t, os.Mkdir(anchorDir, 0755))
	missingAnchorDir := filepath.Join(dir, "no-such-anchors")

	installProxyCA(testLogger(), caPath, []string{bundle, missingBundle}, []string{anchorDir, missingAnchorDir})

	// The CA is appended after the existing system certs.
	assert.Equal(t, 2, countCertBlocks(t, bundle))
	data, err := os.ReadFile(bundle)
	require.NoError(t, err)
	assert.True(t, bytes.HasPrefix(data, systemCert))
	assert.True(t, bytes.Contains(data, caPEM))

	// The anchor copy is written for bundle-regenerating tools.
	anchor, err := os.ReadFile(filepath.Join(anchorDir, anchorFileName))
	require.NoError(t, err)
	assert.Equal(t, caPEM, anchor)

	// Absent bundles and anchor dirs are not created.
	_, err = os.Stat(missingBundle)
	assert.True(t, os.IsNotExist(err))
	_, err = os.Stat(missingAnchorDir)
	assert.True(t, os.IsNotExist(err))
}

func TestInstallProxyCAIdempotent(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.crt")
	require.NoError(t, os.WriteFile(caPath, testCertPEM(t), 0644))

	bundle := filepath.Join(dir, "ca-certificates.crt")
	require.NoError(t, os.WriteFile(bundle, testCertPEM(t), 0644))
	anchorDir := filepath.Join(dir, "anchors")
	require.NoError(t, os.Mkdir(anchorDir, 0755))

	installProxyCA(testLogger(), caPath, []string{bundle}, []string{anchorDir})
	first, err := os.ReadFile(bundle)
	require.NoError(t, err)

	installProxyCA(testLogger(), caPath, []string{bundle}, []string{anchorDir})
	second, err := os.ReadFile(bundle)
	require.NoError(t, err)

	assert.Equal(t, first, second)
	assert.Equal(t, 2, countCertBlocks(t, bundle))
}

func TestInstallProxyCASymlinkedBundleAppendsOnce(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.crt")
	require.NoError(t, os.WriteFile(caPath, testCertPEM(t), 0644))

	// Alpine layout: /etc/ssl/cert.pem is a symlink to the Debian-style bundle.
	bundle := filepath.Join(dir, "ca-certificates.crt")
	require.NoError(t, os.WriteFile(bundle, testCertPEM(t), 0644))
	link := filepath.Join(dir, "cert.pem")
	require.NoError(t, os.Symlink(bundle, link))

	installProxyCA(testLogger(), caPath, []string{bundle, link}, nil)

	assert.Equal(t, 2, countCertBlocks(t, bundle))
}

func TestInstallProxyCANoTrailingNewline(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.crt")
	require.NoError(t, os.WriteFile(caPath, testCertPEM(t), 0644))

	bundle := filepath.Join(dir, "ca-certificates.crt")
	existing := bytes.TrimRight(testCertPEM(t), "\n")
	require.NoError(t, os.WriteFile(bundle, existing, 0644))

	installProxyCA(testLogger(), caPath, []string{bundle}, nil)

	// Both certs must still decode — the appended block starts on its own line.
	assert.Equal(t, 2, countCertBlocks(t, bundle))
}

func TestInstallProxyCAMissingCAIsNoop(t *testing.T) {
	dir := t.TempDir()
	bundle := filepath.Join(dir, "ca-certificates.crt")
	original := testCertPEM(t)
	require.NoError(t, os.WriteFile(bundle, original, 0644))

	installProxyCA(testLogger(), filepath.Join(dir, "ca.crt"), []string{bundle}, nil)

	data, err := os.ReadFile(bundle)
	require.NoError(t, err)
	assert.Equal(t, original, data)
}

func TestInstallProxyCAInvalidCAIsNotInstalled(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "ca.crt")
	require.NoError(t, os.WriteFile(caPath, []byte("not a certificate"), 0644))

	bundle := filepath.Join(dir, "ca-certificates.crt")
	original := testCertPEM(t)
	require.NoError(t, os.WriteFile(bundle, original, 0644))
	anchorDir := filepath.Join(dir, "anchors")
	require.NoError(t, os.Mkdir(anchorDir, 0755))

	installProxyCA(testLogger(), caPath, []string{bundle}, []string{anchorDir})

	data, err := os.ReadFile(bundle)
	require.NoError(t, err)
	assert.Equal(t, original, data)
	_, err = os.Stat(filepath.Join(anchorDir, anchorFileName))
	assert.True(t, os.IsNotExist(err))
}

func TestNormalizeCertPEMStripsNonCertificateBlocks(t *testing.T) {
	certPEM := testCertPEM(t)
	mixed := append([]byte("-----BEGIN EC PRIVATE KEY-----\nAAAA\n-----END EC PRIVATE KEY-----\n"), certPEM...)

	out, err := normalizeCertPEM(mixed)
	require.NoError(t, err)
	assert.Equal(t, certPEM, out)
}
