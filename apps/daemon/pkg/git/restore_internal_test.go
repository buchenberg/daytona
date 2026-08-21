package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/daytonaio/daemon/pkg/gitprovider"
	"github.com/stretchr/testify/require"
)

// initRestoreRepo builds a repo where commit c1 has dir/a.txt and commit c2
// (HEAD) additionally has dir/b.txt, so HEAD~1 lacks b.txt.
func initRestoreRepo(t *testing.T) string {
	t.Helper()
	gitBin, err := exec.LookPath("git")
	if err != nil {
		t.Skipf("git not available: %v", err)
	}
	dir := t.TempDir()
	run := func(args ...string) {
		base := []string{"-C", dir, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false"}
		cmd := exec.Command(gitBin, append(base, args...)...)
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@test",
			"GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@test",
		)
		out, err := cmd.CombinedOutput()
		require.NoError(t, err, "git %v: %s", args, out)
	}
	run("init", "--initial-branch=main")
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "dir"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "dir", "a.txt"), []byte("old"), 0o644))
	run("add", "-A")
	run("commit", "-m", "c1")
	require.NoError(t, os.WriteFile(filepath.Join(dir, "dir", "b.txt"), []byte("new"), 0o644))
	run("add", "-A")
	run("commit", "-m", "c2")
	return dir
}

func TestRestoreFromSource_DeletesStaleWorktreeFileUnderDir(t *testing.T) {
	dir := initRestoreRepo(t)
	s := &Service{WorkDir: dir}

	require.NoError(t, s.Restore([]string{"dir"}, nil, boolPtr(true), "HEAD~1"))

	require.FileExists(t, filepath.Join(dir, "dir", "a.txt"))
	require.NoFileExists(t, filepath.Join(dir, "dir", "b.txt"))
}

func TestRestoreFromSource_RemovesPathAbsentFromSourceWithoutError(t *testing.T) {
	dir := initRestoreRepo(t)
	s := &Service{WorkDir: dir}

	require.NoError(t, s.Restore([]string{"dir/b.txt"}, nil, boolPtr(true), "HEAD~1"))

	require.NoFileExists(t, filepath.Join(dir, "dir", "b.txt"))
}

func TestRestoreFromSource_ErrorsWhenPathMatchesNothing(t *testing.T) {
	dir := initRestoreRepo(t)
	s := &Service{WorkDir: dir}

	err := s.Restore([]string{"does-not-exist"}, nil, boolPtr(true), "HEAD~1")
	require.Error(t, err)
}

func TestRestore_InvalidInputMapsToErrInvalidArgument(t *testing.T) {
	s := &Service{WorkDir: ""}
	require.ErrorIs(t, s.Restore([]string{"x"}, nil, nil, ""), ErrInvalidArgument)

	dir := initRestoreRepo(t)
	s = &Service{WorkDir: dir}
	require.ErrorIs(t, s.Restore(nil, nil, nil, ""), ErrInvalidArgument)
	require.ErrorIs(t, s.Restore([]string{"dir"}, boolPtr(false), boolPtr(false), ""), ErrInvalidArgument)
}

func TestBuildCloneArgs_OmitsDepthForCommitTarget(t *testing.T) {
	repo := &gitprovider.GitRepository{
		Url:    "https://example.com/x.git",
		Target: gitprovider.CloneTargetCommit,
		Sha:    "0123456789abcdef",
	}
	args := buildCloneArgs(repo, "/work", false, 5)
	require.NotContains(t, args, "--depth")
}

func TestBuildCloneArgs_AppliesDepthForBranchTarget(t *testing.T) {
	repo := &gitprovider.GitRepository{
		Url:    "https://example.com/x.git",
		Target: gitprovider.CloneTargetBranch,
		Branch: "main",
	}
	args := buildCloneArgs(repo, "/work", false, 5)
	require.Contains(t, args, "--depth")
}

func TestAssertSafeRefArg(t *testing.T) {
	require.NoError(t, assertSafeRefArg("remote", "origin"))
	require.NoError(t, assertSafeRefArg("remote", ""))
	require.NoError(t, assertSafeRefArg("branch", "feature/x"))
	require.ErrorIs(t, assertSafeRefArg("remote", "--dry-run"), ErrInvalidArgument)
	require.ErrorIs(t, assertSafeRefArg("branch", "-x"), ErrInvalidArgument)
}

func TestReset_KeepWithPathsMapsToErrInvalidArgument(t *testing.T) {
	dir := initRestoreRepo(t)
	s := &Service{WorkDir: dir}
	require.ErrorIs(t, s.Reset("keep", "HEAD", []string{"dir/a.txt"}), ErrInvalidArgument)
}
