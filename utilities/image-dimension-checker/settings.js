(() => {
  const get = id => document.getElementById(id);
  const fields = ['preset', 'width', 'height', 'size', 'maxEdge'];
  const message = get('settingsStatus'), picker = get('settingsFile');
  let revision = 0;
  const keys = ['tool', 'version', 'preset', 'minimumWidth', 'minimumHeight', 'maximumSizeMB', 'maximumLongEdge'];
  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) ||
        value.tool !== 'utilityshelf-image-dimension-checker' || value.version !== 1) {
      throw new Error('Choose a supported Image Dimension Checker settings file (version 1).');
    }
    const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
    if (!['custom', 'ebay'].includes(value.preset) ||
        !integer(value.minimumWidth, 1, 100000) || !integer(value.minimumHeight, 1, 100000) ||
        typeof value.maximumSizeMB !== 'number' || !Number.isFinite(value.maximumSizeMB) || value.maximumSizeMB < .001 || value.maximumSizeMB > 32 ||
        (value.maximumLongEdge !== null && !integer(value.maximumLongEdge, 16, 8000))) {
      throw new Error('Settings contain invalid limits. Check pixel dimensions, file size and maximum long edge.');
    }
    if (value.maximumLongEdge !== null && value.maximumLongEdge < Math.max(value.minimumWidth, value.minimumHeight)) {
      throw new Error('Maximum long edge cannot be smaller than either minimum dimension.');
    }
    if (value.preset === 'ebay' && (value.minimumWidth !== 1600 || value.minimumHeight !== 1600 || value.maximumSizeMB !== 12)) {
      throw new Error('The saved eBay preset does not match its supported limits. Use Custom limits for different values.');
    }
    return value;
  }
  function settings() {
    if (!fields.every(id => get(id).checkValidity())) throw new Error('Enter valid photo and resizing limits before saving settings.');
    return validate({tool:'utilityshelf-image-dimension-checker', version:1, preset:get('preset').value,
      minimumWidth:get('width').valueAsNumber, minimumHeight:get('height').valueAsNumber,
      maximumSizeMB:get('size').valueAsNumber, maximumLongEdge:get('maxEdge').value === '' ? null : get('maxEdge').valueAsNumber});
  }
  function edited() {
    revision++;
    message.textContent = 'Settings changed. Save again to reuse these limits.';
  }
  for (const id of fields) get(id).addEventListener(id === 'preset' ? 'change' : 'input', edited);
  get('demo').addEventListener('click', edited);
  get('saveSettings').addEventListener('click', () => {
    let url;
    try {
      const value = settings();
      url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], {type:'application/json'}));
      const link = document.createElement('a');
      link.href = url; link.download = 'image-dimension-settings.json'; link.click();
      message.textContent = 'Settings download started. It contains limits only, with no photos or filenames.';
    } catch (error) { message.textContent = 'Settings not saved. ' + error.message; }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 30000); }
  });
  get('loadSettings').addEventListener('click', () => { picker.value = ''; picker.click(); });
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    picker.value = '';
    if (!file) return;
    const id = ++revision;
    message.textContent = 'Reading settings…';
    try {
      if (!file.size || file.size > 8192) throw new Error('Choose a settings file no larger than 8 KB.');
      let text;
      try { text = await file.text(); } catch { throw new Error('The settings file could not be read. Try selecting it again.'); }
      if (id !== revision) return;
      let value;
      try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('The settings file is not valid JSON.'); }
      value = validate(value);
      get('preset').value = value.preset;
      get('width').value = value.minimumWidth;
      get('height').value = value.minimumHeight;
      get('size').value = value.maximumSizeMB;
      get('maxEdge').value = value.maximumLongEdge === null ? '' : value.maximumLongEdge;
      document.dispatchEvent(new Event('photo-settings-loaded'));
      message.textContent = 'Settings loaded: ' + value.minimumWidth + ' × ' + value.minimumHeight + ' px minimum, ' + value.maximumSizeMB + ' MB maximum; long edge ' +
        (value.maximumLongEdge === null ? 'not set' : value.maximumLongEdge + ' px') + '. Current photos are rechecked. Prepare resized copies again before downloading.';
    } catch (error) {
      if (id === revision) message.textContent = 'Settings not loaded. ' + error.message + ' Your current settings and results are unchanged.';
    }
  });
})();
