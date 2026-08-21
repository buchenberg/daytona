# Resource Analysis & Optimization

This skill covers resource allocation, utilization analysis, and cost optimization
for the Daytona platform.

## Key Organization IDs

- **High-usage orgs** (frequently analysed):
  `33c1c3f2-fa47-4951-8694-17e1b71083c4`, `d3df4094-226d-400b-804a-e4f9aa5a60d0`,
  `b9f931eb-5f33-4563-bf9f-2466e5e9fe46`
- **Internal test org** (always exclude from analytics):
  `19336c5f-4f0c-4431-89b0-f42311305913`

## Utilization Thresholds

| Status | Utilization | Action |
|--------|-------------|--------|
| Over-provisioned | < 15% | Candidate for right-sizing / savings |
| Optimal | 15–80% | Healthy range |
| Under-provisioned | > 80% | Needs more resources / capacity risk |

When recommending right-sizing, include **20% headroom** above actual usage.

## PromQL: Current Resource Allocation & Usage

All queries target `job="runner-cadvisor", environment="prod"` and group by
`container_label_daytona_organization_id` (the org UUID).

### Allocation (what's provisioned)

```promql
# CPU allocation (cores) — top 10 orgs
topk(10, sum by (container_label_daytona_organization_id) (
  container_spec_cpu_quota{job="runner-cadvisor", environment="prod"}
) / 100000)

# Memory allocation (GB)
sum by (container_label_daytona_organization_id) (
  container_spec_memory_limit_bytes{job="runner-cadvisor", environment="prod"}
) / 1024 / 1024 / 1024
```

### Actual Usage

```promql
# CPU usage (cores, 5min rate)
sum by (container_label_daytona_organization_id) (
  rate(container_cpu_usage_seconds_total{job="runner-cadvisor", environment="prod"}[5m])
)

# Memory usage (GB, working set)
sum by (container_label_daytona_organization_id) (
  container_memory_working_set_bytes{job="runner-cadvisor", environment="prod"}
) / 1024 / 1024 / 1024

# Disk usage (GB)
sum by (container_label_daytona_organization_id) (
  container_fs_usage_bytes{job="runner-cadvisor", environment="prod"}
) / 1024 / 1024 / 1024
```

## PromQL: Utilization Percentages

```promql
# CPU utilization % (actual / allocated)
(
  sum by (container_label_daytona_organization_id) (
    rate(container_cpu_usage_seconds_total{job="runner-cadvisor", environment="prod"}[5m])
  )
  /
  sum by (container_label_daytona_organization_id) (
    container_spec_cpu_quota{job="runner-cadvisor", environment="prod"}
  ) * 100000
) * 100

# Memory utilization %
(
  sum by (container_label_daytona_organization_id) (
    container_memory_working_set_bytes{job="runner-cadvisor", environment="prod"}
  )
  /
  sum by (container_label_daytona_organization_id) (
    container_spec_memory_limit_bytes{job="runner-cadvisor", environment="prod"}
  )
) * 100
```

## PromQL: Over/Under-Provisioning Detection

```promql
# Over-provisioned CPU (< 15% utilization)
(
  sum by (container_label_daytona_organization_id) (
    rate(container_cpu_usage_seconds_total{job="runner-cadvisor", environment="prod"}[5m])
  )
  /
  sum by (container_label_daytona_organization_id) (
    container_spec_cpu_quota{job="runner-cadvisor", environment="prod"}
  ) * 100000
) * 100 < 15

# Under-provisioned CPU (> 80% utilization)
# Same query but with > 80 threshold
```

## PromQL: 24-Hour Trends

Use `query_prometheus_range` with `step=1h` for CPU, `step=4h` for memory.
Filter to specific org IDs to avoid timeouts.

```promql
# CPU allocation trend
sum by (container_label_daytona_organization_id) (
  container_spec_cpu_quota{job="runner-cadvisor", environment="prod"}
) / 100000
```

## SQL: Organization Resource Context

```sql
-- Active sandboxes with resource allocation per org
SELECT
  o.name, o.id,
  COUNT(s.id) as active_sandboxes,
  SUM(s.cpu) as total_cpu,
  SUM(s.mem) as total_mem_gb,
  SUM(s.disk) as total_disk_gb
FROM organization o
JOIN sandbox s ON o.id = s."organizationId"
WHERE s.state IN ('started','stopping','pending_build',
  'building_snapshot','pulling_snapshot','restoring','creating')
GROUP BY o.name, o.id
ORDER BY total_cpu DESC LIMIT 25;

-- Runner errors by snapshot (identify bad images)
SELECT r.domain, COUNT(*) as errors, s.snapshot, s."buildInfoSnapshotRef"
FROM sandbox s
JOIN runner r ON s."runnerId" = r.id
WHERE s.state = 'error' AND r.state != 'decommissioned'
  AND s."lastActivityAt" >= now() - interval '24 hours'
GROUP BY r.domain, s.snapshot, s."buildInfoSnapshotRef"
ORDER BY errors DESC LIMIT 25;
```

## SQL: Cost Optimization

```sql
-- 24h usage per org (for cost estimation)
WITH usage AS (
  SELECT
    sup."organizationId", o.name,
    GREATEST(sup."startAt", now() - interval '24 hours') AS clipped_start,
    LEAST(COALESCE(sup."endAt", now()), now()) AS clipped_end,
    sup.cpu, sup.mem, sup.disk
  FROM sandbox_usage_periods_archive sup
  JOIN organization o ON sup."organizationId" = o.id::text
  WHERE sup."endAt" >= now() - interval '24 hours'
    AND sup."startAt" <= now()
)
SELECT name,
  ROUND(SUM(EXTRACT(EPOCH FROM (clipped_end - clipped_start)) / 3600 * cpu)::numeric, 2) AS cpu_hours,
  ROUND(SUM(EXTRACT(EPOCH FROM (clipped_end - clipped_start)) / 3600 * mem)::numeric, 2) AS mem_gb_hours,
  ROUND(SUM(EXTRACT(EPOCH FROM (clipped_end - clipped_start)) / 3600 * disk)::numeric, 2) AS disk_gb_hours
FROM usage GROUP BY name ORDER BY cpu_hours DESC LIMIT 25;
```

## Optimization Report Workflow

When asked for a resource optimization report, follow these steps:

1. Query current allocation (PromQL allocation queries)
2. Query actual usage (PromQL usage queries)
3. Calculate utilization % (PromQL utilization queries)
4. Get org names from database (SQL org context query)
5. Identify over-provisioned (< 15%) and under-provisioned (> 80%) orgs
6. Calculate savings potential with 20% headroom
7. Present as a table with recommendations

## Dashboard Analysis Frameworks

When investigating resource or performance issues, apply these standard frameworks:

### RED Method (for services/APIs)

- **Rate**: requests per second — `sum(rate(http_requests_total[5m]))`
- **Errors**: error rate — `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`
- **Duration**: latency percentiles — `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`

### USE Method (for infrastructure resources)

- **Utilization**: % of time resource is busy (CPU %, memory %, disk I/O %)
- **Saturation**: queue depth, swap usage, load average above core count
- **Errors**: hardware/driver errors, OOM kills, disk failures

### Presentation Guidelines

- Use `<!--chart:line-->` for time-series trends (CPU/memory over time)
- Use `<!--chart:bar-->` for categorical comparisons (per-org resource usage)
- Lead with the highest-impact finding, then provide supporting detail
- Include both absolute values (cores, GB) and percentages for context

## SQL: Billing & Cost Optimization

When combining ClickHouse billing data with resource metrics:

- Use ClickHouse (`query_clickhouse`) for billing aggregations — it's faster than the database for large time ranges
- Use Prometheus for real-time utilization — billing data has hourly granularity
- Cross-reference org IDs between database, ClickHouse, and Prometheus to build full pictures

## Performance Notes

- Use `step=1h` for CPU range queries, `step=4h` for memory (less volatile)
- Always include `environment="prod"` filter
- Filter to specific org IDs when possible to avoid timeout
- Use Thanos datasource (`P5DCFC7561CCDE821`) for queries spanning > 2 hours
