    const byId = id => document.getElementById(id);
    const names = byId('names'), style = byId('style'), rows = byId('rows');
    const mode = byId('mode'), prefix = byId('prefix'), start = byId('start'), digits = byId('digits');
    const examples = ['Front View.JPG','front_view.jpg','Side (Left).png','Rear – Detail 02.jpeg','Box & Accessories.webp'];
    let batch = [];
    let inputSource = 'custom', readyTimer;
    const recorded = new Set();
    // Only fixed categories leave the browser. Never pass input values to this function.
    const trackingAllowed = () => byId('usage').checked && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl;
    if (!trackingAllowed()) { byId('usage').checked = false; byId('usage').disabled = true; }
    function track(event, eventMode = mode.value, source = inputSource) {
      if (!trackingAllowed() || location.hostname !== 'filename-cleaner.utilityshelf.site' || navigator.webdriver || new URLSearchParams(location.search).has('release-check')) return;
      if (!['ready','copy','mapping_download'].includes(event) || !['clean','numbered'].includes(eventMode) || !['sample','custom'].includes(source)) return;
      const id = [event,eventMode,source].join(':');
      if (recorded.has(id)) return;
      recorded.add(id); // At most twelve events per page load, even if a request fails.
      fetch('/usage', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({event,mode:eventMode,source}), credentials:'omit', referrerPolicy:'no-referrer', keepalive:true}).catch(() => {});
    }
    byId('usage').addEventListener('change', () => { clearTimeout(readyTimer); });
    function splitName(name) {
      const dot = name.lastIndexOf('.');
      return dot > 0 && dot < name.length - 1 ? [name.slice(0,dot), name.slice(dot)] : [name,''];
    }
    function suggest(original, separator) {
      if (/[\\/]/.test(original)) return '';
      const [stem, ext] = splitName(original.trim());
      const cleaned = stem.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu);
      return (stem.startsWith('.') ? '.' : '') + (cleaned || []).join(separator) + ext;
    }
    function key(value) { return value.normalize('NFC').toLowerCase(); }
    function settingsIssue() {
      if (mode.value !== 'numbered') return '';
      const count = names.value.split(/\r?\n/).filter(line => line.trim()).length;
      const number = Number(start.value);
      if (!start.value || !Number.isSafeInteger(number) || number < 1 || number + Math.max(0,count-1) > 999999) return 'Use a whole start number from 1 to 999999, leaving room for every filename.';
      if (prefix.value.trim() && (!prefix.value.match(/[\p{L}\p{N}]/u) || /[\\/]/.test(prefix.value))) return 'Use letters or numbers in the prefix, without a folder path.';
      return '';
    }
    function proposed(original, index, settingError) {
      if (mode.value !== 'numbered') return suggest(original,style.value);
      if (settingError || /[\\/]/.test(original)) return '';
      const words = (prefix.value.trim() || 'photo').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) || [];
      return words.join(style.value) + style.value + String(Number(start.value) + index).padStart(Number(digits.value),'0') + splitName(original.trim())[1];
    }
    function issueFor(item, counts) {
      const value = item.value;
      if (/[\\/]/.test(item.original)) return 'Replace the path in the original list with just the filename.';
      if (!value.trim() || /^\.+$/.test(value)) return 'Enter a filename.';
      const ext = splitName(item.original.trim())[1];
      if (ext && (!value.endsWith(ext) || value.length === ext.length)) return 'Keep a name before the original extension ' + ext + '.';
      if (/[<>:"/\\|?*\u0000-\u001f]/.test(value) || /[. ]$/.test(value) || /^\s/.test(value)) return 'Remove unsupported characters or spaces at the edges.';
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) return 'Choose a different name. This one is reserved on Windows.';
      if (new TextEncoder().encode(value).length > 255) return 'Shorten this name to 255 bytes or fewer.';
      if (counts.get(key(value)) > 1) return 'Duplicate in this batch. Give one of the matching files a different name.';
      return '';
    }
    function update() {
      clearTimeout(readyTimer);
      const counts = new Map();
      for (const {value} of batch) counts.set(key(value), (counts.get(key(value)) || 0) + 1);
      let problems = 0;
      batch.forEach(item => {
        const issue = issueFor(item, counts);
        item.note.textContent = issue;
        item.input.setAttribute('aria-invalid', String(Boolean(issue)));
        if (issue) problems++;
      });
      byId('summary').textContent = !batch.length ? 'Paste filenames or try the sample.' : problems ? problems + ' of ' + batch.length + ' names need review.' : batch.length + (batch.length === 1 ? ' name ready.' : ' names ready.');
      const settingError = settingsIssue();
      byId('settingsIssue').textContent = settingError;
      if (settingError && batch.length) byId('summary').textContent = 'Check the numbering settings before copying.';
      const ready = batch.length > 0 && problems === 0 && !settingError;
      byId('copy').disabled = !ready;
      byId('downloadMapping').disabled = !ready;
      byId('mappingStatus').textContent = '';
      byId('result').value = ready ? batch.map(item => item.value).join('\n') : '';
      byId('manual').hidden = !ready;
      byId('copyStatus').textContent = '';
      // Count a stable valid list, not every keystroke or intermediate suggestion.
      if (ready) readyTimer = setTimeout(() => track('ready'),1500);
    }
    function rebuild(reset = false) {
      const prior = new Map(batch.map(item => [item.id,item.value]));
      const occurrences = new Map();
      const settingError = settingsIssue();
      batch = [];
      rows.replaceChildren();
      for (const original of names.value.split(/\r?\n/).filter(line => line.trim())) {
        const seq = (occurrences.get(original) || 0) + 1;
        occurrences.set(original,seq);
        const id = JSON.stringify([original,seq]);
        const value = !reset && mode.value === 'clean' && prior.has(id) ? prior.get(id) : proposed(original,batch.length,settingError);
        const row = document.createElement('div'); row.className = 'pair';
        const left = document.createElement('div'); left.className = 'original'; left.textContent = original;
        const right = document.createElement('div'), label = document.createElement('label'), input = document.createElement('input'), note = document.createElement('div');
        const index = batch.length + 1;
        label.textContent = 'Proposed name ' + index; label.htmlFor = input.id = 'name-' + index;
        input.value = value; input.spellcheck = false;
        note.id = 'issue-' + index; note.className = 'issue'; input.setAttribute('aria-describedby',note.id);
        const item = {id, original, value, input, note};
        input.addEventListener('input', () => { item.value = input.value; update(); });
        right.append(label,input,note); row.append(left,right); rows.append(row); batch.push(item);
      }
      update();
    }
    names.addEventListener('input', () => { inputSource = 'custom'; rebuild(); });
    style.addEventListener('change', () => rebuild(true));
    mode.addEventListener('change', () => { byId('numbering').hidden = mode.value !== 'numbered'; rebuild(true); });
    prefix.addEventListener('input', () => rebuild(true));
    start.addEventListener('input', () => rebuild(true));
    digits.addEventListener('change', () => rebuild(true));
    byId('sample').addEventListener('click', () => { inputSource = 'sample'; names.value = examples.join('\n'); rebuild(true); });
    function selectList() {
      byId('result').focus();
      byId('result').select();
    }
    byId('selectList').addEventListener('click', selectList);
    byId('downloadMapping').addEventListener('click', () => {
      if (byId('downloadMapping').disabled || !batch.length) return;
      const pairs = batch.map((item, index) =>
        (index + 1) + '.\r\nOriginal: ' + item.original + '\r\nNew: ' + item.value);
      const text = 'UtilityShelf filename mapping\r\n' +
        'Match each original file to its new name. This list does not rename files.\r\n\r\n' +
        pairs.join('\r\n\r\n') + '\r\n';
      let url;
      const link = document.createElement('a');
      try {
        url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
        link.href = url;
        link.download = 'filename-mapping.txt';
        document.body.append(link);
        link.click();
        track('mapping_download');
        byId('mappingStatus').textContent = 'Filename mapping download started: ' + batch.length +
          (batch.length === 1 ? ' pair.' : ' pairs.');
      } catch {
        byId('mappingStatus').textContent = 'The download could not start. Try again, or use the original and proposed names above.';
      } finally {
        link.remove();
        if (url) setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    });
    byId('result').addEventListener('copy', event => {
      const result = byId('result');
      if (result.value && result.selectionStart === 0 && result.selectionEnd === result.value.length) {
        const eventMode = mode.value, source = inputSource;
        // Wait for the native copy action; selecting text alone is not a copy.
        setTimeout(() => { if (event.isTrusted && !event.defaultPrevented) track('copy',eventMode,source); },0);
      }
    });
    byId('copy').addEventListener('click', async () => {
      const list = byId('result').value;
      if (!list || byId('copy').disabled) return;
      const eventMode = mode.value, source = inputSource;
      try {
        await navigator.clipboard.writeText(list);
        if (byId('result').value !== list) return;
        byId('copyStatus').textContent = 'Copied the final list.';
        track('copy',eventMode,source);
      } catch {
        if (byId('result').value !== list) return;
        selectList();
        byId('copyStatus').textContent = 'List selected. Press Ctrl+C or ⌘C to copy.';
      }
    });
    if (location.hash === '#five-photo-example') { inputSource = 'sample'; names.value = examples.join('\n'); }
    rebuild();
