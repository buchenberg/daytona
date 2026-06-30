// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/daytonaio/runner/cmd/runner/config"
	"github.com/daytonaio/runner/pkg/docker/sysboxmgr"
	"github.com/docker/docker/api/types/container"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	reflectpb "google.golang.org/grpc/reflection/grpc_reflection_v1"
)

// sysbox-runc depends on the sysbox-mgr and sysbox-fs daemons; if either is down,
// container creation fails and the runner silently falls back to kata-clh.
const (
	sysboxMgrSocketPath = "/run/sysbox/sysmgr.sock"
	sysboxFsSocketPath  = "/run/sysbox/sysfs.sock"

	// Bounds each sysbox-mgr/fs gRPC call so a wedged daemon can't stall the
	// healthcheck or the create/start hot path.
	sysboxRPCTimeout = 2 * time.Second
)

func (d *DockerClient) PingSysboxMgr(ctx context.Context) error {
	return pingSysboxDaemon(ctx, "sysbox-mgr", sysboxMgrSocketPath)
}

func (d *DockerClient) PingSysboxFs(ctx context.Context) error {
	return pingSysboxDaemon(ctx, "sysbox-fs", sysboxFsSocketPath)
}

// ServiceProbe is a named health probe for a runner-critical daemon.
type ServiceProbe struct {
	Name string
	Ping func(context.Context) error
}

// ServiceHealthProbes returns the daemons this runner should health-report:
// always docker, plus the sysbox daemons where they apply.
func (d *DockerClient) ServiceHealthProbes() []ServiceProbe {
	probes := []ServiceProbe{{Name: "docker", Ping: d.Ping}}
	if d.SysboxProbesEnabled() {
		probes = append(probes,
			ServiceProbe{Name: "sysbox-mgr", Ping: d.PingSysboxMgr},
			ServiceProbe{Name: "sysbox-fs", Ping: d.PingSysboxFs},
		)
	}
	return probes
}

// SysboxProbesEnabled reports whether sysbox health probes apply to this runner:
// by default only when the configured container runtime is sysbox (non-sysbox
// runners have no sysbox sockets); SYSBOX_HEALTH_PROBES=true/false overrides.
func (d *DockerClient) SysboxProbesEnabled() bool {
	switch d.sysboxHealthProbes {
	case "true":
		return true
	case "false":
		return false
	}
	return strings.HasPrefix(config.GetContainerRuntime(), "sysbox")
}

// pingSysboxDaemon reports the daemon healthy only if it answers a real gRPC
// request. sysbox implements no health service, but both daemons enable server
// reflection, so a ListServices round-trip proves the daemon is servicing RPCs —
// a socket dial only proves something is listening.
func pingSysboxDaemon(ctx context.Context, name, path string) error {
	ctx, cancel := context.WithTimeout(ctx, sysboxRPCTimeout)
	defer cancel()

	conn, err := grpc.NewClient("unix://"+path, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("%s ping failed: %w", name, err)
	}
	defer conn.Close()

	stream, err := reflectpb.NewServerReflectionClient(conn).ServerReflectionInfo(ctx)
	if err == nil {
		err = stream.Send(&reflectpb.ServerReflectionRequest{
			MessageRequest: &reflectpb.ServerReflectionRequest_ListServices{},
		})
	}
	if err == nil {
		_, err = stream.Recv()
	}
	if err != nil {
		return fmt.Errorf("%s ping failed: %w", name, err)
	}
	return nil
}

// sysboxDaemonsHealthy reports whether both sysbox daemons are reachable, telling
// stale per-container state (daemons up) apart from a runner-wide outage (daemons down).
func (d *DockerClient) sysboxDaemonsHealthy(ctx context.Context) bool {
	return d.PingSysboxMgr(ctx) == nil && d.PingSysboxFs(ctx) == nil
}

// isSysboxContainer reports whether the container runs under the sysbox runtime.
func isSysboxContainer(c *container.InspectResponse) bool {
	return c != nil && c.ContainerJSONBase != nil && c.HostConfig != nil &&
		strings.HasPrefix(c.HostConfig.Runtime, "sysbox")
}

// isRedundantRegistrationError matches sysbox-mgr's rejection of a start while the
// container is still registered from a run that died without `runc delete`.
func isRedundantRegistrationError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "redundant container registration")
}

func isOCIRuntimeCreateError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "OCI runtime create failed")
}

// unregisterFromSysboxMgr asks sysbox-mgr to unregister the container, running the
// cleanup a lost `runc delete` skipped: rootfs ownership revert, volume sync-out,
// marking the registration stopped. Never clear a stale registration by committing
// or recreating instead — the rootfs is still uid-shifted at that point and a
// commit bakes that into the image.
func (d *DockerClient) unregisterFromSysboxMgr(ctx context.Context, containerID string) error {
	ctx, cancel := context.WithTimeout(ctx, sysboxRPCTimeout)
	defer cancel()

	conn, err := grpc.NewClient("unix://"+sysboxMgrSocketPath, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("failed to create sysbox-mgr client: %w", err)
	}
	defer conn.Close()

	if _, err := sysboxmgr.NewSysboxMgrStateChannelClient(conn).Unregister(ctx, &sysboxmgr.UnregisterReq{Id: containerID}); err != nil {
		return fmt.Errorf("sysbox-mgr unregister failed: %w", err)
	}
	return nil
}
