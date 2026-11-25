(() => {
  const choice = document.getElementById('usage');
  const recorded = new Set();
  const params = new URLSearchParams(location.search);
  const embedMode = params.get('embed') === '1';
  const partnerCode = params.get('partner');
  const usageTestMode = params.has('test-mode') || (embedMode && partnerCode === 'supplier-demo');
  const releaseTestMode = params.has('release-check');
  if (usageTestMode) {
    const notice = document.createElement('p');
    notice.id = 'testModeNotice'; notice.setAttribute('role', 'status');
    notice.textContent = 'Test mode: action counts and page-view tracking are off for this page.';
    document.querySelector('h1').after(notice);
    for (const link of document.querySelectorAll('a[href]')) {
      const destination = new URL(link.href);
      if ((destination.origin === 'https://csv-import-checker.utilityshelf.site' && ['/', '/for-websites/'].includes(destination.pathname)) ||
          (destination.origin === 'https://filename-cleaner.utilityshelf.site' && destination.pathname === '/') ||
          ((destination.origin === 'https://utilityshelf.site' || destination.origin === location.origin) && ['/', '/guides/prepare-product-photos-for-ebay', '/guides/prepare-supplier-csv-for-import', '/utilities/image-contact-sheet/', '/utilities/image-dimension-checker/', '/utilities/csv-column-mapper/', '/utilities/csv-formula-checker/', '/utilities/supplier-csv-compare/', '/utilities/sku-photo-matcher/', '/utilities/bulk-barcode-checker/'].includes(destination.pathname))) {
        destination.searchParams.set('test-mode', '1'); link.href = destination.href;
      }
    }
  }
  if (!embedMode && !usageTestMode && !releaseTestMode && !navigator.webdriver) {
    const beacon = document.createElement('script');
    beacon.type = 'module'; beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.dataset.cfBeacon = JSON.stringify({token:'104d69dafb54484bbb4e18e34d50c835'});
    document.head.append(beacon);
  }

  const privateBrowser = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl;
  if (choice && (usageTestMode || privateBrowser())) { choice.checked = false; choice.disabled = true; }
  const modes = {
    'product-photo-workflow': {entry: ['home', 'guide'], check_resize: ['home', 'guide'], arrange: ['home', 'guide'], name_download: ['home', 'guide'], walkthrough: ['home']},
    'image-contact-sheet': {reorder: ['sheet'], sheet_download: ['sheet'], names_copy: ['sheet']},
    'image-dimension-checker': {check_complete: ['custom', 'ebay'], ebay_preset: ['ebay'], report_download: ['custom', 'ebay'], resize_complete: ['custom', 'ebay'], resize_download: ['custom', 'ebay']},
    'csv-import-checker': {check_complete: ['passed', 'issues'], corrected_download: ['passed'], report_download: ['passed', 'issues', 'incomplete'], onward_click: ['mapper', 'guide']},
    'csv-column-mapper': {build_complete: ['mapped'], mapped_download: ['mapped']},
    'sku-photo-matcher': {check_complete: ['match'], report_download: ['match']},
    'csv-formula-checker': {scan_complete: ['clear', 'warnings'], report_download: ['passed', 'issues', 'incomplete']}
  };
  window.UtilityShelfUsage = {
    track(tool, event, mode, source) {
      const expectedOrigin = tool === 'csv-import-checker' ? 'https://csv-import-checker.utilityshelf.site' : 'https://utilityshelf.site';
      if (usageTestMode || !choice?.checked || privateBrowser() || navigator.webdriver || location.origin !== expectedOrigin || releaseTestMode) return;
      if (!modes[tool]?.[event]?.includes(mode) || !['sample', 'custom'].includes(source)) return;
      const embeddedChecker = tool === 'csv-import-checker' && embedMode;
      if (event === 'onward_click' && !embeddedChecker) return;
      const key = [tool, event, mode, source].join(':');
      if (recorded.has(key)) return;
      recorded.add(key); // Once per action/mode/source per page load, not per visitor.
      const payload = {tool, event, mode, source};
      if (embeddedChecker) {
        payload.surface = 'embed';
        // Only issued placement labels may leave the browser.
        payload.partner = partnerCode === 'supplier-pilot' ? partnerCode : 'community';
      }
      try {
        fetch('https://filename-cleaner.utilityshelf.site/usage', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
          credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true
        }).catch(() => {});
      } catch { /* Analytics must never interrupt the tool. */ }
    }
  };
})();
