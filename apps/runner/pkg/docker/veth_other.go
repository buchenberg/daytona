//go:build !linux

package docker

import (
	"log/slog"

	"github.com/docker/docker/api/types/container"
)

// resolveHostVeth is a no-op on non-Linux platforms (the runner only enforces
// network rules on Linux). Callers fall back to the source-IP anchor.
func resolveHostVeth(log *slog.Logger, c *container.InspectResponse, ip string) string {
	return ""
}
