# Audit Log Analysis (OpenSearch)

Audit logs are stored in **OpenSearch** and queried via the `query_opensearch`,
`list_opensearch_indices`, and `get_opensearch_index_mapping` tools.

The OpenSearch cluster is accessed through an SSH tunnel to the production
monitoring stack. The tunnel is managed automatically by the agent.

## Discovery Workflow

On first audit-log question, **always** run these steps:

1. `list_opensearch_indices` — find audit-related index names/patterns.
2. `get_opensearch_index_mapping` on the relevant index — learn exact field
   names and types before writing queries.
3. Then formulate Query DSL.

Cache the index name and mapping mentally for follow-up questions in the same
session.

## Known Index Pattern

Audit logs use data-stream indices: `.ds-audit-logs-000001` through
`.ds-audit-logs-NNNNNN`. Query across all of them with the pattern
`.ds-audit-logs-*`.

## Expected Index Structure

Based on the application's audit system, documents typically contain:

| Field | Type | Description |
|-------|------|-------------|
| actorId | keyword | User ID who performed the action |
| actorEmail | keyword | Email of the actor |
| organizationId | keyword | Org UUID |
| action | keyword | Action name (e.g. `sandbox.create`, `sandbox.delete`, `api_key.create`) |
| targetType | keyword | Entity type (e.g. `sandbox`, `organization`, `api_key`) |
| targetId | keyword | Entity ID the action was performed on |
| statusCode | integer | HTTP status code |
| errorMessage | text | Error details if the action failed |
| ipAddress | keyword | Client IP |
| userAgent | text | Client user-agent string |
| source | keyword | Where the action originated |
| metadata | object/nested | Action-specific details (JSON) |
| @timestamp / createdAt | date | When the event occurred |

**Important**: Verify field names with `get_opensearch_index_mapping` — the
actual index may use slightly different names (e.g. `@timestamp` vs `createdAt`,
`actor.email` vs `actorEmail`).

## Query DSL Patterns

### Recent events for a user

```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"actorEmail": "user@example.com"}}
      ],
      "filter": [
        {"range": {"@timestamp": {"gte": "now-24h"}}}
      ]
    }
  },
  "size": 25,
  "sort": [{"@timestamp": "desc"}]
}
```

### Actions on a specific resource

```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"targetId": "<sandbox-or-resource-id>"}}
      ]
    }
  },
  "size": 50,
  "sort": [{"@timestamp": "desc"}]
}
```

### Action frequency aggregation

```json
{
  "size": 0,
  "query": {
    "range": {"@timestamp": {"gte": "now-24h"}}
  },
  "aggs": {
    "by_action": {
      "terms": {"field": "action", "size": 30}
    }
  }
}
```

### Failed actions (errors)

```json
{
  "query": {
    "bool": {
      "must": [
        {"range": {"statusCode": {"gte": 400}}}
      ],
      "filter": [
        {"range": {"@timestamp": {"gte": "now-24h"}}}
      ]
    }
  },
  "size": 25,
  "sort": [{"@timestamp": "desc"}]
}
```

### Activity for an organization

```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"organizationId": "<org-uuid>"}}
      ],
      "filter": [
        {"range": {"@timestamp": {"gte": "now-7d"}}}
      ]
    }
  },
  "size": 0,
  "aggs": {
    "by_action": {
      "terms": {"field": "action", "size": 20}
    },
    "by_actor": {
      "terms": {"field": "actorEmail", "size": 20}
    },
    "over_time": {
      "date_histogram": {
        "field": "@timestamp",
        "calendar_interval": "day"
      }
    }
  }
}
```

## Guidelines

- **Always aggregate server-side** — use `"size": 0` + `aggs` for any question
  about counts, distributions, or trends. Never fetch raw docs just to count them.
- When you DO need raw docs, add `size` (default 25, max 100) and `_source`
  to limit returned fields.
- Use `sort: [{"@timestamp": "desc"}]` for recency-ordered results.
- **Wildcard index patterns** (e.g. `audit-logs-*`) work if logs are
  time-partitioned.
- The internal test org `19336c5f-4f0c-4431-89b0-f42311305913` should be
  excluded from analytics unless explicitly requested.
- Cross-reference with the production **database** (SQL tools) when you need
  org names, user details, or sandbox state that isn't in the audit log.

### Handling Unindexed Fields

The `metadata` field in audit logs is stored but **not indexed** (`"enabled": false`).
This means:

- You CANNOT use `aggs` on `metadata.body.*` fields — aggregations return 0
- You CANNOT filter on `metadata.body.*` in queries
- You CAN read `metadata` from raw `_source` in fetched documents

When you need to aggregate by a metadata field (e.g. `metadata.body.snapshot`):

1. Check if the data exists in the **database** instead — the sandbox table has
   indexed columns for cpu, mem, disk, snapshot, autoStopInterval, etc.
2. If only in OpenSearch, be explicit: "This field is not indexed in OpenSearch.
   I can sample visible records but cannot give a complete count."
3. Never fabricate a distribution from a partial sample.
