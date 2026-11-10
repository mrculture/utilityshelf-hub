(() => {
  const form = document.getElementById('tool-finder');
  const query = document.getElementById('tool-query');
  const category = document.getElementById('tool-category');
  const count = document.getElementById('tool-count');
  const empty = document.getElementById('tool-empty');
  const normalize = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const groups = [...document.querySelectorAll('#tools, #companions')];
  const tools = [...document.querySelectorAll('.tool-card')].map(card => ({
    card,
    categories: card.dataset.categories.split(' '),
    // Index the tool itself, not its links to other tools.
    text: normalize([card.querySelector('h3').textContent, card.querySelector('h3 + p').textContent,
      card.dataset.keywords || '', 'tool tools'].join(' '))
  }));
  function render() {
    const terms = normalize(query.value).match(/[\p{L}\p{N}]+/gu) || [];
    let visible = 0;
    for (const tool of tools) {
      const match = (category.value === 'all' || tool.categories.includes(category.value)) && terms.every(term => tool.text.includes(term));
      tool.card.hidden = !match;
      if (match) visible++;
    }
    count.textContent = 'Showing ' + visible + ' of ' + tools.length + ' tools.';
    empty.hidden = visible > 0;
    for (const group of groups) {
      const hasResults = [...group.querySelectorAll('.tool-card')].some(card => !card.hidden);
      group.querySelector('.section-heading').hidden = !hasResults;
      group.querySelector('.tool-grid').hidden = !hasResults;
      if (group.id === 'companions') group.hidden = !hasResults;
    }
  }
  function reset(focus) {
    query.value = ''; category.value = 'all'; render();
    if (focus) query.focus({preventScroll:true});
  }
  form.addEventListener('submit', event => event.preventDefault());
  query.addEventListener('input', render);
  query.addEventListener('search', render);
  category.addEventListener('change', render);
  document.getElementById('tool-reset').addEventListener('click', () => reset(true));
  document.querySelectorAll('a[href="#companions"]').forEach(link => link.addEventListener('click', () => reset(false)));
  render();
  document.getElementById('tool-fallback').hidden = true;
  form.hidden = false;
})();
