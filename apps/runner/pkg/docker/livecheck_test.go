//go:build livecheck

// Temporary harness (not for CI): runs the real ownership-classification code
// against on-host overlay dirs. Build with `go test -c -tags livecheck`, run
// with VERIFY_UPPER / VERIFY_LOWERS pointing at a container's graph dirs.
package docker

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestLiveClassify(t *testing.T) {
	upper := os.Getenv("VERIFY_UPPER")
	if upper == "" {
		t.Skip("VERIFY_UPPER not set")
	}

	report := func(label, dir string) {
		err := verifyLayerOwnership(context.Background(), dir)
		var viol *ownershipViolation
		switch {
		case err == nil:
			fmt.Printf("%s: clean\n", label)
		case errors.As(err, &viol):
			class := "SHIFTED -> lineage check, else REJECT"
			if viol.wrapped {
				class = "WRAPPED -> ALLOW as-is"
			}
			fmt.Printf("%s: %s | %s\n", label, class, viol.Error())
		default:
			fmt.Printf("%s: walk error (fail closed): %v\n", label, err)
		}
	}

	report("UPPER", upper)
	for i, d := range strings.Split(os.Getenv("VERIFY_LOWERS"), ":") {
		if d != "" {
			report(fmt.Sprintf("LOWER[%d]", i), d)
		}
	}
}
