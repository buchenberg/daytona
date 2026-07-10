// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"runtime"
	"strings"
	"sync"
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

// Sysbox fakes the sandbox's user namespace mapping by chowning the overlayfs
// upper layer by +offset on start and -offset on stop/pause, with no per-file
// bookkeeping. A commit that reads the layer while shifted bakes host UIDs
// into the backup image; restored files map to nobody:nogroup and the sandbox
// cannot boot. Two mechanisms keep that out of the registry:
//
//   - awaitSysboxRootfsSettled: a stopped container is committed only once
//     containerd has deleted its task — sysbox's revert runs inside
//     `runc delete`, which the task deletion blocks on.
//   - verifyBackupOwnership: a committed top layer still holding
//     out-of-namespace IDs is rejected, unless the corruption provably
//     predates the commit — then no retry can do better and it is pushed
//     as-is.

// containerd's gRPC namespace header; hardcoded to avoid depending on the full
// containerd client module for a single metadata key.
const containerdNamespaceHeader = "containerd-namespace"

// Sysbox maps exactly 64K IDs (0-65535) into the sandbox, so any on-disk ID
// at or above shiftedIDThreshold is corruption, in two non-overlapping bands
// (subuid offsets sit far below 2^31; wraps land within one offset of 2^32):
//
//   - shifted [65536, 2^31): uid+offset — the commit raced sysbox's revert;
//     a retry after the revert can produce a clean backup.
//   - wrapped [2^31, 2^32): uid-offset underflowed uint32 — sysbox reverted
//     a file it never shifted up; the damage is on the container's disk and
//     no retry can fix it.
const (
	shiftedIDThreshold = 65536
	wrappedIDFloor     = 1 << 31
)

func inShiftedBand(id uint32) bool {
	return id >= shiftedIDThreshold && id < wrappedIDFloor
}

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

// ownershipViolation is an entry owned by an out-of-namespace ID; a distinct
// type so callers can tell a confirmed violation from a walk failure, which
// must keep failing closed.
type ownershipViolation struct {
	path     string
	uid, gid uint32
	wrapped  bool // no ID in the shifted band
}

func (e *ownershipViolation) Error() string {
	kind := "sysbox uid-shift not reverted"
	if e.wrapped {
		kind = "sysbox uid-shift revert wrapped below zero"
	}
	return fmt.Sprintf("%s is owned by %d:%d, which is outside the sandbox's user namespace (%s)", e.path, e.uid, e.gid, kind)
}

// checkOwnership fails when the entry is owned by an ID that cannot exist
// inside a sysbox sandbox.
func checkOwnership(path string, info fs.FileInfo) error {
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return fmt.Errorf("failed to read ownership of %s", path)
	}
	if st.Uid < shiftedIDThreshold && st.Gid < shiftedIDThreshold {
		return nil
	}
	return &ownershipViolation{
		path: path, uid: st.Uid, gid: st.Gid,
		wrapped: !inShiftedBand(st.Uid) && !inShiftedBand(st.Gid),
	}
}

// verifySlots caps full-parallelism verifications; without a free slot a verify
// degrades to a single-threaded walk instead of waiting, so no backup ever
// blocks on another container's scan.
var verifySlots = make(chan struct{}, 2)

// verifyLayerOwnership walks dir (~1.5s warm per 1M entries) and returns an
// *ownershipViolation for any entry owned by an out-of-namespace ID. A
// shifted-band violation early-exits; a wrapped one is recorded and the walk
// continues, so a wrapped result guarantees no shifted-band entry exists
// anywhere in the layer (shifted is the stronger signal: it can mean a live
// commit race, wrapped cannot).
func verifyLayerOwnership(ctx context.Context, dir string) error {
	workers := 1
	select {
	case verifySlots <- struct{}{}:
		defer func() { <-verifySlots }()
		workers = min(8, runtime.NumCPU())
	default:
		// No slot free: degrade instead of waiting.
	}

	var mu sync.Mutex
	var wrapped *ownershipViolation

	conf := fastwalk.Config{NumWorkers: workers}
	// Fail closed on any error — even ENOENT means an incomplete scan over an
	// immutable committed layer. A returned error stops the walk.
	err := fastwalk.Walk(&conf, dir, func(path string, entry fs.DirEntry, err error) error {
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
		err = checkOwnership(path, info)
		var viol *ownershipViolation
		if errors.As(err, &viol) && viol.wrapped {
			mu.Lock()
			if wrapped == nil {
				wrapped = viol
			}
			mu.Unlock()
			return nil
		}
		return err
	})
	if err == nil && wrapped != nil {
		return wrapped
	}
	return err
}

// verifyBackupOwnership checks the committed backup image's top layer for
// out-of-namespace ownership and fails (removing the image) if any is found,
// unless the corruption predates this commit — then the backup is pushed
// as-is. No new poisoning reaches the registry regardless of which mechanism
// above regressed.
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

	if err := verifyLayerOwnership(ctx, upperDir); err != nil {
		// Reject only what a retry can fix. Wrapped IDs (a revert underflow
		// from a previous run, never a commit race) and shifted IDs already
		// present in the container's base layers (restored from a backup
		// poisoned before verification existed) predate this commit — every
		// retry would hit the same on-disk damage, so push those as-is.
		// Shifted IDs over a clean base are a live commit race: fail closed.
		var viol *ownershipViolation
		if errors.As(err, &viol) {
			if viol.wrapped {
				common.BackupOwnershipPreexistingAllowedCount.Inc()
				d.logger.WarnContext(ctx, "Backup layer contains revert-wrapped ownership from a previous sandbox run; pushing as-is", "containerId", containerId, "image", imageName, "violation", err.Error())
				return nil
			}
			basePath, baseErr := d.poisonedBaseLayerPath(ctx, containerId)
			if baseErr != nil {
				d.logger.ErrorContext(ctx, "Failed to scan base layers for pre-existing shifted ownership; failing closed", "containerId", containerId, "image", imageName, "error", baseErr)
			} else if basePath != "" {
				common.BackupOwnershipPreexistingAllowedCount.Inc()
				d.logger.WarnContext(ctx, "Backup layer contains shifted ownership inherited from a pre-verification backup; pushing as-is", "containerId", containerId, "image", imageName, "violation", err.Error(), "baseLayerEvidence", basePath)
				return nil
			}
		}

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

// poisonedBaseLayerPath walks the container's lower layers (its original
// rootfs — also correct for the export/import fallback, whose committed image
// has no lowers) and returns the first out-of-namespace-owned path, or "" if
// they are clean. Only called after the top layer failed verification; a
// poisoned base typically early-exits in milliseconds. Errors other than a
// confirmed violation are returned so the caller fails closed.
func (d *DockerClient) poisonedBaseLayerPath(ctx context.Context, containerId string) (string, error) {
	// Generous cap — a timeout fails closed and would misclassify a poisoned
	// base as new corruption, so it only guards against a pathological image
	// or stuck I/O eating the backup window.
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	c, err := d.ContainerInspect(ctx, containerId)
	if err != nil {
		return "", fmt.Errorf("failed to inspect container %s for base layer scan: %w", containerId, err)
	}
	lowerDirs := c.GraphDriver.Data["LowerDir"]
	if lowerDirs == "" {
		return "", nil
	}
	for _, dir := range strings.Split(lowerDirs, ":") {
		err := verifyLayerOwnership(ctx, dir)
		if err == nil {
			continue
		}
		var viol *ownershipViolation
		if errors.As(err, &viol) {
			return viol.path, nil
		}
		return "", fmt.Errorf("failed to scan base layer %s: %w", dir, err)
	}
	return "", nil
}
