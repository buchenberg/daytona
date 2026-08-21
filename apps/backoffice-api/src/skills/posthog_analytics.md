# Product Analytics (PostHog)

Product analytics data is queried via PostHog using HogQL — a SQL dialect
running on ClickHouse. Use the `query_posthog`, `list_posthog_events`, and
`list_posthog_properties` tools.

## Discovery Workflow

On first PostHog question:

1. `list_posthog_events` — discover tracked event names and 30-day volumes.
2. `list_posthog_properties` (optionally with `event_name`) — discover available
   properties before writing queries.
3. Write HogQL queries using the discovered schema.

## Core HogQL Tables

| Table | Key Columns | Use |
|-------|-------------|-----|
| `events` | event, timestamp, distinct_id, properties, person | All tracked events |
| `persons` | id, properties, created_at | User profiles |
| `sessions` | session_id, duration, entry_current_url, exit_current_url | Session data |
| `groups` | group_type_index, group_key, properties | Group analytics |

## Property Access

```sql
-- Event properties (dot or bracket notation)
properties.$current_url
properties.$browser
properties['custom_prop']

-- Person properties (auto-joined from events table)
person.properties.email
person.properties.$initial_browser

-- Person properties from persons table
properties.email
properties.$initial_referring_domain
```

## HogQL Query Patterns

### Event counts over time

```sql
SELECT
  toDate(timestamp) AS day,
  count() AS events
FROM events
WHERE timestamp > now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
LIMIT 30
```

### Top events by volume

```sql
SELECT event, count() AS cnt
FROM events
WHERE timestamp > now() - INTERVAL 24 HOUR
GROUP BY event
ORDER BY cnt DESC
LIMIT 25
```

### Feature usage by users

```sql
SELECT
  person.properties.email AS email,
  count() AS actions
FROM events
WHERE event = 'some_event'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY email
ORDER BY actions DESC
LIMIT 25
```

### Unique users per event

```sql
SELECT
  event,
  uniqExact(distinct_id) AS unique_users,
  count() AS total
FROM events
WHERE timestamp > now() - INTERVAL 7 DAY
GROUP BY event
ORDER BY unique_users DESC
LIMIT 25
```

### Funnel-style sequential analysis

```sql
SELECT
  count(DISTINCT a.distinct_id) AS started,
  count(DISTINCT b.distinct_id) AS completed
FROM events a
LEFT JOIN events b
  ON a.distinct_id = b.distinct_id
  AND b.event = 'step_two'
  AND b.timestamp > a.timestamp
  AND b.timestamp < a.timestamp + INTERVAL 1 HOUR
WHERE a.event = 'step_one'
  AND a.timestamp > now() - INTERVAL 7 DAY
```

### User session activity

```sql
SELECT
  session_id,
  min(timestamp) AS started,
  max(timestamp) AS ended,
  count() AS event_count,
  dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds
FROM events
WHERE distinct_id = '<user-distinct-id>'
  AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY session_id
ORDER BY started DESC
LIMIT 25
```

## Guidelines

- **Always include `LIMIT`** (default 25). Max 50,000 per query.
- HogQL uses **ClickHouse SQL** syntax — `count()` not `COUNT(*)`,
  `toDate()`, `dateDiff()`, `uniqExact()`, etc.
- Use `now() - INTERVAL N DAY/HOUR` for relative time filters.
- `distinct_id` is the user identifier in events; join to `persons` for profile
  properties.
- For large time ranges, prefer aggregations over raw event listings.
- Cross-reference with the production **database** (SQL tools) when you need
  org/sandbox details that aren't tracked as PostHog properties.
