# Filename Cleaner usage events

The Pages `/usage` function writes to the Analytics Engine dataset
`utilityshelf_tool_usage`. This is separate from Cloudflare Web Analytics page
views. The checked Pages configuration creates the binding during deployment;
the dataset appears on its first write. Static pages bypass the function through
`_routes.json`. No new paid subscription is required.

Schema: index1 = `filename-cleaner`; blob1 = `ready` or `copy`; blob2 = `clean`
or `numbered`; blob3 = `custom` or `sample`; double1 = 1. Analytics Engine supplies
the timestamp and sampling weight. No input text, IP, cookie, visitor ID or
request header is stored in this dataset. The collector rejects extra fields.
Cloudflare still processes standard network metadata to serve requests.

Count `ready` after a valid list stays unchanged for 1.5 seconds; `copy` after a
successful clipboard write or native copy of the selected full final list.
At most one event per action/mode/source combination per page load (eight max).
These are action counts, not people, sessions, exact batch counts or conversions.
Page reloads can count again, blockers can undercount, and an unauthenticated
collector can be spoofed. Do not use it for billing or security decisions.
Do Not Track, Global Privacy Control and the page opt-out suppress these events.
Localhost, previews, automation and release-check page loads do not send them.

In Cloudflare Analytics Engine, select the dataset and run:

```sql
SELECT blob1 AS action, blob2 AS mode, blob3 AS source,
       SUM(_sample_interval * double1) AS events
FROM utilityshelf_tool_usage
WHERE timestamp >= NOW() - INTERVAL '28' DAY
GROUP BY action, mode, source
ORDER BY events DESC
```

Filter `blob3 = 'custom'` for custom-input use. Sample use is kept separate.
Retention is currently three months. Access via SQL API requires Account
Analytics Read; the deployment token needs no additional read permission.
GET `/usage` is a non-writing binding health check used by guarded releases.
Rollback restores the previous Pages deployment; previously collected events
remain until retention expires.

References:
- https://developers.cloudflare.com/analytics/analytics-engine/get-started/
- https://developers.cloudflare.com/analytics/analytics-engine/pricing/
- https://developers.cloudflare.com/analytics/analytics-engine/limits/
