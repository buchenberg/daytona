package docker

import (
	"testing"

	"github.com/daytonaio/runner/pkg/api/dto"
	"github.com/docker/docker/api/types/image"
	imagev1 "github.com/moby/docker-image-spec/specs-go/v1"
)

func TestGetContainerCreateConfigWritesGpuIndexLabel(t *testing.T) {
	d := &DockerClient{}

	cases := []struct {
		name    string
		indices []int
		want    string
	}{
		{name: "single GPU", indices: []int{3}, want: "3"},
		{name: "multiple GPUs", indices: []int{0, 2}, want: "0,2"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			config, err := d.getContainerCreateConfig(dto.CreateSandboxDTO{
				Id:       "sandbox-id",
				Snapshot: "snapshot",
				OsUser:   "daytona",
			}, &image.InspectResponse{
				Config: &imagev1.DockerOCIImageConfig{},
			}, tc.indices)
			if err != nil {
				t.Fatalf("getContainerCreateConfig returned error: %v", err)
			}

			if got := config.Labels[GpuIndexLabel]; got != tc.want {
				t.Fatalf("expected %s label to be %q, got %q", GpuIndexLabel, tc.want, got)
			}
		})
	}
}

func TestGetContainerCreateConfigOmitsGpuIndexLabelWithoutGpus(t *testing.T) {
	d := &DockerClient{}

	config, err := d.getContainerCreateConfig(dto.CreateSandboxDTO{
		Id:       "sandbox-id",
		Snapshot: "snapshot",
		OsUser:   "daytona",
	}, &image.InspectResponse{
		Config: &imagev1.DockerOCIImageConfig{},
	}, nil)
	if err != nil {
		t.Fatalf("getContainerCreateConfig returned error: %v", err)
	}

	if got, ok := config.Labels[GpuIndexLabel]; ok {
		t.Fatalf("did not expect %s label on a non-GPU container, got %q", GpuIndexLabel, got)
	}
}
