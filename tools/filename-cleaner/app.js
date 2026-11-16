    const byId = id => document.getElementById(id);
    const names = byId('names'), style = byId('style'), rows = byId('rows');
    const mode = byId('mode'), prefix = byId('prefix'), start = byId('start'), digits = byId('digits');
    const examples = ['Front View.JPG','front_view.jpg','Side (Left).png','Rear – Detail 02.jpeg','Box & Accessories.webp'];
    let batch = [];
    let inputSource = 'custom', readyTimer;
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
            (destination.origin === 'https://utilityshelf.site' && ['/', '/guides/prepare-product-photos-for-ebay', '/utilities/image-contact-sheet/', '/utilities/image-dimension-checker/'].includes(destination.pathname))) {
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

    // Only fixed categories leave the browser. Never pass input values to this function.
    const trackingAllowed = () => !usageTestMode && byId('usage').checked && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl;
    if (!trackingAllowed()) { byId('usage').checked = false; byId('usage').disabled = true; }
    function track(event, eventMode = mode.value, source = inputSource) {
      if (!trackingAllowed() || location.hostname !== 'filename-cleaner.utilityshelf.site' || navigator.webdriver || new URLSearchParams(location.search).has('release-check')) return;
      if (!['ready','copy','mapping_download','zip_download'].includes(event) || !['clean','numbered'].includes(eventMode) || !['sample','custom'].includes(source)) return;
      const id = [event,eventMode,source].join(':');
      if (recorded.has(id)) return;
      recorded.add(id); // Deduplicate fixed event/mode/source combinations per page load.
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
      refreshPhotoZip();
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
    const listPicker = byId('filenameListFile'), listStatus = byId('filenameListStatus');
    let listReadRevision = 0, readingList = false;
    function cancelListRead() {
      listReadRevision++;
      if (readingList) listStatus.textContent = 'List loading cancelled because you made another change. Choose the list again if needed.';
      readingList = false;
    }
    for (const event of ['input','change']) document.addEventListener(event, e => {
      if (e.target !== listPicker) cancelListRead();
    });
    byId('sample').addEventListener('click', cancelListRead);
    byId('loadFilenameList').addEventListener('click', () => { listPicker.value = ''; listPicker.click(); });
    listPicker.addEventListener('change', async () => {
      const file = listPicker.files[0]; listPicker.value = '';
      if (!file) return;
      const revision = ++listReadRevision;
      readingList = true; listStatus.textContent = 'Reading filename list…';
      try {
        if (!file.size || file.size > 131072) throw new Error('Choose a non-empty text file no larger than 128 KiB.');
        let bytes;
        try { bytes = await file.arrayBuffer(); } catch { throw new Error('The file could not be read. Select it again.'); }
        if (revision !== listReadRevision) return;
        let text;
        try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); } catch { throw new Error('Save the list as UTF-8 text and try again.'); }
        const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).filter(line => line.trim());
        if (!lines.length || lines.length > 1000) throw new Error('Use between 1 and 1,000 filenames, one per line.');
        if (lines.some(line => /[\\/\u0000-\u001f\u007f]/.test(line))) throw new Error('Use filenames only, without folder paths or control characters.');
        names.value = lines.join('\n'); inputSource = 'custom'; rebuild(true);
        listStatus.textContent = 'Loaded ' + lines.length + ' filenames in file order. Review the proposed names and select the matching photos for the ZIP.';
      } catch (error) {
        if (revision === listReadRevision) listStatus.textContent = 'List not loaded. ' + error.message + ' Your previous list and results are unchanged.';
      } finally { if (revision === listReadRevision) readingList = false; }
    });
    const settingsPicker = byId('settingsFile'), savedSettingsStatus = byId('settingsStatus');
    let settingsReadRevision = 0, readingSettings = false;
    function cancelSettingsRead() {
      settingsReadRevision++;
      if (readingSettings) savedSettingsStatus.textContent = 'Settings loading cancelled because you made another change. Choose the file again if needed.';
      readingSettings = false;
    }
    for (const event of ['input','change']) document.addEventListener(event, e => {
      if (e.target !== settingsPicker) cancelSettingsRead();
    });
    for (const id of ['sample','clearPhotos','loadFilenameList']) byId(id).addEventListener('click', cancelSettingsRead);
    function checkedNamingSettings(value) {
      const fields = ['tool','version','mode','prefix','start','digits','style'];
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field)) ||
          value.tool !== 'utilityshelf-filename-cleaner' || value.version !== 1)
        throw Error('Choose a version-1 Filename Cleaner settings file.');
      if (!['clean','numbered'].includes(value.mode) || !['-','_',' '].includes(value.style) || ![2,3,4].includes(value.digits))
        throw Error('Use a supported mode, naming style and digit count.');
      if (!Number.isSafeInteger(value.start) || value.start < 1 || value.start > 999999)
        throw Error('Use a whole start number from 1 to 999999.');
      if (typeof value.prefix !== 'string' || value.prefix.length > 200 || /[\\/\u0000-\u001f\u007f]/.test(value.prefix) ||
          (value.prefix.trim() && !/[\p{L}\p{N}]/u.test(value.prefix)))
        throw Error('Use a prefix of up to 200 characters with letters or numbers, without paths or control characters; blank uses “photo”.');
      if (value.mode === 'numbered' && value.start + Math.max(0,batch.length-1) > 999999)
        throw Error('The start number leaves too little room for the current filename list. Use a lower start number or a smaller batch.');
      return value;
    }
    byId('saveSettings').addEventListener('click', () => {
      cancelSettingsRead();
      let url, link;
      try {
        const settings = checkedNamingSettings({tool:'utilityshelf-filename-cleaner',version:1,
          mode:mode.value,prefix:prefix.value,start:Number(start.value),digits:Number(digits.value),style:style.value});
        url = URL.createObjectURL(new Blob([JSON.stringify(settings,null,2) + '\n'], {type:'application/json'}));
        link = document.createElement('a'); link.href = url; link.download = 'filename-cleaner-settings.json';
        document.body.append(link); link.click();
        savedSettingsStatus.textContent = 'Settings download started. Keep this file to reuse your naming setup; review the SKU prefix and start number for each new product.';
      } catch (error) {
        savedSettingsStatus.textContent = 'Settings not saved. ' + error.message;
      } finally {
        link?.remove();
        if (url) setTimeout(() => URL.revokeObjectURL(url),30000);
      }
    });
    byId('loadSettings').addEventListener('click', () => {
      cancelSettingsRead(); cancelListRead(); settingsPicker.value = ''; settingsPicker.click();
    });
    settingsPicker.addEventListener('change', async () => {
      const file = settingsPicker.files[0]; settingsPicker.value = '';
      if (!file) return;
      cancelListRead();
      const revision = ++settingsReadRevision;
      readingSettings = true; savedSettingsStatus.textContent = 'Reading naming settings…';
      try {
        if (!file.size || file.size > 8192) throw Error('Choose a non-empty settings file no larger than 8 KiB.');
        let bytes;
        try { bytes = await file.arrayBuffer(); } catch { throw Error('The settings file could not be read. Select it again.'); }
        if (revision !== settingsReadRevision) return;
        let value;
        try { value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
        catch { throw Error('The file must contain valid UTF-8 JSON.'); }
        const settings = checkedNamingSettings(value);
        mode.value = settings.mode; prefix.value = settings.prefix; start.value = String(settings.start);
        digits.value = String(settings.digits); style.value = settings.style;
        byId('numbering').hidden = settings.mode !== 'numbered';
        rebuild(true);
        savedSettingsStatus.textContent = 'Settings loaded. Proposed names have been regenerated; the original list, photo selection and privacy choice are unchanged. Review the prefix and start number before downloading.';
      } catch (error) {
        if (revision === settingsReadRevision) savedSettingsStatus.textContent = 'Settings not loaded. ' + error.message + ' Your current settings and results are unchanged.';
      } finally { if (revision === settingsReadRevision) readingSettings = false; }
    });
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
    function mappingText(items = batch) {
      const pairs = items.map((item, index) =>
        (index + 1) + '.\r\nOriginal: ' + item.original + '\r\nNew: ' + item.value);
      return 'UtilityShelf filename mapping\r\n' +
        'Match each original file to its new name. This list does not rename files.\r\n\r\n' +
        pairs.join('\r\n\r\n') + '\r\n';
    }
    byId('downloadMapping').addEventListener('click', () => {
      if (byId('downloadMapping').disabled || !batch.length) return;
      const text = mappingText();
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
    const photoFiles = byId('photoFiles'), zipButton = byId('downloadZip'), zipStatus = byId('zipStatus');
    let zipRevision = 0;
    function photoMatching() {
      const expected = batch.map(item => item.original);
      const selected = Array.from(photoFiles.files, file => file.name);
      const groups = values => {
        const result = new Map();
        for (const name of values) {
          const id = key(name);
          if (!result.has(id)) result.set(id, []);
          result.get(id).push(name);
        }
        return result;
      };
      const expectedGroups = groups(expected), selectedGroups = groups(selected);
      const missing = [...new Set(expected)].filter(name => !selected.includes(name));
      const extra = [...new Set(selected)].filter(name => !expected.includes(name));
      return {
        missing, extra,
        repeatedEntries: [...expectedGroups.values()].filter(group => group.length > 1),
        repeatedFiles: [...selectedGroups.values()].filter(group => group.length > 1),
        spelling: missing.filter(name => selectedGroups.has(key(name))).map(name => ({
          expected: name, selected: [...new Set(selectedGroups.get(key(name)))]
        }))
      };
    }
    function renderPhotoMatching(match) {
      const details = byId('photoMatchDetails'), output = byId('photoMatchIssues');
      output.replaceChildren();
      if (!photoFiles.files.length || !batch.length) { details.hidden = true; return; }
      const quote = name => JSON.stringify(name);
      const describeGroup = group => {
        const counts = new Map();
        for (const name of group) counts.set(name, (counts.get(name) || 0) + 1);
        return [...counts].map(([name,count]) => quote(name) + (count > 1 ? ' × ' + count : '')).join(', ');
      };
      const sections = [
        ['Missing photos', 'Select these exact filenames, or update the original list if you replaced or removed a photo.', match.missing.map(quote)],
        ['Unexpected photos', 'Leave these out of the selection, or update the original list if they are the replacements you want.', match.extra.map(quote)],
        ['Duplicate or ambiguous list entries', 'Use each original filename once. Names differing only in case or Unicode spelling are also ambiguous.', match.repeatedEntries.map(describeGroup)],
        ['Duplicate or ambiguous selected files', 'Select only one file for each original name. Rename different photos that share a name before updating the list and selecting them again.', match.repeatedFiles.map(describeGroup)],
        ['Case or Unicode spelling differences', 'Matching is exact. Correct the original list to the selected spelling, or select the file with the listed name. These also appear as missing and unexpected above.', match.spelling.map(item => 'List: ' + quote(item.expected) + ' — selected: ' + item.selected.map(quote).join(', '))]
      ];
      for (const [title, advice, items] of sections) {
        if (!items.length) continue;
        const section = document.createElement('section'), heading = document.createElement('h4');
        heading.textContent = title + ' (' + items.length + ')';
        const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = advice;
        const list = document.createElement('ul');
        for (const text of items.slice(0,30)) {
          const item = document.createElement('li'); item.textContent = text; list.append(item);
        }
        section.append(heading,hint,list);
        if (items.length > 30) {
          const more = document.createElement('p'); more.textContent = 'Showing the first 30 of ' + items.length + '. Split larger batches into at most 30 photos per ZIP.'; section.append(more);
        }
        output.append(section);
      }
      details.hidden = !output.children.length;
    }
    function photoZipIssue(match = photoMatching()) {
      const files = Array.from(photoFiles.files);
      if (byId('downloadMapping').disabled) return 'Finish reviewing a valid filename list first.';
      if (!files.length) return 'Select the original photos that match your reviewed list.';
      if (files.length > 30 || batch.length > 30) return 'Batch too large: ' + Math.max(files.length, batch.length) + ' photos. Choose no more than 30 photos per ZIP. No ZIP was created; split the batch and try again.';
      if (files.some(file => !file.size || file.size > 32000000)) return 'Each photo must contain data and be no larger than 32 MB.';
      if (files.reduce((total,file) => total + file.size, 0) > 100000000) return 'Keep the combined photo size at or below 100 MB.';
      if (match.repeatedEntries.length || match.repeatedFiles.length) return 'Ambiguous original filenames. Resolve the duplicate or ambiguous names shown below before downloading.';
      if (match.missing.length || match.extra.length) return 'Files do not match the list: ' + match.missing.length + ' missing, ' + match.extra.length + ' unexpected. Check the filenames below; spelling and case must match exactly.';
      if (batch.some(item => !/\.(jpe?g|png|webp)$/i.test(item.original))) return 'ZIP copies support JPEG, PNG and WebP photos only.';
      if (typeof window.UtilityShelfPhotoZip !== 'function') return 'ZIP support could not load. Reload the page and try again.';
      return '';
    }
    function refreshPhotoZip() {
      zipRevision++;
      const match = photoMatching();
      renderPhotoMatching(match);
      const issue = photoZipIssue(match);
      zipButton.disabled = Boolean(issue);
      zipStatus.textContent = issue || batch.length + ' photos matched by original filename. Ready to download renamed copies and the mapping.';
    }
    photoFiles.addEventListener('change', refreshPhotoZip);
    byId('clearPhotos').addEventListener('click', () => { photoFiles.value = ''; refreshPhotoZip(); });
    zipButton.addEventListener('click', async () => {
      if (zipButton.disabled || photoZipIssue()) return;
      const revision = ++zipRevision, items = batch.map(({original,value}) => ({original,value}));
      const files = new Map(Array.from(photoFiles.files, file => [file.name,file]));
      const eventMode = mode.value;
      zipButton.disabled = true; zipStatus.textContent = 'Preparing renamed copies…';
      let url, link;
      try {
        const entries = [];
        for (const item of items) {
          const bytes = new Uint8Array(await files.get(item.original).arrayBuffer());
          if (revision !== zipRevision) return;
          const ext = splitName(item.original)[1].toLowerCase();
          const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
          const png = [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n);
          const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
          if (!((['.jpg','.jpeg'].includes(ext) && jpeg) || (ext === '.png' && png) || (ext === '.webp' && webp))) throw Error('A selected file does not match its JPEG, PNG or WebP extension. Check your originals before trying again.');
          entries.push({name:item.value,bytes});
        }
        entries.push({name:'filename-mapping.txt',bytes:new TextEncoder().encode('\uFEFF' + mappingText(items))});
        url = URL.createObjectURL(window.UtilityShelfPhotoZip(entries));
        if (revision !== zipRevision) return;
        link = document.createElement('a'); link.href = url; link.download = 'renamed-photos.zip';
        document.body.append(link); link.click();
        track('zip_download', eventMode, 'custom');
        zipStatus.textContent = 'ZIP download started: ' + items.length + ' renamed photo copies and filename-mapping.txt. Original image bytes and embedded metadata are unchanged.';
      } catch (error) {
        if (revision === zipRevision) zipStatus.textContent = 'ZIP not created. ' + (error.name === 'Error' ? error.message : 'A photo could not be read or the download could not start. Reselect your photos and try again.');
      } finally {
        link?.remove();
        if (url) setTimeout(() => URL.revokeObjectURL(url),30000);
        if (revision === zipRevision) zipButton.disabled = Boolean(photoZipIssue());
      }
    });
    if (location.hash === '#five-photo-example') { inputSource = 'sample'; names.value = examples.join('\n'); }
    rebuild();
