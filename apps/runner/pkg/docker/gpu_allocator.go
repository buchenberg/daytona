package docker

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"

	"github.com/docker/docker/api/types/container"
)

// GpuIndexLabel is set on every GPU sandbox container with the comma-joined
// host indices of the physical GPUs allocated to it (e.g. "3" or "0,2").
// Single-GPU values are identical to the label written by single-GPU runner
// versions, so containers created by those keep reserving their card.
const GpuIndexLabel = "daytona.gpu_index"

// gpuAllocator hands out GPU device indices to GPU sandboxes on a runner.
// Allocation is serialized by a mutex so concurrent sandbox creations cannot
// pick the same physical card.
type gpuAllocator struct {
	mu    sync.Mutex
	total int
}

func newGpuAllocator(total int) *gpuAllocator {
	return &gpuAllocator{total: total}
}

// Acquire locks the allocator, scans all containers on the runner for the
// GPU allocation label, and returns the lowest free GPU indices in [0, total).
//
// The caller MUST defer the returned release() and MUST call ContainerCreate
// (which sets the label on the new container) BEFORE release() runs so
// concurrent allocators see the new label on their next scan.
func (a *gpuAllocator) Acquire(ctx context.Context, d *DockerClient, count int) ([]int, func(), error) {
	a.mu.Lock()
	release := func() { a.mu.Unlock() }

	containers, err := d.apiClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		release()
		return nil, nil, fmt.Errorf("list containers for GPU allocation: %w", err)
	}

	// Only containers whose process is alive can actually hold a GPU - Docker
	// detaches the CDI device cgroup on exit, so an exited / dead / removing
	// sandbox no longer occupies its physical card and its index is reusable
	// by the next allocation. (GPU sandboxes are always ephemeral: a stopped
	// one is auto-deleted, never restarted, so its slot does not need to stay
	// reserved.)
	//
	// The scan is best-effort over labels: a container whose label it cannot
	// parse is logged and skipped, and an index reserved by more than one
	// container is logged and reserved once - neither state may block
	// allocation.
	used := make(map[int]struct{}, len(containers))
	for _, c := range containers {
		switch c.State {
		case container.StateExited, container.StateDead, container.StateRemoving:
			continue
		}
		raw, hasGpuLabel := c.Labels[GpuIndexLabel]
		if !hasGpuLabel {
			continue
		}
		indices, parseErr := parseGpuIndexLabel(raw)
		if parseErr != nil {
			d.logger.WarnContext(ctx, "Skipping container with unparseable GPU allocation label", "containerId", c.ID, "error", parseErr)
			continue
		}
		for _, index := range indices {
			if _, taken := used[index]; taken {
				d.logger.WarnContext(ctx, "GPU index is labeled on multiple running containers", "containerId", c.ID, "gpuIndex", index)
			}
			used[index] = struct{}{}
		}
	}

	free := make([]int, 0, count)
	for i := 0; i < a.total; i++ {
		if _, taken := used[i]; !taken {
			free = append(free, i)
			if len(free) == count {
				return free, release, nil
			}
		}
	}

	release()
	return nil, nil, fmt.Errorf("no free GPU on runner (requested=%d total=%d available=%d)", count, a.total, len(free))
}

// parseGpuIndexLabel parses a GpuIndexLabel value into host GPU indices.
// Indices outside the detected range are returned as-is: they only ever mark
// entries in the used set, where an unknown index is harmless.
func parseGpuIndexLabel(raw string) ([]int, error) {
	parts := strings.Split(raw, ",")
	indices := make([]int, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		n, err := strconv.Atoi(trimmed)
		if err != nil {
			return nil, fmt.Errorf("%s contains non-integer index %q", GpuIndexLabel, trimmed)
		}
		indices = append(indices, n)
	}
	return indices, nil
}
