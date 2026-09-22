# Publishing UtilityShelf

Use Cloudflare Pages with GitHub import:

- Repository: `mrculture/utilityshelf-hub`
- Project name: `utilityshelf`
- Production branch: `main`
- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`

## Current Production Route

`https://utilityshelf.site/` is currently served by the `utilityshelf-hub` Cloudflare Worker with static assets. Do not deploy the source folder directly with Wrangler, because it contains local `.git` and Wrangler metadata.

Use a clean staging directory containing only public files, then deploy that directory:

```powershell
npx.cmd wrangler deploy ".deploy\utilityshelf-hub-clean" --name utilityshelf-hub --compatibility-date 2026-06-05 --old-asset-ttl 0
```

After deployment:

1. Confirm `https://utilityshelf.site/` loads.
2. Confirm `https://utilityshelf.site/robots.txt` loads.
3. Confirm `https://utilityshelf.site/sitemap.xml` loads.
4. Confirm `https://utilityshelf.site/guides` loads.
5. Add `https://utilityshelf.site/` as a URL-prefix property in Google Search Console.
6. Submit `https://utilityshelf.site/sitemap.xml`.
