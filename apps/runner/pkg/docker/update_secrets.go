// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strings"

	"github.com/daytonaio/daytona/libs/netleash/pkg/secrets"
	"github.com/daytonaio/runner/pkg/api/dto"
	"github.com/docker/docker/api/types/container"
)

// UpdateSandboxSecrets applies a changed secret env (env var -> placeholder) to a
// running sandbox without recreating its container:
//
//   - the shared proxy binding is re-registered so the injector drops its cached
//     resolution and picks up the new secret set immediately,
//   - the in-sandbox daemon's process env is updated so newly spawned processes
//     see the new placeholders (existing processes keep their env, as usual).
//
// The container's own Config.Env stays frozen; Start reconciles it from the
// API-provided secret env on the next restart. A sandbox created without any
// secrets has no proxy wiring (env, CA mount, binding) — that can only be
// applied by recreating the container, so such sandboxes are left untouched
// here and the change takes effect on the next restart.
func (d *DockerClient) UpdateSandboxSecrets(ctx context.Context, sandboxId string, req dto.UpdateSandboxSecretsDTO) error {
	c, err := d.ContainerInspect(ctx, sandboxId)
	if err != nil {
		return err
	}

	if !c.State.Running {
		// Nothing to push live; Start reconciles the container env on the next start.
		return nil
	}

	if !sandboxUsesSecrets(envSliceToMap(c.Config.Env)) {
		// Without proxy wiring in the container the placeholders could never
		// resolve, so don't surface them to processes either. Documented
		// behavior: restart the sandbox to apply.
		d.logger.InfoContext(ctx, "Sandbox container has no secret wiring; updated secrets take effect on next restart", "sandboxId", sandboxId)
		return nil
	}

	containerIP := GetContainerIpAddress(ctx, c)
	if containerIP == "" {
		return errors.New("sandbox IP not found? Is the sandbox started?")
	}

	d.refreshSandboxSecretBinding(ctx, c.ID, containerIP)

	if err := d.updateDaemonEnv(ctx, containerIP, req.Env, secrets.DaytonaPlaceholderPrefix); err != nil {
		return fmt.Errorf("failed to update daemon env: %w", err)
	}

	return nil
}

// syncSecretEnvOnStart reconciles a stopped container's env with the sandbox's
// desired secret env (env var -> placeholder, JSON-encoded in the start job's
// metadata). When they differ the container is recreated under the same ID with
// placeholders and proxy wiring (env + CA mount) added or removed to match. A
// restart is therefore what applies secret changes that could not be applied
// live — most importantly attaching the first secret to a sandbox created
// without any, which needs the full wiring.
func (d *DockerClient) syncSecretEnvOnStart(ctx context.Context, containerId string, c *container.InspectResponse, secretEnvsJSON string) (*container.InspectResponse, error) {
	var desired map[string]string
	if err := json.Unmarshal([]byte(secretEnvsJSON), &desired); err != nil {
		return nil, fmt.Errorf("invalid secretEnvs metadata: %w", err)
	}

	current := make(map[string]string)
	for k, v := range envSliceToMap(c.Config.Env) {
		if strings.HasPrefix(v, secrets.DaytonaPlaceholderPrefix) {
			current[k] = v
		}
	}

	if maps.Equal(current, desired) {
		return c, nil
	}

	d.logger.InfoContext(ctx, "Sandbox secret env changed while stopped; recreating container to apply",
		"containerId", containerId, "currentSecrets", len(current), "desiredSecrets", len(desired))

	// Rebuild the env: drop the old placeholders and previously injected wiring,
	// keep everything else in order, then append the desired placeholders and
	// (for secret-using sandboxes) fresh wiring. Wiring entries are recognized
	// by exact key and value match, so user-set proxy vars survive.
	wiring := d.secretProxyWiringEnv()
	newEnv := make([]string, 0, len(c.Config.Env)+len(desired)+len(wiring))
	for _, kv := range c.Config.Env {
		k, v, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(v, secrets.DaytonaPlaceholderPrefix) {
			continue
		}
		if injected, ok := wiring[k]; ok && v == injected {
			continue
		}
		newEnv = append(newEnv, kv)
	}
	for k, v := range desired {
		newEnv = append(newEnv, fmt.Sprintf("%s=%s", k, v))
	}
	newEnv = append(newEnv, d.secretProxyEnvVars(desired)...)

	caBind := d.secretProxyCABind(desired)

	return d.recreateContainerUnderSameID(ctx, containerId, "daytona-secret-env", c,
		func(cfg *container.Config) {
			cfg.Env = newEnv
		},
		func(hc *container.HostConfig) {
			binds := make([]string, 0, len(hc.Binds)+1)
			for _, b := range hc.Binds {
				if strings.HasSuffix(b, ":"+secretCAContainerPath+":ro") {
					continue
				}
				binds = append(binds, b)
			}
			if caBind != "" {
				binds = append(binds, caBind)
			}
			hc.Binds = binds
		})
}
