package coderun

import "strings"

func formatArgv(argv []string) string {
	if len(argv) == 0 {
		return ""
	}

	return strings.Join(argv, " ")
}
