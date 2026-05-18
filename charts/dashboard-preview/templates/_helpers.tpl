{{- define "dashboard-preview.name" -}}
dashboard-preview
{{- end }}

{{- define "dashboard-preview.fullname" -}}
{{ .Release.Name }}
{{- end }}

{{- define "dashboard-preview.labels" -}}
app.kubernetes.io/name: {{ include "dashboard-preview.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "dashboard-preview.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dashboard-preview.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "dashboard-preview.previewMetaAnnotations" -}}
daytona.io/branch-name: {{ default .Release.Name .Values.branchName | quote }}
{{- if .Values.repo }}
daytona.io/repo: {{ .Values.repo | quote }}
{{- end }}
{{- end }}
