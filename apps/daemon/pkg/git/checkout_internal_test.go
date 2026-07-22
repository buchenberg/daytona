package git

import (
	"errors"
	"os/exec"
	"testing"

	go_git "github.com/go-git/go-git/v5"
)

func TestCheckout_UnknownBranchReturnsBranchNotFound(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git binary not available")
	}
	dir := initRepoWithCommit(t)
	svc := &Service{WorkDir: dir}

	err := svc.Checkout("this-branch-does-not-exist-xyz")
	if err == nil {
		t.Fatal("expected error for non-existent branch, got nil")
	}
	if !errors.Is(err, go_git.ErrBranchNotFound) {
		t.Fatalf("expected go_git.ErrBranchNotFound, got %v", err)
	}
}

func TestCheckout_GarbageInputDoesNotSilentlySucceed(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git binary not available")
	}
	dir := initRepoWithCommit(t)
	svc := &Service{WorkDir: dir}

	err := svc.Checkout("1234")
	if err == nil {
		t.Fatal("expected error for unknown short hash, got nil")
	}
}

func TestLooksLikeHash(t *testing.T) {
	cases := map[string]bool{
		"":           false,
		"abc":        false, // too short
		"deadbeef":   false, // abbreviated hashes are not full SHA-1
		"DEADBEEF":   false,
		"not-a-hash": false,
		"master":     false,
		"feature/x":  false,
		"0123456789abcdef0123456789abcdef01234567":                         true,  // 40 hex (full SHA-1)
		"0123456789ABCDEF0123456789ABCDEF01234567":                         true,  // 40 hex, uppercase
		"0123456789abcdef0123456789abcdef012345678":                        false, // 41 hex (would truncate)
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": false, // 64 hex (would truncate)
	}
	for in, want := range cases {
		if got := looksLikeHash(in); got != want {
			t.Errorf("looksLikeHash(%q)=%v want %v", in, got, want)
		}
	}
}
