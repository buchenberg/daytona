{{- define "docs-preview.name" -}}
docs-preview
{{- end }}

{{- define "docs-preview.fullname" -}}
{{ .Release.Name }}
{{- end }}

{{- define "docs-preview.labels" -}}
app.kubernetes.io/name: {{ include "docs-preview.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "docs-preview.selectorLabels" -}}
app.kubernetes.io/name: {{ include "docs-preview.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Pod annotations exposing the original branch name and source repo. Label
values can't hold '/', so we use annotations. branch-name always renders
(falling back to .Release.Name), repo only when set.
*/}}
{{- define "docs-preview.previewMetaAnnotations" -}}
daytona.io/branch-name: {{ default .Release.Name .Values.branchName | quote }}
{{- if .Values.repo }}
daytona.io/repo: {{ .Values.repo | quote }}
{{- end }}
{{- end }}
