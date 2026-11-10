(() => {
  const choice = document.getElementById('usage');
  const recorded = new Set();
  const usageTestMode = new URLSearchParams(location.search).has('test-mode');
  const releaseTestMode = new URLSearchParams(location.search).has('release-check');
  if (usageTestMode) {
    const notice = document.createElement('p');
    notice.id = 'testModeNotice'; notice.setAttribute('role', 'status');
    notice.textContent = 'Test mode: action counts and page-view tracking are off for this page.';
    document.querySelector('h1').after(notice);
    for (const link of document.querySelectorAll('a[href]')) {
      const destination = new URL(link.href);
      if ((destination.origin === 'https://filename-cleaner.utilityshelf.site' && destination.pathname === '/') ||
          (destination.origin === 'https://utilityshelf.site' && ['/utilities/image-contact-sheet/', '/utilities/image-dimension-checker/'].includes(destination.pathname))) {
        destination.searchParams.set('test-mode', '1'); link.href = destination.href;
      }
    }
  }
  if (!usageTestMode && !releaseTestMode && !navigator.webdriver) {
    const beacon = document.createElement('script');
    beacon.type = 'module'; beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.dataset.cfBeacon = JSON.stringify({token:'104d69dafb54484bbb4e18e34d50c835'});
    document.head.append(beacon);
  }

  const privateBrowser = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl;
  if (choice && (usageTestMode || privateBrowser())) { choice.checked = false; choice.disabled = true; }
  const modes = {
    'image-contact-sheet': {reorder: ['sheet'], sheet_download: ['sheet']},
    'image-dimension-checker': {check_complete: ['custom', 'ebay'], ebay_preset: ['ebay']}
  };
  window.UtilityShelfUsage = {
    track(tool, event, mode, source) {
      if (usageTestMode || !choice?.checked || privateBrowser() || navigator.webdriver || location.origin !== 'https://utilityshelf.site' || new URLSearchParams(location.search).has('release-check')) return;
      if (!modes[tool]?.[event]?.includes(mode) || !['sample', 'custom'].includes(source)) return;
      const key = [tool, event, mode, source].join(':');
      if (recorded.has(key)) return;
      recorded.add(key); // Once per action/mode/source per page load, not per visitor.
      try {
        fetch('https://filename-cleaner.utilityshelf.site/usage', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({tool, event, mode, source}),
          credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true
        }).catch(() => {});
      } catch { /* Analytics must never interrupt the tool. */ }
    }
  };
})();
