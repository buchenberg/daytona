package models

import "github.com/daytonaio/runner/pkg/models/enums"

type SandboxInfo struct {
	SandboxState      enums.SandboxState
	BackupState       enums.BackupState
	BackupSnapshot    string
	BackupErrorReason *string
}
