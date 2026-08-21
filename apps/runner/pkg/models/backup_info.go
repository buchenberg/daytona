package models

import (
	"github.com/daytonaio/runner/pkg/models/enums"
)

type BackupInfo struct {
	State    enums.BackupState
	Snapshot string
	Error    error
}
