// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package toolbox

type InitializeRequest struct {
	Token string `json:"token" binding:"required"`
} //	@name	InitializeRequest

type WorkDirResponse struct {
	Dir string `json:"dir" binding:"required"`
} //	@name	WorkDirResponse

type UserHomeDirResponse struct {
	Dir string `json:"dir" binding:"required"`
} //	@name	UserHomeDirResponse

type UpdateEnvRequest struct {
	// Set maps env var names to values applied to the daemon's process env, so
	// processes spawned after the call (exec, sessions, PTYs) inherit them.
	Set map[string]string `json:"set,omitempty"`
	// Unset lists env var names to remove before Set is applied.
	Unset []string `json:"unset,omitempty"`
	// UnsetValuePrefix removes every env var whose value has this prefix and
	// whose name is not a key of Set, before Set is applied. Used to reconcile
	// secret placeholder vars without the caller knowing the daemon's env.
	UnsetValuePrefix string `json:"unsetValuePrefix,omitempty"`
} //	@name	UpdateEnvRequest
