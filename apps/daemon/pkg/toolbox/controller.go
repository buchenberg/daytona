package toolbox

import (
	"net/http"
	"os"
	"strings"

	common_errors "github.com/daytonaio/common-go/pkg/errors"
	"github.com/daytonaio/daemon/internal"
	"github.com/gin-gonic/gin"
)

// Initialize godoc
//
//	@Summary		Initialize toolbox server
//	@Description	Set the auth token and initialize telemetry for the toolbox server
//	@Tags			server
//	@Produce		json
//	@Param			request	body		InitializeRequest	true	"Initialization request"
//	@Success		200		{object}	map[string]string
//	@Router			/init [post]
//
//	@id				Initialize
func (s *server) Initialize(otelServiceName string, entrypointLogFilePath string, labels ResourceLabels) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var req InitializeRequest
		if err := ctx.ShouldBindJSON(&req); err != nil {
			ctx.Error(common_errors.NewInvalidBodyRequestError(err))
			return
		}

		s.authToken = req.Token

		err := s.initTelemetry(ctx.Request.Context(), otelServiceName, entrypointLogFilePath, labels)
		if err != nil {
			ctx.Error(common_errors.NewBadRequestError(err))
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"message": "Auth token set and telemetry initialized successfully",
		})
	}
}

// UpdateEnv godoc
//
//	@Summary		Update process environment
//	@Description	Update the daemon's process environment. Newly spawned processes, sessions and PTYs inherit the change; already-running processes keep their environment.
//	@Tags			server
//	@Produce		json
//	@Param			request	body		UpdateEnvRequest	true	"Environment update request"
//	@Success		200		{object}	map[string]string
//	@Failure		400		{object}	common.ErrorResponse
//	@Failure		500		{object}	common.ErrorResponse
//	@Router			/env [post]
//
//	@id				UpdateEnv
func (s *server) UpdateEnv(ctx *gin.Context) {
	var req UpdateEnvRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.Error(common_errors.NewInvalidBodyRequestError(err))
		return
	}

	if req.UnsetValuePrefix != "" {
		for _, kv := range os.Environ() {
			key, value, ok := strings.Cut(kv, "=")
			if !ok || !strings.HasPrefix(value, req.UnsetValuePrefix) {
				continue
			}
			if _, kept := req.Set[key]; kept {
				continue
			}
			if err := os.Unsetenv(key); err != nil {
				ctx.Error(common_errors.NewInternalServerError(err))
				return
			}
		}
	}

	for _, key := range req.Unset {
		if err := os.Unsetenv(key); err != nil {
			ctx.Error(common_errors.NewInternalServerError(err))
			return
		}
	}

	for key, value := range req.Set {
		if err := os.Setenv(key, value); err != nil {
			ctx.Error(common_errors.NewInternalServerError(err))
			return
		}
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "Environment updated successfully",
	})
}

// GetWorkDir godoc
//
//	@Summary		Get working directory
//	@Description	Get the current working directory path. This is default directory used for running commands.
//	@Tags			info
//	@Produce		json
//	@Success		200	{object}	WorkDirResponse
//	@Router			/work-dir [get]
//
//	@id				GetWorkDir
func (s *server) GetWorkDir(ctx *gin.Context) {
	workDir := WorkDirResponse{
		Dir: s.WorkDir,
	}

	ctx.JSON(http.StatusOK, workDir)
}

// GetUserHomeDir godoc
//
//	@Summary		Get user home directory
//	@Description	Get the current user home directory path.
//	@Tags			info
//	@Produce		json
//	@Success		200	{object}	UserHomeDirResponse
//	@Router			/user-home-dir [get]
//
//	@id				GetUserHomeDir
func (s *server) GetUserHomeDir(ctx *gin.Context) {
	userHomeDir, err := os.UserHomeDir()
	if err != nil {
		ctx.Error(common_errors.NewInternalServerError(err))
		return
	}
	userHomeDirResponse := UserHomeDirResponse{
		Dir: userHomeDir,
	}

	ctx.JSON(http.StatusOK, userHomeDirResponse)
}

// GetVersion godoc
//
//	@Summary		Get version
//	@Description	Get the current daemon version
//	@Tags			info
//	@Produce		json
//	@Success		200	{object}	map[string]string
//	@Router			/version [get]
//
//	@id				GetVersion
func (s *server) GetVersion(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{
		"version": internal.Version,
	})
}
