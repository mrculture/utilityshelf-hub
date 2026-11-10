(() => {
  const workflow = document.querySelector('[data-photo-workflow]');
  if (!workflow) return;
  const mode = workflow.dataset.photoWorkflow;
  if (!['home', 'guide'].includes(mode)) return;
  const heading = workflow.querySelector('[data-workflow-entry]');
  const choice = document.getElementById('usage');
  const track = action => window.UtilityShelfUsage?.track('product-photo-workflow', action, mode, 'custom');
  let entryVisible = false;
  // An entry is exposure to the heading, not a page load or a completed workflow.
  if (heading && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entryVisible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      if (entryVisible && document.visibilityState === 'visible') track('entry');
    }, {threshold: [0, 0.5]});
    observer.observe(heading);
  }
  document.addEventListener('visibilitychange', () => {
    if (entryVisible && document.visibilityState === 'visible') track('entry');
  });
  choice?.addEventListener('change', () => {
    if (entryVisible && document.visibilityState === 'visible') track('entry');
  });
  const click = event => {
    if (event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
    const link = event.target.closest('a[data-photo-step]');
    if (!link || !workflow.contains(link)) return;
    const action = link.dataset.photoStep;
    if (!['check_resize', 'arrange', 'name_download', 'walkthrough'].includes(action)) return;
    // A link activation also establishes entry if the heading was scrolled past.
    track('entry');
    track(action);
  };
  workflow.addEventListener('click', click);
  workflow.addEventListener('auxclick', click);
})();
