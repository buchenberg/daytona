package common

import (
	"time"
)

// SourceDaemon identifies error responses that originate from the in-sandbox
// daemon. It is the single source of truth for the wire envelope's "source".
const SourceDaemon = "DAYTONA_DAEMON"

// DaemonErrorCode is the machine-readable code emitted by the daemon for
// conditions where SDK callers need to branch beyond the HTTP status.
type DaemonErrorCode string // @name DaemonErrorCode

const (
	CodeGitAuthFailed     DaemonErrorCode = "GIT_AUTH_FAILED"
	CodeGitRepoNotFound   DaemonErrorCode = "GIT_REPO_NOT_FOUND"
	CodeGitBranchNotFound DaemonErrorCode = "GIT_BRANCH_NOT_FOUND"
	CodeGitBranchExists   DaemonErrorCode = "GIT_BRANCH_EXISTS"
	CodeGitPushRejected   DaemonErrorCode = "GIT_PUSH_REJECTED"
	CodeGitDirtyWorktree  DaemonErrorCode = "GIT_DIRTY_WORKTREE"
	CodeGitMergeConflict  DaemonErrorCode = "GIT_MERGE_CONFLICT"

	CodeFileNotFound     DaemonErrorCode = "FILE_NOT_FOUND"
	CodeFileAccessDenied DaemonErrorCode = "FILE_ACCESS_DENIED"
	CodeInvalidFilePath  DaemonErrorCode = "INVALID_FILE_PATH"
	CodeFileReadFailed   DaemonErrorCode = "FILE_READ_FAILED"

	CodeLspServerNotInitialized DaemonErrorCode = "LSP_SERVER_NOT_INITIALIZED"

	CodeProcessExecutionTimeout DaemonErrorCode = "PROCESS_EXECUTION_TIMEOUT"
	CodeProcessNotFound         DaemonErrorCode = "PROCESS_NOT_FOUND"
	CodeSessionEnded            DaemonErrorCode = "SESSION_ENDED"
	CodeCommandAlreadyCompleted DaemonErrorCode = "COMMAND_ALREADY_COMPLETED"

	CodeA11yUnavailable         DaemonErrorCode = "A11Y_UNAVAILABLE"
	CodeRecordingStillActive    DaemonErrorCode = "RECORDING_STILL_ACTIVE"
	CodeRecordingFfmpegNotFound DaemonErrorCode = "RECORDING_FFMPEG_NOT_FOUND"

	// HTTP-level codes emitted by the shared common-go error middleware. They
	// are mirrored here so the generated DaemonErrorCode enum covers every code
	// the daemon can actually return, not just the domain-specific ones above.
	CodeBadRequest          DaemonErrorCode = "BAD_REQUEST"
	CodeInvalidRequestBody  DaemonErrorCode = "INVALID_REQUEST_BODY"
	CodeUnauthorized        DaemonErrorCode = "UNAUTHORIZED"
	CodeForbidden           DaemonErrorCode = "FORBIDDEN"
	CodeNotFound            DaemonErrorCode = "NOT_FOUND"
	CodeConflict            DaemonErrorCode = "CONFLICT"
	CodeRequestTimeout      DaemonErrorCode = "REQUEST_TIMEOUT"
	CodeGone                DaemonErrorCode = "GONE"
	CodeUnprocessableEntity DaemonErrorCode = "UNPROCESSABLE_ENTITY"
	CodeInternalServerError DaemonErrorCode = "INTERNAL_SERVER_ERROR"
)

// ErrorResponse is a daemon-local copy of common-go's ErrorResponse so swaggo
// emits a typed DaemonErrorCode enum reference.
//
//	@Description	Error response
//	@Schema			ErrorResponse
type ErrorResponse struct {
	StatusCode int             `json:"statusCode" example:"400" binding:"required"`
	Message    string          `json:"message" example:"Bad request" binding:"required"`
	Source     string          `json:"source,omitempty" example:"DAYTONA_DAEMON"`
	Code       DaemonErrorCode `json:"code,omitempty" example:"GIT_REPO_NOT_FOUND"`
	Timestamp  time.Time       `json:"timestamp" example:"2023-01-01T12:00:00Z" binding:"required"`
	Path       string          `json:"path" example:"/api/resource" binding:"required"`
	Method     string          `json:"method,omitempty" example:"GET"`
} //	@name	ErrorResponse
