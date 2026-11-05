# Guarded Cloudflare releases

Status: enabled on 2026-11-05. Both repository variables are true; the account-scoped deployment token is stored as an encrypted Actions secret. See the Quality checks runs for release verification evidence.

The Quality checks workflow runs browser checks and release-control tests first.
Only the same main-branch commit can enter the deployment job. PR jobs receive no
Cloudflare credentials. Production runs are serialized and not automatically
cancelled midway through deployment. A stale main commit is skipped.

Each target captures its currently active production deployment and checks its
live page before uploading. Known transient errors get at most two retries.
Authentication/configuration failures stop immediately. A timeout is reconciled
against Cloudflare's current deployment before retrying. New releases contain a
release.json commit marker and must pass live browser checks. Failed verification
restores the captured release only if this run's deployment is still active.
Recovery has at most two transient retries. A recovered incident remains a failed
GitHub run so it is visible. Targets are released individually, not as an atomic
multi-site transaction. No cleanup script is executed and no AI service is used.

## Activation sequence

1. Create a Cloudflare API token limited to this account. The hub needs Workers
   Scripts Edit and Cloudflare Pages Edit. System Care only needs Pages Edit.
   Store it as CLOUDFLARE_API_TOKEN in each repository's production environment
   or Actions secrets. Do not commit or paste credentials into issues or chat.
2. Verify token access to every target and inspect existing Worker settings.
   Confirm the homepage is static assets only with the checked compatibility
   date and no additional bindings that need preserving. The upload preserves
   dashboard variables and does not modify domains, routes or secrets.
3. With DEPLOYMENTS_ENABLED unset/false, merge this change and wait for checks.
4. Record existing build settings. Disable automatic production Git deployments
   for all named Pages projects. Disable the homepage Worker Git production build
   trigger. Allow any already-running builds to finish before proceeding. Leave
   existing production releases online. Do not disconnect domains or delete
   projects. Preview builds can remain enabled.
5. Set GIT_DEPLOYMENTS_DISABLED=true only after checking those settings. Pages
   state is also verified by the release script before an upload. Worker cutover
   needs an operator check because Workers Builds uses a separate API.
6. Set DEPLOYMENTS_ENABLED=true. Manually run Quality checks on main. Confirm
   checks, deployments, commit markers and live browser probes pass for all
   targets. Exercise retry/recovery first with the unit fixtures. Perform any
   real rollback drill on an isolated preview/test project, never by deliberately
   breaking production.

If activation fails, set DEPLOYMENTS_ENABLED=false, inspect the release-report,
and verify the active Cloudflare release. Restore the recorded Git build settings
only after confirming no release workflow is running.

## Limits and incident response

This handles failures during a release, not ongoing uptime monitoring. It cannot
repair account permissions, billing, Cloudflare outages or source-code bugs.
Forced job cancellation, runner loss, or an unavailable Cloudflare control plane
can prevent recovery. Another external deployment stops automatic rollback.
GitHub's failed run and retained release-report identify these exceptions.
Rollback restores static application versions, not external databases or state.

The smoke checks cover homepage loading, first-party resource/runtime errors,
the commit marker and one representative interaction per tool. They do not prove
all features are correct. The existing browser regression suite remains required.

Run release-control tests locally with:

    node --test .github/release/tests/*.test.cjs

Cloudflare references:
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/configuration/rollbacks/
- https://developers.cloudflare.com/workers/versions-and-deployments/

## Recorded cutover (2026-11-05)

Before cutover, all four projects deployed main automatically. The homepage
Worker had no build command, root `/`, deploy command `npx wrangler deploy`,
version command `npx wrangler versions upload`, and all paths included. It is
static-assets-only, with zero bindings and compatibility date 2026-06-05.
Its Disable builds setting is now on (including native preview builds).

The Pages projects retain their Git connections, main production branch,
version 3 build system, and non-production preview builds. Only automatic
production deployments are off. Filename Cleaner uses root
`tools/filename-cleaner`, CSV Import Checker uses `tools/csv-import-checker`,
and both output `.` with no build command. System Care uses the repository
root with no build command. The actual Pages project name is
`system-care-script-builder-git`.

GitHub now controls production for these four targets. This does not configure
branch merge protection or change deployment settings for other UtilityShelf
projects. The tests simulate failure and recovery; production is not deliberately
broken to test rollback.

CI pins GitHub's Ubuntu 24.04 runner and uses its preinstalled browser runtime
libraries. Chromium installation is limited to five minutes. It does not reinstall
Playwright's optional font packages through apt: that mirror stalled during
activation. Missing runtime dependencies still fail browser checks before release.
