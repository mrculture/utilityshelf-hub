(() => {
  const choice = document.getElementById('usage');
  const recorded = new Set();
  const privateBrowser = () => navigator.doNotTrack === '1' || navigator.globalPrivacyControl;
  if (choice && privateBrowser()) { choice.checked = false; choice.disabled = true; }
  const modes = {
    'image-contact-sheet': {reorder: ['sheet'], sheet_download: ['sheet']},
    'image-dimension-checker': {check_complete: ['custom', 'ebay'], ebay_preset: ['ebay']}
  };
  window.UtilityShelfUsage = {
    track(tool, event, mode, source) {
      if (!choice?.checked || privateBrowser() || navigator.webdriver || location.origin !== 'https://utilityshelf.site' || new URLSearchParams(location.search).has('release-check')) return;
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
