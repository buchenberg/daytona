// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package session

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"
)

func testSessionService(t *testing.T) *SessionService {
	t.Helper()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return NewSessionService(logger, t.TempDir(), 250*time.Millisecond, 25*time.Millisecond)
}

func requireCommandExit(t *testing.T, svc *SessionService, sessionID string, commandID string, timeout time.Duration) *Command {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		command, err := svc.GetSessionCommand(sessionID, commandID)
		if err != nil {
			t.Fatalf("get command %s: %v", commandID, err)
		}
		if command.ExitCode != nil {
			return command
		}
		time.Sleep(20 * time.Millisecond)
	}

	t.Fatalf("command %s did not finish within %s", commandID, timeout)
	return nil
}

func requireCommandStillRunning(t *testing.T, svc *SessionService, sessionID string, commandID string, holdFor time.Duration) {
	t.Helper()

	deadline := time.Now().Add(holdFor)
	for time.Now().Before(deadline) {
		command, err := svc.GetSessionCommand(sessionID, commandID)
		if err != nil {
			t.Fatalf("get command %s: %v", commandID, err)
		}
		if command.ExitCode != nil {
			t.Fatalf("command %s exited early with code %d", commandID, *command.ExitCode)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func createTestSession(t *testing.T, svc *SessionService, sessionID string) {
	t.Helper()

	if err := svc.Create(sessionID, false); err != nil {
		t.Fatalf("create session %s: %v", sessionID, err)
	}
	t.Cleanup(func() {
		_ = svc.Delete(context.Background(), sessionID)
	})
}

func TestExecuteSyncCommandSeesClosedStdin(t *testing.T) {
	svc := testSessionService(t)
	const sessionID = "sync-closed-stdin"
	createTestSession(t, svc, sessionID)

	resultCh := make(chan *SessionExecute, 1)
	errCh := make(chan error, 1)
	go func() {
		result, err := svc.Execute(
			sessionID,
			"",
			`if read -r value; then printf 'unexpected:%s\n' "$value"; else printf 'closed\n'; fi`,
			false,
			true,
			false,
			true,
		)
		if err != nil {
			errCh <- err
			return
		}
		resultCh <- result
	}()

	select {
	case err := <-errCh:
		t.Fatalf("execute sync command: %v", err)
	case result := <-resultCh:
		if result.ExitCode == nil || *result.ExitCode != 0 {
			t.Fatalf("expected exit code 0, got %#v", result.ExitCode)
		}
		if result.Output == nil || !strings.Contains(*result.Output, "closed") {
			t.Fatalf("expected closed-stdin output, got %#v", result.Output)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("sync command did not receive stdin EOF")
	}
}

func TestExecuteAsyncCommandWaitsForSendInput(t *testing.T) {
	svc := testSessionService(t)
	const sessionID = "async-held-stdin"
	createTestSession(t, svc, sessionID)

	result, err := svc.Execute(
		sessionID,
		"",
		`read -r value; printf 'received:%s\n' "$value"`,
		true,
		true,
		false,
		true,
	)
	if err != nil {
		t.Fatalf("execute async command: %v", err)
	}

	requireCommandStillRunning(t, svc, sessionID, result.CommandId, 300*time.Millisecond)

	if err := svc.SendInput(sessionID, result.CommandId, "payload from test"); err != nil {
		t.Fatalf("send input: %v", err)
	}

	command := requireCommandExit(t, svc, sessionID, result.CommandId, 2*time.Second)
	if command.ExitCode == nil || *command.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %#v", command.ExitCode)
	}

	logs, err := svc.GetSessionCommandLogs(sessionID, result.CommandId, nil, nil, FetchLogsOptions{IsCombinedOutput: true})
	if err != nil {
		t.Fatalf("read command logs: %v", err)
	}
	if !strings.Contains(string(logs), "received:payload from test") {
		t.Fatalf("expected sent input in logs, got %q", string(logs))
	}
}
