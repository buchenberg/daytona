// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"crypto/tls"
	"testing"
)

func TestConfigUseTLSClient(t *testing.T) {
	tlsCfg := &tls.Config{}
	cases := []struct {
		name     string
		endpoint string
		tls      *tls.Config
		want     bool
	}{
		{"https with tls", "https://collector.example:4318", tlsCfg, true},
		{"http with tls must skip (OTLP rejects TLS on http)", "http://host.docker.internal:4318", tlsCfg, false},
		{"http without tls", "http://host.docker.internal:4318", nil, false},
		{"https without tls", "https://collector.example:4318", nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Config{Endpoint: tc.endpoint, TLSConfig: tc.tls}.useTLSClient()
			if got != tc.want {
				t.Fatalf("useTLSClient() = %v, want %v", got, tc.want)
			}
		})
	}
}
