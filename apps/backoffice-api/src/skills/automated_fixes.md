# Automated Code Fixes (Daytona Sandbox + GitHub PR)

Use the `create_fix_pr` tool to autonomously fix code issues by spinning up a
Daytona sandbox with Claude Agent, making changes, and opening a pull request.

## When to Use

Use `create_fix_pr` when you have identified a **code-level issue** through
monitoring data and have enough context to describe what needs fixing:

- Recurring error patterns visible in Loki logs or OpenSearch audit logs
- Specific error messages with clear root causes
- Configuration issues identifiable from metrics or database state
- Performance regressions traceable to specific code paths

## When NOT to Use

Do not use for:

- Infrastructure issues (scaling, networking, DNS) — these need ops, not code
- Issues where the root cause is unclear — investigate further first
- Data issues (wrong DB records) — use SQL/manual intervention
- Urgent production outages — alert humans instead

## How to Write a Good Task

The `task` parameter should include:

1. **What is broken** — the symptom observed in monitoring
2. **Root cause** — your analysis of why it's happening
3. **What to change** — specific guidance on the fix
4. **Where in the code** — file paths or module names if known

The `context` parameter should include raw monitoring evidence:

- Error messages / stack traces from Loki or OpenSearch
- Metric values from Prometheus
- Relevant database records
- PostHog event patterns

## Example

```
task: "Fix the sandbox creation error handler to properly retry on transient
runner allocation failures. Currently, when a runner returns a 503 during
sandbox creation, the error is treated as permanent and the sandbox moves to
error state instead of retrying."

context: "Loki logs show 1,200 sandbox creation failures in the last 6 hours
with error: 'runner allocation failed: 503 Service Unavailable'. PostHog shows
api_sandbox_creation_failed events spiked 3x. The retry logic in the sandbox
creation service should catch 503 responses and retry up to 3 times with
exponential backoff."
```

## Process

1. Gather monitoring context (logs, metrics, errors) using other tools first.
2. Analyze the root cause.
3. Call `create_fix_pr` with a clear task and supporting context.
4. Report the PR URL to the user with a summary of what was changed.
5. The sandbox is automatically cleaned up after the PR is created.
