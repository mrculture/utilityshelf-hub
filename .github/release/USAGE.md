# Filtered UtilityShelf usage reports

Canonical reports:
- [Seven-day action report](../analytics/visitor-usage.sql)
- [Seven-day filtered total](../analytics/visitor-total.sql)
- [Known owner-test exclusions](../analytics/known-tests.json)

Run these SQL files in Cloudflare Analytics Engine Studio against
`utilityshelf_tool_usage`. Both exclude all sample events and the six owner test
records from 2026-11-10 14:47:39–14:48:04 UTC, matching timestamp, tool, action,
mode and source. Raw records are retained; this does not delete data or alter
Cloudflare's default raw totals. No broad time window is discarded.

These are **filtered custom action counts**, not unique visitors or proven
customer activity. They are capped once per action/mode/source per page load.
An unmarked owner test can still be included, and the public collector can be
spoofed. No visitor/session/event IDs exist. A legitimate event with the exact
same signature and second as a known test cannot be distinguished retrospectively.
The reviewed export contained exactly the six known custom records.

Schema: index1=tool, blob1=action, blob2=fixed mode, blob3=sample/custom,
double1=1; `_sample_interval` supplies the sampling weight. SUM of the product
is used for counts. Downloads mean browser download starts, not saved files.
Check completion requires valid limits and at least one readable image; it does
not imply a passing image. Definitions for each action are in the repository README.

## Future testing

Use these links before starting any owner/agent test:
- https://filename-cleaner.utilityshelf.site/?test-mode=1
- https://utilityshelf.site/utilities/image-contact-sheet/?test-mode=1
- https://utilityshelf.site/utilities/image-dimension-checker/?test-mode=1

The visible Test mode notice confirms exclusion. On these three pages it disables
both action events and the Cloudflare Web Analytics beacon, without preventing
checks, reordering or downloads. Direct links between these tools retain the
flag. Opening a normal URL, or navigating elsewhere on UtilityShelf, does not
carry the exclusion automatically. It is not a persistent browser opt-out.
DNT, GPC and the normal checkbox continue to suppress action events as before.
Automation and release-check URLs also suppress the beacon on these three tools.

For an intentional end-to-end collector test, use built-in samples. If custom
input is necessary, record its exact stored signatures and purpose in
`known-tests.json`, regenerate both queries with
`node .github/analytics/build-queries.cjs`, and validate against the export.
Keep photo names, customer data and identifiers out of this manifest.

## Scope

Cloudflare Web Analytics page views are a separate dataset. Historical manual
page views cannot be reliably removed using these action-event signatures. Do
not present its raw page counts as filtered customer adoption. Test-mode beacon
suppression starts with this release; it is not retroactive.

The SQL files use a rolling seven-day window in UTC. Change the generator's
window argument for another period while retaining the same exclusions. Reports
may lag new actions. GET `/usage` is the non-writing collector health check.
The deployment token does not need Analytics Read access for deployment.
