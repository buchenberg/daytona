// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"crypto/tls"
	"crypto/x509"
	_ "embed"
)

//go:embed cacert.pem
var embeddedCACerts []byte

// TLSConfigWithEmbeddedCerts returns a *tls.Config whose RootCAs pool
// includes both the system certificate store (if available) and an
// embedded Mozilla/NSS CA bundle. This allows HTTPS connections to
// succeed even in minimal containers that lack ca-certificates.
func TLSConfigWithEmbeddedCerts() *tls.Config {
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	pool.AppendCertsFromPEM(embeddedCACerts)
	return &tls.Config{RootCAs: pool}
}
