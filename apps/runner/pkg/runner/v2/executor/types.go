package executor

import "github.com/daytonaio/runner/pkg/api/dto"

type StartSandboxPayload struct {
	AuthToken    *string           `json:"authToken,omitempty"`
	SecretsToken *string           `json:"secretsToken,omitempty"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

type SnapshotSandboxPayload struct {
	SandboxId      string           `json:"sandboxId"`
	Name           string           `json:"name"`
	OrganizationId string           `json:"organizationId"`
	Registry       *dto.RegistryDTO `json:"registry,omitempty"`
}
