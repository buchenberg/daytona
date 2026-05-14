{{/* vim: set filetype=mustache: */}}

{{/*
Expand the name of the chart.
*/}}
{{- define "preview.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name.
Truncated to 63 chars (DNS label limit).
*/}}
{{- define "preview.fullname" -}}
{{- if .Values.fullnameOverride -}}
  {{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
  {{- $name := default .Chart.Name .Values.nameOverride -}}
  {{- $rel  := .Release.Name | lower -}}
  {{- if contains $name $rel -}}
    {{- $rel | trunc 63 | trimSuffix "-" -}}
  {{- else -}}
    {{- printf "%s-%s" $rel $name | trunc 63 | trimSuffix "-" -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{/*
Chart label value.
*/}}
{{- define "preview.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Pod annotations exposing the original branch name and source repo. Label
values can't contain '/', so we use annotations. branch-name always renders
(falling back to branchSlug), repo only when set.
*/}}
{{- define "preview.previewMetaAnnotations" -}}
daytona.io/branch-name: {{ default .Values.branchSlug .Values.branchName | quote }}
{{- if .Values.repo }}
daytona.io/repo: {{ .Values.repo | quote }}
{{- end }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "preview.labels" -}}
helm.sh/chart: {{ include "preview.chart" . }}
{{ include "preview.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
daytona.io/branch-slug: {{ .Values.branchSlug | quote }}
{{- end }}

{{/*
Selector labels (used by Deployments / Services).
*/}}
{{- define "preview.selectorLabels" -}}
app.kubernetes.io/name: {{ include "preview.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Namespace helper.
*/}}
{{- define "preview.namespace" -}}
{{- .Release.Namespace | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{/*
Compute the image tag.
Per-service tag > global tag > v0.0.0-{branchSlug}-amd64.
Usage: {{ include "preview.imageTag" (dict "svcTag" .Values.services.api.image.tag "Values" .Values) }}
*/}}
{{- define "preview.imageTag" -}}
{{- if .svcTag -}}
  {{- .svcTag -}}
{{- else if .Values.image.tag -}}
  {{- .Values.image.tag -}}
{{- else -}}
  {{- printf "v0.0.0-%s-amd64" .Values.branchSlug -}}
{{- end -}}
{{- end }}

{{/*
Full image reference for a service.
Usage: {{ include "preview.image" (dict "repo" .Values.services.api.image.repository "svcTag" .Values.services.api.image.tag "Values" .Values) }}
*/}}
{{- define "preview.image" -}}
{{- printf "%s/%s:%s" .Values.image.registry .repo (include "preview.imageTag" (dict "svcTag" .svcTag "Values" .Values)) -}}
{{- end }}

{{/*
API hostname for this preview.
*/}}
{{- define "preview.apiHost" -}}
{{- printf "%s.%s" .Values.branchSlug .Values.apiDomain -}}
{{- end }}

{{/*
Proxy hostname for this preview.
*/}}
{{- define "preview.proxyHost" -}}
{{- printf "%s.%s" .Values.branchSlug .Values.proxyDomain -}}
{{- end }}

{{/*
Proxy wildcard hostname (for sandbox subdomains).
*/}}
{{- define "preview.proxyWildcardHost" -}}
{{- printf "*.%s.%s" .Values.branchSlug .Values.proxyDomain -}}
{{- end }}

{{/*
Service account name for a given service component.
Usage: {{ include "preview.serviceAccountName" (dict "ctx" . "component" "api") }}
*/}}
{{- define "preview.serviceAccountName" -}}
{{- $svc := index .ctx.Values.services .component -}}
{{- if $svc.serviceAccount.create -}}
  {{- default (printf "%s-%s" (include "preview.fullname" .ctx) .component) $svc.serviceAccount.name -}}
{{- else -}}
  {{- default "default" $svc.serviceAccount.name -}}
{{- end -}}
{{- end }}

{{/* ======================================================================
     SHARED ENV BLOCKS — avoids duplicating 80+ env vars across templates
     ====================================================================== */}}

{{/*
Database env vars (always from PostgreSQL subchart in preview).
*/}}
{{- define "preview.env.database" -}}
- name: DB_HOST
  value: {{ printf "%s-postgresql" .Release.Name | quote }}
- name: DB_PORT
  value: "5432"
- name: DB_DATABASE
  value: {{ .Values.postgresql.auth.database | default "daytona_preview" | quote }}
- name: DB_USERNAME
  value: {{ .Values.postgresql.auth.username | default "user" | quote }}
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ printf "%s-postgresql" .Release.Name }}
      key: password
- name: DB_QUERY_TIMEOUT_MS
  value: {{ .Values.services.api.env.DB_QUERY_TIMEOUT_MS | default "0" | quote }}
{{- end }}

{{/*
Redis env vars (always from Redis subchart in preview).
*/}}
{{- define "preview.env.redis" -}}
- name: REDIS_HOST
  value: {{ printf "%s-redis-master" .Release.Name | quote }}
- name: REDIS_PORT
  value: "6379"
{{- if .Values.redis.auth.enabled }}
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ printf "%s-redis" .Release.Name }}
      key: redis-password
{{- else }}
- name: REDIS_PASSWORD
  value: ""
{{- end }}
{{- end }}

{{/*
Full API env block — used by api-deployment and all migration jobs.
*/}}
{{- define "preview.env.api" -}}
# ---- Application ---------------------------------------------------------
- name: DEFAULT_RUNNER_NAME
  value: {{ .Values.runner.name | default "default" | quote }}
- name: ENVIRONMENT
  value: {{ .Values.services.api.env.ENVIRONMENT | default "preview" | quote }}
- name: PORT
  value: {{ .Values.services.api.env.PORT | default "3000" | quote }}
- name: OTEL_ENABLED
  value: {{ .Values.services.api.env.OTEL_ENABLED | default "false" | quote }}
- name: SKIP_USER_EMAIL_VERIFICATION
  value: {{ .Values.services.api.env.SKIP_USER_EMAIL_VERIFICATION | default "true" | quote }}
- name: NOTIFICATION_GATEWAY_DISABLED
  value: {{ .Values.services.api.env.NOTIFICATION_GATEWAY_DISABLED | default "true" | quote }}
- name: MAINTENANCE_MODE
  value: {{ .Values.services.api.env.MAINTENANCE_MODE | default "false" | quote }}
- name: DISABLE_CRON_JOBS
  value: {{ .Values.services.api.env.DISABLE_CRON_JOBS | default "false" | quote }}
- name: RUN_MIGRATIONS
  value: {{ .Values.services.api.env.RUN_MIGRATIONS | default "false" | quote }}
# ---- Database -------------------------------------------------------------
{{ include "preview.env.database" . }}
# ---- Redis ----------------------------------------------------------------
{{ include "preview.env.redis" . }}
# ---- Proxy ----------------------------------------------------------------
- name: PROXY_DOMAIN
  value: {{ include "preview.proxyHost" . | quote }}
- name: PROXY_PROTOCOL
  value: {{ .Values.services.proxy.env.PROXY_PROTOCOL | default "https" | quote }}
- name: PROXY_API_KEY
  value: {{ .Values.services.proxy.env.PROXY_API_KEY | default "preview_proxy_api_key" | quote }}
- name: PROXY_TEMPLATE_URL
  value: {{ printf "%s://{{PORT}}-{{sandboxId}}.%s" (.Values.services.proxy.env.PROXY_PROTOCOL | default "https") (include "preview.proxyHost" .) | quote }}
- name: PROXY_TOOLBOX_BASE_URL
  value: {{ printf "%s://%s" (.Values.services.proxy.env.PROXY_PROTOCOL | default "https") (include "preview.proxyHost" .) | quote }}
# ---- OIDC -----------------------------------------------------------------
- name: OIDC_CLIENT_ID
  value: {{ .Values.services.api.env.OIDC_CLIENT_ID | default "daytona" | quote }}
- name: OIDC_ISSUER_BASE_URL
  value: {{ .Values.services.api.env.OIDC_ISSUER_BASE_URL | default "" | quote }}
- name: OIDC_AUDIENCE
  value: {{ .Values.services.api.env.OIDC_AUDIENCE | default "daytona" | quote }}
# ---- Dashboard ------------------------------------------------------------
- name: DASHBOARD_URL
  value: {{ printf "https://%s/dashboard" (include "preview.apiHost" .) | quote }}
- name: DASHBOARD_BASE_API_URL
  value: {{ printf "https://%s" (include "preview.apiHost" .) | quote }}
# ---- Registry -------------------------------------------------------------
{{- $registryURL := "" }}
{{- $registryAdmin := "" }}
{{- $registryPassword := "" }}
{{- if .Values.registry.enabled }}
  {{- $registryURL = printf "http://%s-registry:%v" (include "preview.fullname" .) .Values.registry.service.port }}
  {{- $registryAdmin = .Values.registry.admin | default "admin" }}
  {{- $registryPassword = .Values.registry.password | default "password" }}
{{- end }}
- name: TRANSIENT_REGISTRY_URL
  value: {{ .Values.services.api.env.TRANSIENT_REGISTRY_URL | default $registryURL | quote }}
- name: TRANSIENT_REGISTRY_ADMIN
  value: {{ .Values.services.api.env.TRANSIENT_REGISTRY_ADMIN | default $registryAdmin | quote }}
- name: TRANSIENT_REGISTRY_PASSWORD
  value: {{ .Values.services.api.env.TRANSIENT_REGISTRY_PASSWORD | default $registryPassword | quote }}
- name: TRANSIENT_REGISTRY_PROJECT_ID
  value: {{ .Values.services.api.env.TRANSIENT_REGISTRY_PROJECT_ID | default "daytona" | quote }}
- name: INTERNAL_REGISTRY_URL
  value: {{ .Values.services.api.env.INTERNAL_REGISTRY_URL | default $registryURL | quote }}
- name: INTERNAL_REGISTRY_ADMIN
  value: {{ .Values.services.api.env.INTERNAL_REGISTRY_ADMIN | default $registryAdmin | quote }}
- name: INTERNAL_REGISTRY_PASSWORD
  value: {{ .Values.services.api.env.INTERNAL_REGISTRY_PASSWORD | default $registryPassword | quote }}
- name: INTERNAL_REGISTRY_PROJECT_ID
  value: {{ .Values.services.api.env.INTERNAL_REGISTRY_PROJECT_ID | default "daytona" | quote }}
# ---- S3 -------------------------------------------------------------------
{{- $s3Endpoint := "" }}
{{- $s3StsEndpoint := "" }}
{{- $s3Region := "" }}
{{- $s3AccessKey := "" }}
{{- $s3SecretKey := "" }}
{{- $s3Bucket := "" }}
{{- if .Values.minio.enabled }}
  {{- $minioBase := printf "http://%s-minio:%v" (include "preview.fullname" .) .Values.minio.service.port }}
  {{- $s3Endpoint = $minioBase }}
  {{- $s3StsEndpoint = printf "%s/minio/v1/assume-role" $minioBase }}
  {{- $s3Region = .Values.minio.region | default "us-east-1" }}
  {{- $s3AccessKey = .Values.minio.rootUser | default "minioadmin" }}
  {{- $s3SecretKey = .Values.minio.rootPassword | default "minioadmin" }}
  {{- $s3Bucket = .Values.minio.defaultBucket | default "daytona" }}
{{- end }}
- name: S3_ENDPOINT
  value: {{ .Values.services.api.env.S3_ENDPOINT | default $s3Endpoint | quote }}
- name: S3_STS_ENDPOINT
  value: {{ .Values.services.api.env.S3_STS_ENDPOINT | default $s3StsEndpoint | quote }}
- name: S3_REGION
  value: {{ .Values.services.api.env.S3_REGION | default $s3Region | quote }}
- name: S3_ACCESS_KEY
  value: {{ .Values.services.api.env.S3_ACCESS_KEY | default $s3AccessKey | quote }}
- name: S3_SECRET_KEY
  value: {{ .Values.services.api.env.S3_SECRET_KEY | default $s3SecretKey | quote }}
- name: S3_DEFAULT_BUCKET
  value: {{ .Values.services.api.env.S3_DEFAULT_BUCKET | default $s3Bucket | quote }}
- name: S3_ACCOUNT_ID
  value: {{ .Values.services.api.env.S3_ACCOUNT_ID | default "/" | quote }}
- name: S3_ROLE_NAME
  value: {{ .Values.services.api.env.S3_ROLE_NAME | default "/" | quote }}
# ---- Encryption -----------------------------------------------------------
- name: ENCRYPTION_KEY
  value: {{ .Values.services.api.env.ENCRYPTION_KEY | default "" | quote }}
- name: ENCRYPTION_SALT
  value: {{ .Values.services.api.env.ENCRYPTION_SALT | default "" | quote }}
# ---- Default Snapshot -----------------------------------------------------
- name: DEFAULT_SNAPSHOT
  value: {{ .Values.services.api.env.DEFAULT_SNAPSHOT | default "daytonaio/sandbox:0.6.0-slim" | quote }}
# ---- Runner ---------------------------------------------------------------
- name: DEFAULT_RUNNER_DOMAIN
  value: {{ printf "%s-runner:%s" (include "preview.fullname" .) (.Values.services.runner.service.port | toString) | quote }}
- name: DEFAULT_RUNNER_API_URL
  value: {{ printf "http://%s-runner:%s" (include "preview.fullname" .) (.Values.services.runner.service.port | toString) | quote }}
- name: DEFAULT_RUNNER_PROXY_URL
  value: {{ printf "http://%s-runner:%s" (include "preview.fullname" .) (.Values.services.runner.service.port | toString) | quote }}
- name: DEFAULT_RUNNER_API_KEY
  value: {{ .Values.runner.apiToken | default "preview_runner_token" | quote }}
- name: DEFAULT_RUNNER_CPU
  value: {{ .Values.runner.cpu | default 4 | quote }}
- name: DEFAULT_RUNNER_MEMORY
  value: {{ .Values.runner.memory | default 8 | quote }}
- name: DEFAULT_RUNNER_DISK
  value: {{ .Values.runner.disk | default 50 | quote }}
# ---- Admin ----------------------------------------------------------------
- name: ADMIN_API_KEY
  value: {{ .Values.services.api.env.ADMIN_API_KEY | default "" | quote }}
- name: ADMIN_TOTAL_CPU_QUOTA
  value: {{ .Values.services.api.env.ADMIN_TOTAL_CPU_QUOTA | default "10000" | quote }}
- name: ADMIN_TOTAL_MEMORY_QUOTA
  value: {{ .Values.services.api.env.ADMIN_TOTAL_MEMORY_QUOTA | default "10000" | quote }}
- name: ADMIN_TOTAL_DISK_QUOTA
  value: {{ .Values.services.api.env.ADMIN_TOTAL_DISK_QUOTA | default "100000" | quote }}
- name: ADMIN_MAX_CPU_PER_SANDBOX
  value: {{ .Values.services.api.env.ADMIN_MAX_CPU_PER_SANDBOX | default "100" | quote }}
- name: ADMIN_MAX_MEMORY_PER_SANDBOX
  value: {{ .Values.services.api.env.ADMIN_MAX_MEMORY_PER_SANDBOX | default "100" | quote }}
- name: ADMIN_MAX_DISK_PER_SANDBOX
  value: {{ .Values.services.api.env.ADMIN_MAX_DISK_PER_SANDBOX | default "1000" | quote }}
- name: ADMIN_SNAPSHOT_QUOTA
  value: {{ .Values.services.api.env.ADMIN_SNAPSHOT_QUOTA | default "1000" | quote }}
- name: ADMIN_MAX_SNAPSHOT_SIZE
  value: {{ .Values.services.api.env.ADMIN_MAX_SNAPSHOT_SIZE | default "1000" | quote }}
- name: ADMIN_VOLUME_QUOTA
  value: {{ .Values.services.api.env.ADMIN_VOLUME_QUOTA | default "10000" | quote }}
# ---- Org Quotas -----------------------------------------------------------
- name: DEFAULT_ORG_QUOTA_TOTAL_CPU_QUOTA
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_TOTAL_CPU_QUOTA | default "10000" | quote }}
- name: DEFAULT_ORG_QUOTA_TOTAL_MEMORY_QUOTA
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_TOTAL_MEMORY_QUOTA | default "10000" | quote }}
- name: DEFAULT_ORG_QUOTA_TOTAL_DISK_QUOTA
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_TOTAL_DISK_QUOTA | default "100000" | quote }}
- name: DEFAULT_ORG_QUOTA_MAX_CPU_PER_SANDBOX
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_MAX_CPU_PER_SANDBOX | default "100" | quote }}
- name: DEFAULT_ORG_QUOTA_MAX_MEMORY_PER_SANDBOX
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_MAX_MEMORY_PER_SANDBOX | default "100" | quote }}
- name: DEFAULT_ORG_QUOTA_MAX_DISK_PER_SANDBOX
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_MAX_DISK_PER_SANDBOX | default "1000" | quote }}
- name: DEFAULT_ORG_QUOTA_SNAPSHOT_QUOTA
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_SNAPSHOT_QUOTA | default "1000" | quote }}
- name: DEFAULT_ORG_QUOTA_MAX_SNAPSHOT_SIZE
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_MAX_SNAPSHOT_SIZE | default "1000" | quote }}
- name: DEFAULT_ORG_QUOTA_VOLUME_QUOTA
  value: {{ .Values.services.api.env.DEFAULT_ORG_QUOTA_VOLUME_QUOTA | default "10000" | quote }}
- name: DEFAULT_REGION_ENFORCE_QUOTAS
  value: {{ .Values.services.api.env.DEFAULT_REGION_ENFORCE_QUOTAS | default "false" | quote }}
# ---- Health / SMTP --------------------------------------------------------
- name: HEALTH_CHECK_API_KEY
  value: {{ .Values.services.api.env.HEALTH_CHECK_API_KEY | default "preview_health_check_key" | quote }}
- name: RUNNER_AVAILABILITY_SCORE_THRESHOLD
  value: {{ .Values.services.api.env.RUNNER_AVAILABILITY_SCORE_THRESHOLD | default "0" | quote }}
- name: SMTP_HOST
  value: {{ .Values.services.api.env.SMTP_HOST | default "" | quote }}
- name: SMTP_PORT
  value: {{ .Values.services.api.env.SMTP_PORT | default "" | quote }}
- name: SMTP_USER
  value: {{ .Values.services.api.env.SMTP_USER | default "" | quote }}
- name: SMTP_PASSWORD
  value: {{ .Values.services.api.env.SMTP_PASSWORD | default "" | quote }}
- name: SMTP_SECURE
  value: {{ .Values.services.api.env.SMTP_SECURE | default "" | quote }}
- name: SMTP_EMAIL_FROM
  value: {{ .Values.services.api.env.SMTP_EMAIL_FROM | default "" | quote }}
# ---- SSH Gateway ----------------------------------------------------------
- name: SSH_GATEWAY_API_KEY
  value: {{ .Values.services.api.env.SSH_GATEWAY_API_KEY | default "preview_ssh_gateway_api_key" | quote }}
{{- if .Values.services.api.extraEnv }}
{{ toYaml .Values.services.api.extraEnv }}
{{- end }}
{{- end }}
