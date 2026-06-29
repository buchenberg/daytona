// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"slices"
	"testing"

	"github.com/docker/docker/api/types/container"
)

func TestIsKataRuntime(t *testing.T) {
	kata := &container.InspectResponse{
		ContainerJSONBase: &container.ContainerJSONBase{
			HostConfig: &container.HostConfig{Runtime: "kata-clh"},
		},
	}
	if !isKataRuntime(kata) {
		t.Fatal("kata-clh runtime should be detected as kata")
	}

	for _, rt := range []string{"runc", "sysbox-runc", ""} {
		c := &container.InspectResponse{
			ContainerJSONBase: &container.ContainerJSONBase{
				HostConfig: &container.HostConfig{Runtime: rt},
			},
		}
		if isKataRuntime(c) {
			t.Fatalf("runtime %q should not be detected as kata", rt)
		}
	}

	// Defensive: missing structs must not panic and must report non-kata.
	if isKataRuntime(nil) {
		t.Fatal("nil container should not be kata")
	}
	if isKataRuntime(&container.InspectResponse{}) {
		t.Fatal("container with nil HostConfig should not be kata")
	}
}

func TestSplitDomainAllowList(t *testing.T) {
	got := splitDomainAllowList(" example.com, ,*.github.com ,")
	want := []string{"example.com", "*.github.com"}
	if !slices.Equal(got, want) {
		t.Fatalf("splitDomainAllowList = %v, want %v", got, want)
	}
	if len(splitDomainAllowList("")) != 0 {
		t.Fatal("empty input should yield no domains")
	}
}
