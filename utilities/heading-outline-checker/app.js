'use strict';
const byId = id => document.getElementById(id);
const form = byId('builder');
const skipped = 'script, style, template, noscript, [hidden], [inert], [aria-hidden="true" i]';

function textIn(element) {
  // Walk iteratively so deeply nested pasted markup does not overflow the call stack.
  const chunks = [];
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      return node.nodeType === 1 && node.matches(skipped) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === 3) chunks.push(node.data);
    else if (node.localName === 'img') chunks.push(node.getAttribute('alt') || '');
    else if (node.localName === 'br') chunks.push(' ');
  }
  return chunks.join('').replace(/\s+/g, ' ').trim();
}
function headingOutline(html) {
  // Never adopt these nodes into the page. Template contents have an inert owner document.
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;
  return [...fragment.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(el => el.namespaceURI === 'http://www.w3.org/1999/xhtml' && !el.closest(skipped)).map(el => {
    const refs = (el.getAttribute('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean);
    const refText = refs.map(id => fragment.getElementById(id)).filter(Boolean).map(textIn).filter(Boolean).join(' ');
    const label = refText || (el.getAttribute('aria-label') || '').trim() || textIn(el);
    return { level: Number(el.localName.slice(1)), label };
  });
}
function appendItem(target, message) {
  const item = document.createElement('li'); item.textContent = message; target.append(item);
}
function run() {
  const headings = headingOutline(byId('markup').value);
  const outline = byId('outline'), notes = byId('notes');
  outline.replaceChildren(); notes.replaceChildren();
  let previous = 0;
  headings.forEach(({level, label}, i) => {
    appendItem(outline, 'H' + level + ' · ' + (label || '(empty heading)'));
    if (!label) appendItem(notes, 'Heading ' + (i + 1) + ' has no text or label. Add a name that describes its section.');
    if (previous && level > previous + 1) appendItem(notes, 'Heading ' + (i + 1) + ' goes from H' + previous + ' to H' + level + '. Check for a missing section level.');
    previous = level;
  });
  if (headings.length) {
    const h1s = headings.filter(h => h.level === 1).length;
    if (!h1s) appendItem(notes, 'No H1 in this HTML. If this is a full document, check its main heading.');
    if (h1s > 1) appendItem(notes, 'Multiple H1 headings. Review which one introduces the main content.');
  }
  const count = notes.children.length;
  byId('summary').textContent = !headings.length ? 'No visible native H1–H6 headings found in the supplied markup.' :
    headings.length + (headings.length === 1 ? ' heading. ' : ' headings. ') + (count ? count + (count === 1 ? ' point to review.' : ' points to review.') : 'No structural warnings in this outline.');
}
form.addEventListener('submit', event => { event.preventDefault(); run(); });
form.addEventListener('input', () => { byId('outline').replaceChildren(); byId('notes').replaceChildren(); byId('summary').textContent = 'Check the outline to review the edited HTML.'; });
byId('sample').addEventListener('click', () => {
  byId('markup').value = '<article>\n  <h1>Ceramic mug care</h1>\n  <h3>Washing</h3>\n  <h2>Storage</h2>\n  <h3></h3>\n</article>';
  run();
});
