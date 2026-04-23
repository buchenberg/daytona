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
