// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

//go:build linux || darwin

package computeruse

import (
	"testing"

	"github.com/robotn/xgb/xproto"
)

func TestX11ClientListFromMissingPropertyReturnsEmptyList(t *testing.T) {
	clientList, err := x11ClientListFromProperty(&xproto.GetPropertyReply{Format: 0}, nil)
	if err != nil {
		t.Fatalf("expected no error for missing _NET_CLIENT_LIST, got %v", err)
	}
	if clientList == nil {
		t.Fatal("expected empty client list, got nil")
	}
	if len(clientList) != 0 {
		t.Fatalf("expected no windows, got %d", len(clientList))
	}
}
