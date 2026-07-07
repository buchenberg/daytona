// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"runtime"
	"syscall"
	"time"

	"github.com/charlievieth/fastwalk"
	tasksapi "github.com/containerd/containerd/api/services/tasks/v1"
	"github.com/daytonaio/runner/pkg/common"
	"github.com/docker/docker/api/types/container"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// Sysbox runs sandboxes in a user namespace and, on hosts without full
// ID-mapped-mount support, keeps the container's overlayfs upper layer chowned
// into the namespace's host UID range (e.g. 231072+) while the container is
// registered. It reverts ownership to 0-based (and syncs relocated dirs such as
// the inner Docker's /var/lib/docker back into the rootfs) only inside
// sysbox-mgr's pause and unregister handlers.
//
// A docker commit that reads the rootfs outside those two windows bakes the
// shifted UIDs into the backup image; restoring such an image maps the files to
// nobody:nogroup and the sandbox cannot boot. The helpers here guarantee every
// commit happens against a canonical (0-based) rootfs:
//
//   - running container: commit with pause=true — sysbox-runc's pause freezes
//     the container and synchronously reverts ownership before the commit
//     reads the diff (see commitContainer).
//   - stopped container: sysbox's revert runs inside `runc delete`, which the
//     containerd task deletion blocks on. awaitSysboxRootfsSettled waits until
//     containerd no longer has a task for the container, which by that call
//     chain means the revert and sync-out have completed.
//   - both: verifyBackupOwnership rejects any committed layer that still
//     contains shifted IDs, so a poisoned backup can never be pushed even if
//     the assumptions above are broken by a future sysbox/docker change.

// containerd's gRPC namespace header; hardcoded to avoid depending on the full
// containerd client module for a single metadata key.
const containerdNamespaceHeader = "containerd-namespace"

// shiftedIDThreshold is the first UID/GID that cannot legitimately exist inside
// a sysbox sandbox: sysbox maps exactly 64K IDs (0-65535) into the container's
// user namespace, so any on-disk ID at or above 65536 is leaked host-side
// ownership from the uid-shifting machinery.
const shiftedIDThreshold = 65536

var containerdAddressCandidates = []string{
	"/run/containerd/containerd.sock",        // standard docker-ce setup (dockerd --containerd=...)
	"/run/docker/containerd/containerd.sock", // dockerd-managed embedded containerd
}

func resolveContainerdAddress(configured string) string {
	if configured != "" {
		return configured
	}
	for _, addr := range containerdAddressCandidates {
		if _, err := os.Stat(addr); err == nil {
			return addr
		}
	}
	return ""
}

// sysboxRuntimeName is the runtime name sysbox registers under in dockerd;
// keep in sync with the fleet's CONTAINER_RUNTIME.
const sysboxRuntimeName = "sysbox-runc"

// isSysboxContainer reports whether the container runs under the sysbox
// runtime. The uid-shifting concerns handled here are sysbox-specific: other
// runtimes (kata VMs, plain runc) can hold legitimate >65535 IDs, so both the
// settle-wait and the ownership verification are scoped to sysbox.
func isSysboxContainer(c *container.InspectResponse) bool {
	return c != nil && c.ContainerJSONBase != nil && c.HostConfig != nil &&
		c.HostConfig.Runtime == sysboxRuntimeName
}

func (d *DockerClient) containerdTasksClient() (tasksapi.TasksClient, error) {
	if d.containerdAddress == "" {
		return nil, fmt.Errorf("no containerd socket available (set CONTAINERD_ADDRESS)")
	}

	d.containerdConnMu.Lock()
	defer d.containerdConnMu.Unlock()

	if d.containerdConn == nil {
		conn, err := grpc.NewClient("unix://"+d.containerdAddress, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err != nil {
			return nil, fmt.Errorf("failed to create containerd client for %s: %w", d.containerdAddress, err)
		}
		d.containerdConn = conn
	}

	return tasksapi.NewTasksClient(d.containerdConn), nil
}

// awaitSysboxRootfsSettled blocks until containerd no longer has a task for the
// container. Sysbox reverts the rootfs ownership and syncs relocated volumes
// back inside sysbox-runc's Destroy (i.e. `runc delete`), and containerd only
// removes the task once that delete returns — so a missing task proves the
// rootfs is back in its canonical state. Bounded by ctx (the backup timeout).
func (d *DockerClient) awaitSysboxRootfsSettled(ctx context.Context, c *container.InspectResponse) error {
	startTime := time.Now()
	defer func() {
		obs, err := common.ContainerOperationDuration.GetMetricWithLabelValues("sysbox_settle_wait")
		if err == nil {
			obs.Observe(time.Since(startTime).Seconds())
		}
	}()

	tasks, err := d.containerdTasksClient()
	if err != nil {
		return err
	}

	ctx = metadata.AppendToOutgoingContext(ctx, containerdNamespaceHeader, d.containerdNamespace)

	// The cleanup takes seconds to minutes on write-heavy sandboxes (measured
	// ~27s for a 1M-file layer), so poll gently: react fast when it is already
	// done, back off while it runs.
	delay := 250 * time.Millisecond
	const maxDelay = 5 * time.Second

	start := time.Now()
	waited := false
	var lastErr error
	for {
		_, err := tasks.Get(ctx, &tasksapi.GetRequest{ContainerID: c.ID})
		switch status.Code(err) {
		case codes.OK:
			// Task still exists; cleanup is still running. Keep waiting.
		case codes.NotFound:
			if waited {
				d.logger.InfoContext(ctx, "Sandbox runtime cleanup settled", "containerId", c.ID[:12], "waited", time.Since(start).Round(time.Millisecond).String())
			}
			return nil
		case codes.Unavailable, codes.DeadlineExceeded:
			// Transient containerd errors are retried until the deadline; the
			// ownership verification downstream guarantees correctness.
			lastErr = err
		default:
			// PermissionDenied/Unimplemented/etc. mean a misconfigured socket or
			// namespace; retrying would only burn the backup timeout.
			return fmt.Errorf("containerd task lookup failed for %s: %w", c.ID[:12], err)
		}

		if !waited {
			waited = true
			d.logger.InfoContext(ctx, "Waiting for sandbox runtime cleanup before commit", "containerId", c.ID[:12])
		}

		select {
		case <-ctx.Done():
			if lastErr != nil {
				return fmt.Errorf("timed out waiting for sandbox runtime cleanup: %w (last containerd error: %s)", ctx.Err(), lastErr)
			}
			return fmt.Errorf("timed out waiting for sandbox runtime cleanup: %w", ctx.Err())
		case <-time.After(delay):
			delay = min(delay*2, maxDelay)
		}
	}
}

// checkOwnership fails when the entry is owned by an ID that cannot exist
// inside a sysbox sandbox.
func checkOwnership(path string, info fs.FileInfo) error {
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return fmt.Errorf("failed to read ownership of %s", path)
	}
	if st.Uid >= shiftedIDThreshold || st.Gid >= shiftedIDThreshold {
		return fmt.Errorf("%s is owned by %d:%d, which is outside the sandbox's user namespace (sysbox uid-shift not reverted)", path, st.Uid, st.Gid)
	}
	return nil
}

// verifySlots caps full-parallelism verifications; without a free slot a verify
// degrades to a single-threaded walk instead of waiting, so no backup ever
// blocks on another container's scan.
var verifySlots = make(chan struct{}, 2)

// verifyNoShiftedIDs walks dir and fails on the first entry owned by an ID that
// cannot exist inside a sysbox sandbox. Symlinks are checked but not followed.
// Parallel walk: ~1.5s warm for a 1M-entry layer; violations early-exit.
func verifyNoShiftedIDs(ctx context.Context, dir string) error {
	workers := 1
	select {
	case verifySlots <- struct{}{}:
		defer func() { <-verifySlots }()
		workers = min(8, runtime.NumCPU())
	default:
		// No slot free: degrade instead of waiting.
	}

	conf := fastwalk.Config{NumWorkers: workers}
	// Fail closed on any error — even ENOENT means an incomplete scan over an
	// immutable committed layer. A returned error stops the walk.
	return fastwalk.Walk(&conf, dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		return checkOwnership(path, info)
	})
}

// verifyBackupOwnership checks the committed backup image's top layer for
// leaked host-side ownership and fails (removing the image) if any is found.
// This is the artifact-level gate: no poisoned backup can reach the registry
// regardless of which mechanism above regressed.
func (d *DockerClient) verifyBackupOwnership(ctx context.Context, containerId, imageName string) error {
	startTime := time.Now()
	defer func() {
		obs, err := common.ContainerOperationDuration.GetMetricWithLabelValues("backup_verify")
		if err == nil {
			obs.Observe(time.Since(startTime).Seconds())
		}
	}()

	img, err := d.apiClient.ImageInspect(ctx, imageName)
	if err != nil {
		return fmt.Errorf("failed to inspect committed image %s: %w", imageName, err)
	}

	upperDir, ok := img.GraphDriver.Data["UpperDir"]
	if !ok || upperDir == "" {
		return fmt.Errorf("committed image %s has no top layer directory to verify (driver %s)", imageName, img.GraphDriver.Name)
	}

	if err := verifyNoShiftedIDs(ctx, upperDir); err != nil {
		// The counter is the alert signal; the log carries the affected container.
		common.BackupOwnershipRejectedCount.Inc()
		d.logger.ErrorContext(ctx, "Backup rejected: committed layer contains host-shifted ownership", "containerId", containerId, "image", imageName, "error", err)
		if rmErr := d.RemoveImage(ctx, imageName, true); rmErr != nil {
			d.logger.ErrorContext(ctx, "Failed to remove backup image that failed ownership verification", "image", imageName, "error", rmErr)
		}
		return fmt.Errorf("backup image %s failed ownership verification and was discarded: %w", imageName, err)
	}

	return nil
}
