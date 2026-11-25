(() => {
  const partner = document.getElementById('partner');
  const error = document.getElementById('partner-error');
  const code = document.getElementById('embed-code');
  const direct = document.getElementById('direct-link');
  const copyCode = document.getElementById('copy-code');
  const copyLink = document.getElementById('copy-link');
  const status = document.getElementById('copy-status');

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
    code.value = value
      ? code.defaultValue.replace('?embed=1"', '?embed=1&amp;partner=' + value + '"')
      : code.defaultValue;
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
  copyLink.addEventListener('click', () => copy(direct, 'Link copied.'));
  updateCode();
  copyLink.disabled = false;
})();
