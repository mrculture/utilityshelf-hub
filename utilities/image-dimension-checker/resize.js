(() => {
  const get = id => document.getElementById(id);
  const edge = get('maxEdge'), prepare = get('prepareResize'), download = get('downloadResized');
  const status = get('resizeStatus'), output = get('resizeResults');
  let batch = null, revision = 0, prepared = null;
  const previewUrls = [];
  function clear() {
    revision++; prepared = null; download.disabled = true; output.replaceChildren();
    for (const url of previewUrls.splice(0)) URL.revokeObjectURL(url);
  }
  function problem() {
    if (!batch?.items.length) return 'Choose photos and valid limits first.';
    if (!edge.checkValidity()) return 'Enter a whole maximum long edge from 16 to 8000 pixels, or leave it blank.';
    if (batch.items.some(item => item.error)) return 'Resolve unreadable photos before preparing the complete batch.';
    if (batch.items.length > 30 || batch.items.reduce((n,item) => n + item.bytes, 0) > 100000000) return 'Use no more than 30 photos and 100 MB combined.';
    if (batch.items.some(item => item.width * item.height > 40000000)) return 'Use photos of 40 megapixels or fewer for resizing.';
    if (typeof window.UtilityShelfPhotoZip !== 'function') return 'ZIP support could not load. Reload the page and try again.';
    return '';
  }
  function refresh() {
    clear(); const issue = problem(); prepare.disabled = Boolean(issue);
    status.textContent = issue || 'Ready to prepare copies against the current limits. Review the results before downloading.';
  }
  window.UtilityShelfResize = {
    reset() { batch = null; refresh(); },
    setBatch(items, limits, mode, source) { batch = {items:[...items], limits, mode, source}; refresh(); }
  };
  edge.addEventListener('input', refresh);
  const checkCurrent = id => { if (revision !== id) throw new Error('Cancelled'); };
  function encode(canvas, quality) {
    return new Promise((resolve,reject) => canvas.toBlob(blob => {
      if (!blob || blob.type !== 'image/jpeg') reject(new Error('This browser could not create a JPEG copy.'));
      else resolve(blob);
    }, 'image/jpeg', quality));
  }
  function copyName(item, index, changed, bytes) {
    const stem = item.name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,100) || 'photo';
    const ext = changed || (bytes[0] === 255 && bytes[1] === 216) ? '.jpg' : bytes[0] === 137 ? '.png' : '.webp';
    return String(index + 1).padStart(2,'0') + '-' + stem + (changed ? '-resized' : '') + ext;
  }
  async function shrink(item, limits, maxEdge, id) {
    const {minWidth,minHeight,maxBytes} = limits;
    if (item.width < minWidth || item.height < minHeight) throw new Error('Below the minimum dimensions. Choose a larger original; this tool does not enlarge photos.');
    const changed = item.bytes > maxBytes || Math.max(item.width,item.height) > maxEdge;
    if (!changed) return {blob:item.file,width:item.width,height:item.height,changed:false};
    const floorScale = Math.max(minWidth/item.width,minHeight/item.height);
    const ceilingScale = Math.min(1,maxEdge/Math.max(item.width,item.height),Math.sqrt(16000000/(item.width*item.height)));
    if (ceilingScale + 1e-10 < floorScale) throw new Error('Maximum long edge or rendering limit conflicts with the minimum dimensions. Adjust the limits.');
    const image = await createImageBitmap(item.file);
    const canvas = document.createElement('canvas');
    try {
      checkCurrent(id);
      const scales = [...new Set([...Array.from({length:7},(_,i)=>Math.max(floorScale,ceilingScale * .8 ** i)),floorScale])];
      for (const scale of scales) {
        checkCurrent(id);
        canvas.width = Math.max(minWidth,Math.floor(item.width * scale + 1e-8));
        canvas.height = Math.max(minHeight,Math.floor(item.height * scale + 1e-8));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('This browser could not prepare a resized image.');
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image,0,0,canvas.width,canvas.height);
        for (const quality of [.92,.85,.75,.65]) {
          const blob = await encode(canvas,quality); checkCurrent(id);
          if (blob.size > maxBytes) continue;
          const decoded = await createImageBitmap(blob);
          try {
            checkCurrent(id);
            if (decoded.width < minWidth || decoded.height < minHeight || Math.max(decoded.width,decoded.height) > maxEdge) throw new Error('The generated copy did not meet the selected dimensions.');
            return {blob,width:decoded.width,height:decoded.height,changed:true};
          } finally { decoded.close(); }
        }
      }
      throw new Error('Could not meet the file-size limit while preserving the minimum dimensions and supported JPEG quality. Increase the maximum size or choose another original.');
    } finally { image.close(); canvas.width = canvas.height = 1; }
  }
  prepare.addEventListener('click', async () => {
    if (prepare.disabled || problem()) return;
    clear(); const id = revision, snapshot = batch, maxEdge = edge.value ? edge.valueAsNumber : Infinity;
    prepare.disabled = true;
    const copies = [], entries = [];
    let currentName = '';
    try {
      for (const [index,item] of snapshot.items.entries()) {
        currentName = item.name;
        status.textContent = 'Preparing photo ' + (index + 1) + ' of ' + snapshot.items.length + '…';
        const result = await shrink(item,snapshot.limits,maxEdge,id); checkCurrent(id);
        const bytes = new Uint8Array(await result.blob.arrayBuffer()); checkCurrent(id);
        const name = copyName(item,index,result.changed,bytes);
        entries.push({name,bytes}); copies.push({...result,name,original:item.name,originalWidth:item.width,originalHeight:item.height,originalBytes:item.bytes});
      }
      const {minWidth,minHeight,maxBytes} = snapshot.limits;
      const changed = copies.filter(item=>item.changed).length;
      const report = ['UtilityShelf resized photo report','Status: Passed',
        'Minimum dimensions: ' + minWidth + ' x ' + minHeight + ' px.',
        'Maximum file size: ' + maxBytes + ' bytes. Maximum long edge: ' + (Number.isFinite(maxEdge) ? maxEdge + ' px.' : 'not set.'),
        copies.length + ' photos checked. ' + changed + ' modified; ' + (copies.length-changed) + ' kept original bytes.', '',
        ...copies.map((item,index)=>[(index+1)+'. Original: '+JSON.stringify(item.original),'Copy: '+JSON.stringify(item.name),
          'Before: '+item.originalWidth+' x '+item.originalHeight+' px; '+item.originalBytes+' bytes.',
          'After: '+item.width+' x '+item.height+' px; '+item.blob.size+' bytes.',
          item.changed?'JPEG copy; original EXIF metadata not copied.':'Original file bytes retained.', 'Result: Pass.'].join('\r\n')),
        '', 'Original files remain unchanged. Inspect focus, detail, colour and orientation before publishing. Modified copies are lossy JPEGs with a white background. Files already within limits keep their original bytes and metadata.'].join('\r\n\r\n')+'\r\n';
      entries.push({name:'resize-report.txt',bytes:new TextEncoder().encode(report)});
      checkCurrent(id); prepared = {entries,mode:snapshot.mode,source:snapshot.source};
      const table = document.createElement('table'), head = table.createTHead().insertRow();
      for (const title of ['Original → copy','Before','After','Result']) { const th=document.createElement('th');th.scope='col';th.textContent=title;head.append(th); }
      const body = table.createTBody();
      for (const item of copies) {
        const row = body.insertRow();
        for (const value of [item.original+' → '+item.name,item.originalWidth+' × '+item.originalHeight+'; '+item.originalBytes+' bytes',item.width+' × '+item.height+'; '+item.blob.size+' bytes',item.changed?'Pass — modified JPEG':'Pass — original bytes']) row.insertCell().textContent=value;
      }
      const wrap=document.createElement('div');wrap.className='table-wrap';wrap.append(table);output.append(wrap);
      for (const item of copies) {
        const figure=document.createElement('figure'), preview=document.createElement('img'), caption=document.createElement('figcaption');
        const url=URL.createObjectURL(item.blob);previewUrls.push(url);
        preview.src=url;preview.alt='Checked copy: '+item.name;preview.width=240;preview.loading='lazy';preview.decoding='async';
        caption.textContent=item.name;figure.append(preview,caption);output.append(figure);
      }
      download.disabled=false;
      status.textContent=copies.length+' of '+copies.length+' copies meet all selected limits. '+changed+' modified; '+(copies.length-changed)+' kept original bytes. Review before downloading.';
      window.UtilityShelfUsage?.track('image-dimension-checker','resize_complete',snapshot.mode,snapshot.source);
    } catch (error) {
      if (revision===id) { prepared=null;download.disabled=true;output.replaceChildren();for(const url of previewUrls.splice(0)) URL.revokeObjectURL(url);status.textContent='No ZIP prepared. '+JSON.stringify(currentName)+': '+(error.name==='Error'?error.message:'The photo could not be read or encoded. Try another file.'); }
    } finally { if (revision===id) prepare.disabled=Boolean(problem()); }
  });
  download.addEventListener('click', () => {
    if (download.disabled || !prepared) return;
    let url;
    try {
      url=URL.createObjectURL(window.UtilityShelfPhotoZip(prepared.entries));
      const link=document.createElement('a');link.href=url;link.download='checked-photo-copies.zip';link.click();
      window.UtilityShelfUsage?.track('image-dimension-checker','resize_download',prepared.mode,prepared.source);
    } catch { status.textContent='The ZIP download could not start. Try again.'; }
    finally { if(url)setTimeout(()=>URL.revokeObjectURL(url),30000); }
  });
})();
