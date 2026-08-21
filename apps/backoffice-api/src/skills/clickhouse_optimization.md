# ClickHouse Query & Schema Optimization

When querying ClickHouse (via `query_clickhouse` or HogQL in PostHog), follow
these optimization rules. ClickHouse is columnar — standard SQL intuition about
indexes and JOINs often doesn't apply.

## Query Optimization

### Filter on ORDER BY prefix columns

ClickHouse's sparse index only helps when the WHERE clause matches the leftmost
columns of the table's ORDER BY key. Filtering on non-key columns triggers a
full scan.

```sql
-- Good: filters on ORDER BY prefix
SELECT * FROM billing WHERE org_id = 'abc' AND timestamp > '2026-03-01'

-- Bad: skips prefix, scans everything
SELECT * FROM billing WHERE region = 'us-east-1'
```

### Filter before JOINing

Apply WHERE conditions in subqueries, not after the JOIN. ClickHouse doesn't
push predicates through JOINs automatically.

```sql
-- Good: pre-filter both sides
SELECT a.org_id, b.name
FROM (SELECT org_id FROM billing WHERE timestamp > now() - INTERVAL 7 DAY) a
JOIN (SELECT id, name FROM orgs WHERE active = 1) b ON a.org_id = b.id

-- Bad: filter after join scans full tables
SELECT a.org_id, b.name FROM billing a JOIN orgs b ON a.org_id = b.id
WHERE a.timestamp > now() - INTERVAL 7 DAY
```

### Use the right JOIN algorithm

- Small right table (< 1M rows): default hash join is fine
- Large right tables: add `SETTINGS join_algorithm = 'partial_merge'`
- Avoid `CROSS JOIN` — it materializes the full cartesian product

### Aggregation before JOIN

When computing aggregates, do it before joining to dimension tables:

```sql
SELECT o.name, agg.total_spend
FROM (
  SELECT org_id, sum(spend) AS total_spend
  FROM billing
  WHERE timestamp > now() - INTERVAL 30 DAY
  GROUP BY org_id
) agg
JOIN orgs o ON agg.org_id = o.id
ORDER BY total_spend DESC
LIMIT 25
```

### Pagination

Never use `OFFSET` for pagination — it still scans and discards rows.
Use cursor-based pagination with WHERE on the ORDER BY key:

```sql
-- Page 1
SELECT * FROM events ORDER BY timestamp DESC LIMIT 25

-- Page 2 (using last row's timestamp)
SELECT * FROM events WHERE timestamp < '2026-03-31 15:00:00' ORDER BY timestamp DESC LIMIT 25
```

## Data Type Best Practices

- Use `LowCardinality(String)` for columns with < 10K unique values (e.g. region, status, event_name)
- Use `UInt32`/`UInt64` instead of `Int64` when values are never negative
- Avoid `Nullable` — use `DEFAULT ''` or `DEFAULT 0` instead (Nullable adds an extra column internally)
- Use `Date` or `Date32` instead of `DateTime` when time precision isn't needed

## Schema Design

### ORDER BY column ordering

Put columns in selectivity order — most filtered first:

1. Tenant/org ID (always filtered)
2. Time column (range scans)
3. Event type or category (frequent filter)

### Partition by time

Keep partitions between 100-1000 parts. For billing data: monthly partitions.
For high-volume events: daily or weekly.

```sql
PARTITION BY toYYYYMM(timestamp)  -- monthly
PARTITION BY toMonday(timestamp)  -- weekly
```

## Mutation Avoidance

ClickHouse is not designed for row-level updates or deletes:

- **Never** use `ALTER TABLE UPDATE/DELETE` in production queries — they rewrite entire parts
- Use `ReplacingMergeTree` for data that needs logical updates
- Use `CollapsingMergeTree` for data that needs logical deletes
- Accept eventual consistency — `FINAL` keyword forces deduplication but is expensive

## Result Format

ClickHouse returns `JSONEachRow` format (one JSON object per line). When results
are large, use `LIMIT` aggressively — tool results are capped at 80KB.

**Always aggregate in SQL, never in-context.** ClickHouse handles 100M+ rows
efficiently — let the database do the work:

```sql
-- Good: one row per group, database does the counting
SELECT toDate(startAt) AS day, region, count() AS sandboxes, sum(price) AS spend
FROM billing.usage_records
WHERE organizationId = 'abc' AND startAt > subtractDays(now(), 15)
GROUP BY day, region ORDER BY day

-- Bad: fetching raw rows and trying to count them in conversation
SELECT * FROM billing.usage_records WHERE organizationId = 'abc' LIMIT 500
```

## Operational Query Templates

### Spend summary (last 7 days, by org)

```sql
SELECT organizationId, count() AS sandboxes,
  round(sum(price), 2) AS spend_usd
FROM billing.usage_records
WHERE startAt > subtractDays(now(), 7)
GROUP BY organizationId
ORDER BY spend_usd DESC LIMIT 25
```

### Daily resource trends

```sql
SELECT toDate(startAt) AS day,
  count() AS records,
  round(sum(price), 2) AS spend
FROM billing.usage_records
WHERE startAt > subtractDays(now(), 14)
GROUP BY day ORDER BY day
```

### Cost anomaly detection (daily spend vs 7-day avg)

```sql
SELECT organizationId,
  round(sum(price), 2) AS today_spend,
  round(avg_7d, 2) AS avg_daily_7d,
  round(sum(price) / avg_7d, 2) AS ratio
FROM billing.usage_records
INNER JOIN (
  SELECT organizationId AS oid,
    sum(price) / 7 AS avg_7d
  FROM billing.usage_records
  WHERE startAt > subtractDays(now(), 7)
  GROUP BY oid
) AS avg ON organizationId = avg.oid
WHERE startAt > subtractDays(now(), 1)
GROUP BY organizationId, avg_7d
HAVING sum(price) > avg_7d * 2
ORDER BY ratio DESC LIMIT 25
```
