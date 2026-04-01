# Incident Response Workflow

When a user asks about an ongoing incident, outage, or production issue that
needs coordinated response, follow this structured 4-phase workflow.

## Phase 1: TRIAGE

Assess severity and scope using available tools:

1. **Check firing alerts**: `get_firing_alerts` for active Grafana alerts
2. **Check error rates**: query Prometheus for 5xx rates across services
3. **Check logs**: query Loki for panic/fatal/error patterns across all deployments
4. **Check audit logs**: query OpenSearch for recent failed actions

### Severity Classification

| Severity | Criteria | Expected Response |
|----------|----------|-------------------|
| SEV1 | Service down, all users affected | Immediate, all-hands |
| SEV2 | Major feature degraded, many users affected | Within 15 min |
| SEV3 | Minor feature issue, some users affected | Within 1 hour |
| SEV4 | Cosmetic or low-impact issue | Next business day |

Classify based on: user impact scope, revenue impact, data integrity risk.

## Phase 2: INVESTIGATE

Build a timeline of what happened:

1. **Correlate across datasources** — check if errors in Loki align with metric
   anomalies in Prometheus and audit log patterns in OpenSearch
2. **Identify the blast radius** — which orgs, regions, sandbox types are affected
3. **Find the trigger** — check recent deployments, config changes, or traffic spikes
4. **Quantify impact** — count affected users/sandboxes via database queries

### Investigation Queries

```
"What firing alerts exist right now?"
"Show me 5xx error rate for daytona-api over the last 2 hours"
"Query Loki for panic or fatal errors in the last 30 minutes"
"How many sandboxes are in error state right now?"
"What changed in audit logs in the last hour?"
```

## Phase 3: STATUS UPDATE

When asked to draft a status update, use this template:

```markdown
## Incident Update: [Title]
**Severity:** SEV[1-4] | **Status:** Investigating | Identified | Monitoring | Resolved
**Impact:** [Who/what is affected]
**Last Updated:** [Timestamp]

### Current Status
[What we know — factual, no speculation]

### Actions Taken
- [Action 1]
- [Action 2]

### Next Steps
- [What's happening next and ETA]

### Timeline
| Time (UTC) | Event |
|------------|-------|
| [HH:MM] | [First symptom detected] |
| [HH:MM] | [Investigation started] |
```

## Phase 4: POSTMORTEM

When asked to generate a postmortem after resolution:

1. Reconstruct the full timeline from logs, metrics, and audit trails
2. Identify root cause using the 5 Whys technique
3. Quantify total impact (duration, affected users, failed operations)
4. Recommend action items with owners and priorities

### Postmortem Template

```markdown
## Postmortem: [Incident Title]
**Date:** [Date] | **Duration:** [X hours] | **Severity:** SEV[X]

### Summary
[2-3 sentence description]

### Impact
- Users affected: [count or scope]
- Duration: [start → end]
- Operations failed: [count]

### Root Cause
[What specifically caused the incident]

### 5 Whys
1. Why did [symptom]? → Because [cause 1]
2. Why did [cause 1]? → Because [cause 2]
3. Why did [cause 2]? → Because [cause 3]
4. Why did [cause 3]? → Because [cause 4]
5. Why did [cause 4]? → Because [root cause]

### What Went Well
- [Things that helped]

### What Could Improve
- [Gaps in detection, response, or prevention]

### Action Items
| Action | Owner | Priority | Due Date |
|--------|-------|----------|----------|
| [Action] | [Person] | P0/P1/P2 | [Date] |
```

## Guidelines

- **Be factual**: only report what the data shows, never speculate
- **Correlate across tools**: a single datasource rarely tells the full story
- **Quantify everything**: "many errors" → "4,237 errors in 30 minutes"
- **Use charts**: when presenting time-series data, use `<!--chart:line-->` markers
  so the user can visualize trends and correlate timing
