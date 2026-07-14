package dto

type CreateSandboxDTO struct {
	Id string `json:"id" validate:"required"`
	// Name is the human-readable sandbox name. When present, it is used as the
	// network alias for link networks so linked sandboxes can resolve each other
	// by name.
	Name             string            `json:"name,omitempty"`
	FromVolumeId     string            `json:"fromVolumeId,omitempty"`
	UserId           string            `json:"userId" validate:"required"`
	Snapshot         string            `json:"snapshot" validate:"required"`
	OsUser           string            `json:"osUser" validate:"required"`
	CpuQuota         int64             `json:"cpuQuota" validate:"min=1"`
	GpuQuota         int64             `json:"gpuQuota" validate:"min=0"`
	MemoryQuota      int64             `json:"memoryQuota" validate:"min=1"`
	StorageQuota     int64             `json:"storageQuota" validate:"min=1"`
	Env              map[string]string `json:"env,omitempty"`
	Registry         *RegistryDTO      `json:"registry,omitempty"`
	Entrypoint       []string          `json:"entrypoint,omitempty"`
	Volumes          []VolumeDTO       `json:"volumes,omitempty"`
	NetworkBlockAll  *bool             `json:"networkBlockAll,omitempty"`
	NetworkAllowList *string           `json:"networkAllowList,omitempty"`
	DomainAllowList  *string           `json:"domainAllowList,omitempty"`
	Metadata         map[string]string `json:"metadata,omitempty"`
	AuthToken        *string           `json:"authToken,omitempty"`
	// SecretsToken is a runner-only token used solely to resolve plaintext
	// secrets from the API (separate from AuthToken, which lives in the sandbox).
	SecretsToken *string `json:"secretsToken,omitempty"`
	OtelEndpoint *string `json:"otelEndpoint,omitempty"`
	SkipStart    *bool   `json:"skipStart,omitempty"`

	// Optional for backward compatibility, but when provided, indicates the class of sandbox to create.
	SandboxClass *string `json:"sandboxClass,omitempty"`

	// Nullable for backward compatibility
	OrganizationId *string `json:"organizationId,omitempty"`
	RegionId       *string `json:"regionId,omitempty"`

	// LinkedSandboxId identifies an existing sandbox this sandbox should be co-located with.
	// When set, the runner should attach both sandboxes to a shared local network so they can communicate.
	LinkedSandboxId *string `json:"linkedSandboxId,omitempty"`
} //	@name	CreateSandboxDTO

func (c *CreateSandboxDTO) IsAndroidSandbox() bool {
	if c.SandboxClass != nil && *c.SandboxClass == "android" {
		return true
	}
	return false
}

type ResizeSandboxDTO struct {
	Cpu      int64        `json:"cpu,omitempty" validate:"omitempty,min=1"`
	Gpu      int64        `json:"gpu,omitempty" validate:"omitempty,min=0"`
	Memory   int64        `json:"memory,omitempty" validate:"omitempty,min=1"`
	Disk     int64        `json:"disk,omitempty" validate:"omitempty,min=1"`
	Registry *RegistryDTO `json:"registry,omitempty"`
} //	@name	ResizeSandboxDTO

type UpdateNetworkSettingsDTO struct {
	NetworkBlockAll    *bool   `json:"networkBlockAll,omitempty"`
	NetworkAllowList   *string `json:"networkAllowList,omitempty"`
	DomainAllowList    *string `json:"domainAllowList,omitempty"`
	NetworkLimitEgress *bool   `json:"networkLimitEgress,omitempty"`
} //	@name	UpdateNetworkSettingsDTO

type UpdateSandboxSecretsDTO struct {
	// Env is the sandbox's full desired secret env: env var names mapped to
	// secret placeholder values. Replace semantics — placeholder-valued env
	// vars not present in the map are unset for newly spawned processes.
	Env map[string]string `json:"env"`
} //	@name	UpdateSandboxSecretsDTO

type RecoverSandboxDTO struct {
	FromVolumeId     string            `json:"fromVolumeId,omitempty"`
	UserId           string            `json:"userId" validate:"required"`
	Snapshot         *string           `json:"snapshot,omitempty"`
	OsUser           string            `json:"osUser" validate:"required"`
	CpuQuota         int64             `json:"cpuQuota" validate:"min=1"`
	GpuQuota         int64             `json:"gpuQuota" validate:"min=0"`
	MemoryQuota      int64             `json:"memoryQuota" validate:"min=1"`
	StorageQuota     int64             `json:"storageQuota" validate:"min=1"`
	Env              map[string]string `json:"env,omitempty"`
	Volumes          []VolumeDTO       `json:"volumes,omitempty"`
	NetworkBlockAll  *bool             `json:"networkBlockAll,omitempty"`
	NetworkAllowList *string           `json:"networkAllowList,omitempty"`
	DomainAllowList  *string           `json:"domainAllowList,omitempty"`
	// At least one of ErrorReason or BackupErrorReason must yield a recovery type; both are optional.
	ErrorReason       string       `json:"errorReason,omitempty"`
	BackupErrorReason string       `json:"backupErrorReason,omitempty"`
	Registry          *RegistryDTO `json:"registry,omitempty"`
} //	@name	RecoverSandboxDTO

type IsRecoverableDTO struct {
	ErrorReason string `json:"errorReason" validate:"required"`
} //	@name	IsRecoverableDTO

type IsRecoverableResponse struct {
	Recoverable bool `json:"recoverable"`
} //	@name	IsRecoverableResponse
type StartSandboxResponse struct {
	DaemonVersion string `json:"daemonVersion"`
} //	@name	StartSandboxResponse

type StopSandboxDTO struct {
	Force bool `json:"force,omitempty"`
} //	@name	StopSandboxDTO
