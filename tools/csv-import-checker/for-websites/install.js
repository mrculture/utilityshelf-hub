(() => {
  const checker = new URL('../', location.href);
  const partner = document.getElementById('partner');
  const error = document.getElementById('partner-error');
  const code = document.getElementById('embed-code');
  const direct = document.getElementById('direct-link');
  const copyCode = document.getElementById('copy-code');
  const status = document.getElementById('copy-status');
  direct.value = checker.href;

  function updateCode() {
    status.textContent = '';
    const value = partner.value.trim();
    const invalid = value !== '' && value !== 'supplier-pilot';
    error.textContent = invalid ? 'This code is not recognised. Check the code supplied by UtilityShelf, or clear the field for shared reporting.' : '';
    partner.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    copyCode.disabled = Boolean(invalid);
    if (invalid) {
      code.value = '';
      return;
    }
    const frame = new URL(checker);
    frame.searchParams.set('embed', '1');
    if (value) frame.searchParams.set('partner', value);
    const source = frame.href.replaceAll('&', '&amp;');
    code.value = [
      '<iframe title="CSV Import Checker"',
      '  src="' + source + '"',
      '  height="640" style="width:100%;border:0" loading="lazy"',
      '  referrerpolicy="no-referrer"></iframe>',
      '<p><a href="' + checker.href + '">Open the full CSV Import Checker</a></p>'
    ].join('\n');
  }

  async function copy(field, message) {
    try {
      await navigator.clipboard.writeText(field.value);
      status.textContent = message;
    } catch {
      field.focus();
      field.select();
      status.textContent = 'Selected. Use your device’s Copy command.';
    }
  }
  partner.addEventListener('input', updateCode);
  copyCode.addEventListener('click', () => copy(code, 'Embed code copied.'));
  document.getElementById('copy-link').addEventListener('click', () => copy(direct, 'Link copied.'));
  updateCode();
})();
