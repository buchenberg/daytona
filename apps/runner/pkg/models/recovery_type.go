package models

// RecoveryType represents the type of recovery operation
type RecoveryType string

const (
	RecoveryTypeStorageExpansion RecoveryType = "storage-expansion"
	UnknownRecoveryType          RecoveryType = ""
)
