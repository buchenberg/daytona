package docker

import (
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type gpuAllocationScanAPIClient struct {
	client.APIClient
	containers []container.Summary
}

func (c gpuAllocationScanAPIClient) ContainerList(context.Context, container.ListOptions) ([]container.Summary, error) {
	return c.containers, nil
}

func newScanTestDockerClient(total int, containers []container.Summary) *DockerClient {
	return &DockerClient{
		apiClient:    gpuAllocationScanAPIClient{containers: containers},
		logger:       slog.Default(),
		gpuCount:     total,
		gpuAllocator: newGpuAllocator(total),
	}
}

func TestParseGpuIndexLabel(t *testing.T) {
	cases := []struct {
		name    string
		raw     string
		want    []int
		wantErr bool
	}{
		{name: "single index", raw: "3", want: []int{3}},
		{name: "multiple indices", raw: "0,2", want: []int{0, 2}},
		{name: "spaces around indices", raw: " 1 , 2 ", want: []int{1, 2}},
		{name: "empty part", raw: "0,,1", wantErr: true},
		{name: "non-integer", raw: "abc", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			indices, err := parseGpuIndexLabel(tc.raw)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for %q", tc.raw)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseGpuIndexLabel(%q) returned error: %v", tc.raw, err)
			}
			if len(indices) != len(tc.want) {
				t.Fatalf("expected %v, got %v", tc.want, indices)
			}
			for i := range tc.want {
				if indices[i] != tc.want[i] {
					t.Fatalf("expected %v, got %v", tc.want, indices)
				}
			}
		})
	}
}

func TestAcquireReservesFromLabelsAndSkipsExitedContainers(t *testing.T) {
	d := newScanTestDockerClient(4, []container.Summary{
		{ID: "multi-gpu", State: container.StateRunning, Labels: map[string]string{GpuIndexLabel: "0,1"}},
		{ID: "single-gpu", State: container.StateRunning, Labels: map[string]string{GpuIndexLabel: "3"}},
		{ID: "exited-gpu", State: container.StateExited, Labels: map[string]string{GpuIndexLabel: "2"}},
		{ID: "non-gpu", State: container.StateRunning, Labels: map[string]string{"daytona.sandbox_id": "sandbox-id"}},
	})

	indices, release, err := d.gpuAllocator.Acquire(context.Background(), d, 1)
	if err != nil {
		t.Fatalf("Acquire returned error: %v", err)
	}
	defer release()
	if len(indices) != 1 || indices[0] != 2 {
		t.Fatalf("expected exited container's index 2 to be free, got %v", indices)
	}
}

func TestAcquireToleratesMalformedAndDuplicateLabels(t *testing.T) {
	d := newScanTestDockerClient(3, []container.Summary{
		{ID: "gpu-a", State: container.StateRunning, Labels: map[string]string{GpuIndexLabel: "0"}},
		{ID: "gpu-b", State: container.StateRunning, Labels: map[string]string{GpuIndexLabel: "0"}},
		{ID: "malformed", State: container.StateRunning, Labels: map[string]string{GpuIndexLabel: "0,,1"}},
	})

	indices, release, err := d.gpuAllocator.Acquire(context.Background(), d, 2)
	if err != nil {
		t.Fatalf("expected malformed/duplicate labels to be tolerated, got: %v", err)
	}
	defer release()
	if len(indices) != 2 || indices[0] != 1 || indices[1] != 2 {
		t.Fatalf("expected indices [1 2], got %v", indices)
	}
}

func TestAcquireIgnoresOutOfRangeIndices(t *testing.T) {
	d := newScanTestDockerClient(2, []container.Summary{
		{ID: "stale-label", State: container.StateRunning, Labels: map[string]string{GpuIndexLabel: "7"}},
	})

	indices, release, err := d.gpuAllocator.Acquire(context.Background(), d, 2)
	if err != nil {
		t.Fatalf("Acquire returned error: %v", err)
	}
	defer release()
	if len(indices) != 2 || indices[0] != 0 || indices[1] != 1 {
		t.Fatalf("expected indices [0 1], got %v", indices)
	}
}

func TestAcquireFailsWhenNotEnoughFreeGpus(t *testing.T) {
	d := newScanTestDockerClient(2, []container.Summary{
		{ID: "gpu-a", State: container.StateRunning, Labels: map[string]string{GpuIndexLabel: "0,1"}},
	})

	_, _, err := d.gpuAllocator.Acquire(context.Background(), d, 1)
	if err == nil {
		t.Fatal("expected allocation to fail when all GPUs are reserved")
	}
	if !strings.Contains(err.Error(), "no free GPU on runner") {
		t.Fatalf("expected no-free-GPU error, got: %v", err)
	}
}
