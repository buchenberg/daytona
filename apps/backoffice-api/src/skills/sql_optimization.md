# SQL Query Optimization

When writing SQL queries via `query_database` (PostgreSQL), apply these patterns
to avoid slow queries and timeouts.

## Query Patterns

### Select only needed columns

```sql
-- Good
SELECT id, name, state, cpu FROM sandbox WHERE state = 'error' LIMIT 25

-- Bad: pulls all columns including large jsonb fields
SELECT * FROM sandbox WHERE state = 'error'
```

### Use conditional aggregation instead of multiple queries

```sql
-- Good: one query, multiple counts
SELECT
  COUNT(*) FILTER (WHERE state = 'started') AS running,
  COUNT(*) FILTER (WHERE state = 'error') AS errors,
  COUNT(*) FILTER (WHERE state = 'stopped') AS stopped
FROM sandbox

-- Bad: three separate queries
SELECT COUNT(*) FROM sandbox WHERE state = 'started'
SELECT COUNT(*) FROM sandbox WHERE state = 'error'
SELECT COUNT(*) FROM sandbox WHERE state = 'stopped'
```

### Cursor-based pagination

```sql
-- Good: cursor pagination (fast for any page)
SELECT id, name, "createdAt" FROM sandbox
WHERE "createdAt" < '2026-03-31T00:00:00Z'
ORDER BY "createdAt" DESC LIMIT 25

-- Bad: OFFSET pagination (scans and discards N rows)
SELECT id, name FROM sandbox ORDER BY "createdAt" DESC LIMIT 25 OFFSET 10000
```

### Avoid functions on indexed columns

```sql
-- Good: range comparison uses index
WHERE "createdAt" >= '2026-03-30' AND "createdAt" < '2026-03-31'

-- Bad: function call prevents index usage
WHERE DATE("createdAt") = '2026-03-30'
```

### Pre-aggregate before joining

```sql
-- Good: aggregate first, join for names after
SELECT o.name, agg.total
FROM (
  SELECT "organizationId", COUNT(*) AS total
  FROM sandbox WHERE state = 'error'
  GROUP BY "organizationId"
) agg
JOIN organization o ON agg."organizationId" = o.id::text
ORDER BY agg.total DESC LIMIT 25

-- Bad: join then aggregate (processes more rows)
SELECT o.name, COUNT(*) AS total
FROM sandbox s JOIN organization o ON s."organizationId" = o.id::text
WHERE s.state = 'error'
GROUP BY o.name
ORDER BY total DESC LIMIT 25
```

## Daytona-Specific Reminders

- Always use **double-quoted camelCase** for column names: `"organizationId"`, `"createdAt"`, `"runnerId"`
- Always include `LIMIT` (default 25, max 50)
- Only `SELECT` queries — no INSERT, UPDATE, DELETE
- For time ranges, use `now() - interval '24 hours'` syntax
- The `organization.id` is UUID type — cast with `::text` when joining to string foreign keys
- **Always aggregate in SQL.** Tool results are capped at 80KB — fetching raw rows
  to count them in-context will give incomplete results. Use `COUNT`, `GROUP BY`,
  and `FILTER (WHERE ...)` to get exact totals from the database.

## Operational Query Templates

Copy-paste ready patterns for common investigations.

### Health check

```sql
SELECT
  COUNT(*) FILTER (WHERE state = 'started') AS running,
  COUNT(*) FILTER (WHERE state = 'error') AS errors,
  COUNT(*) FILTER (WHERE state = 'stopped') AS stopped,
  COUNT(*) FILTER (WHERE state = 'creating') AS creating
FROM sandbox
WHERE "createdAt" > now() - interval '24 hours'
```

### Error spike investigation

```sql
SELECT date_trunc('hour', "createdAt") AS hour,
  COUNT(*) AS errors,
  COUNT(DISTINCT "organizationId") AS affected_orgs
FROM sandbox
WHERE state = 'error'
  AND "createdAt" > now() - interval '24 hours'
GROUP BY hour ORDER BY hour DESC
```

### Org lookup (by name or ID)

```sql
SELECT id, name, "createdAt", personal
FROM organization
WHERE name ILIKE '%search_term%'
LIMIT 25
```

### Stuck/stale resources

```sql
SELECT id, "organizationId", state, "updatedAt"
FROM sandbox
WHERE state IN ('creating', 'starting', 'stopping', 'destroying')
  AND "updatedAt" < now() - interval '1 hour'
ORDER BY "updatedAt" ASC LIMIT 25
```
