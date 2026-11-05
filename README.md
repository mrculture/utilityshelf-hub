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

These checks report failures. Existing Cloudflare deployments still run independently. Making this a required merge/deployment gate is a separate configuration change.
