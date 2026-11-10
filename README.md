# UtilityShelf Hub

Central catalogue site for the UtilityShelf micro utility network.

## Live Tools

- CleanText Shelf: https://cleantext.utilityshelf.site/
- LinkClean Shelf: https://linkclean.utilityshelf.site/

## Coming Soon

- Metadata Checker: https://metadata-checker.utilityshelf.site/
- System Care Script Builder: https://system-care-script-builder.utilityshelf.site/
- TempMail: https://tempmail.utilityshelf.site/

## Publishing

Recommended Cloudflare Pages settings:

- Repository: `mrculture/utilityshelf-hub`
- Project name: `utilityshelf`
- Production branch: `main`
- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`

## Automated checks

GitHub Actions runs **Quality checks** on pushes to main, pull requests targeting main, and manual dispatch. It validates sitemap URLs, canonical tags, local links, JavaScript syntax and browser page loading. Functional regression tests live in `.github/qa/tests`.

Run locally with Node 24 or later:

```sh
cd .github/qa
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

Failed runs retain browser traces and an HTML report for seven days. Tests use synthetic data and block external browser requests, including analytics. CI files and dependencies stay under `.github/qa`, separate from public assets.

Production deployments now depend on these checks. Direct Cloudflare Git production builds are disabled for the targets in `.github/release/targets.json`; GitHub deploys the same tested main commit. Branch merge protection is separate.

## Guarded deployments

The deployment job follows successful checks, verifies the live release, retries known temporary failures at most twice, and restores the captured previous release if live verification fails and this run still owns production. Credentials, cutover settings and recovery limits are documented in [.github/release/README.md](.github/release/README.md).

## Tool action counts

Anonymous Analytics Engine events use `utilityshelf_tool_usage`: `index1` = tool,
`blob1` = action, `blob2` = fixed mode, `blob3` = sample/custom, `double1` = 1.
The collector at `https://filename-cleaner.utilityshelf.site/usage` accepts only
allowlisted tool/action/mode combinations from their production origins. The
image tools use exact-origin CORS. No filenames, image bytes, input values,
identifiers, or request headers are written to the dataset.

| Tool | Action | Meaning | Modes |
| --- | --- | --- | --- |
| Filename Cleaner | ready / copy | Stable valid list / successful copy | clean, numbered |
| Filename Cleaner | mapping_download | Browser download started | clean, numbered |
| Filename Cleaner | zip_download | Renamed photo ZIP download started; custom files only | clean, numbered |
| Image Contact Sheet | reorder | A photo moved successfully | sheet |
| Image Contact Sheet | sheet_download | PNG generated and browser download started | sheet |
| Image Contact Sheet | names_copy | Ordered original filename list copied successfully | sheet |
| Image Dimension Checker | check_complete | Valid limits evaluated against at least one readable image | custom, ebay |
| Image Dimension Checker | ebay_preset | Completed image check using the eBay preset | ebay |
| Image Dimension Checker | report_download | Current photo report download started, including reports with unreadable files | custom, ebay |
| CSV Import Checker | check_complete | Parsed nonempty CSV and completed header/field-count checks | passed, issues |
| CSV Import Checker | corrected_download | Exact checked CSV download started after passing structure checks | passed |
| CSV Column Mapper | build_complete / mapped_download | Mapping built / full CSV download started | mapped |
| CSV Formula Checker | scan_complete | Parsed nonempty input and completed prefix scan | clear, warnings |
| CSV Import Checker / CSV Formula Checker | report_download | Plain-text report download started for the current check | passed, issues, incomplete |

Each action/mode/source combination is counted at most once per page load.
Counts are not unique people, total clicks, saved files, or necessarily passing
checks. Image checks settle for 500 ms so intermediate limit edits do not count.
Invalid/empty batches, failed exports and stale asynchronous results do not count.
CSV parsing failures and separator warnings do not count as completed checks.
Both checkers offer plain-text reports with a passed, issues found, or check incomplete status. Reports list at most 100 findings, state when more were detected, and distinguish partial checks from completed checks. Editing input, changing the formula checker separator, or starting a file read invalidates the previous report. Reports are created locally; report text and CSV contents are never sent with usage events.
CSV Column Mapper saves versioned JSON mapping files (up to 64 KiB) containing headers and column indices only. Loading resolves the indices against exact source names, supports reordered columns, rejects any changed header set or ambiguous headers, and requires review and an explicit build. A failed or superseded mapping read cannot restore an old export. The supplier guide includes downloadable original/corrected CSV examples and report instructions.
Editing a built-in CSV sample changes its source category to custom. CSV files
opened from disk or pasted are custom; owner tests must use test mode regardless.
The standalone CSV Import Checker ships an identical copy of `utilities/usage.js`
at `tools/csv-import-checker/usage.js`; a release test guards against drift.
Opt-out, DNT, GPC, automated browsers, previews and `?release-check` suppress events.
Sample activity must be excluded when assessing custom use. Tests intercept all
collector calls; any explicitly performed live sample verification stays sample.
Analytics failures do not block the tools. No cookies or persistent IDs are used.

Use the maintained [filtered usage report](.github/analytics/visitor-usage.sql)
and [filtered total](.github/analytics/visitor-total.sql), not a bare custom-source
filter. They exclude samples and the six exact known owner-test event signatures.
See [report definitions and test links](.github/release/USAGE.md). Raw events remain
available for diagnosis. Future owner tests must use `?test-mode=1` on these tools.
