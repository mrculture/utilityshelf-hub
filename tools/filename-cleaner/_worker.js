// No request headers, IPs, filenames, prefixes or arbitrary strings are persisted.
const productionOrigin = 'https://filename-cleaner.utilityshelf.site';
const hubOrigin = 'https://utilityshelf.site';
const csvOrigin = 'https://csv-import-checker.utilityshelf.site';
const modes = {
  'filename-cleaner': {ready:['clean','numbered'], copy:['clean','numbered'], mapping_download:['clean','numbered']},
  'image-contact-sheet': {reorder:['sheet'], sheet_download:['sheet'], names_copy:['sheet']},
  'image-dimension-checker': {check_complete:['custom','ebay'], ebay_preset:['ebay']},
  'csv-import-checker': {check_complete:['passed','issues'], corrected_download:['passed'], report_download:['passed','issues','incomplete']},
  'csv-column-mapper': {build_complete:['mapped'], mapped_download:['mapped']},
  'csv-formula-checker': {scan_complete:['clear','warnings'], report_download:['passed','issues','incomplete']}
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = [productionOrigin, hubOrigin, csvOrigin].includes(origin);
    const reply = (status, text = '') => new Response(text || null, {status, headers:{
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex', 'Vary':'Origin',
      ...(allowed ? {'Access-Control-Allow-Origin':origin} : {})
    }});
    if (url.pathname !== '/usage') return env.ASSETS.fetch(request);
    if (url.origin !== productionOrigin) return reply(403);
    // A non-writing health check lets the release gate verify the binding.
    if (request.method === 'GET') return reply(env.USAGE ? 200 : 503, env.USAGE ? 'Usage collector ready' : 'Usage collector unavailable');
    if (request.method === 'OPTIONS') {
      const requested = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
      if (!allowed || request.headers.get('Access-Control-Request-Method') !== 'POST' || requested.some(h=>!['content-type','dnt','sec-gpc'].includes(h))) return reply(403);
      const response = reply(204);
      response.headers.set('Access-Control-Allow-Methods','POST');
      response.headers.set('Access-Control-Allow-Headers','Content-Type, DNT, Sec-GPC');
      return response;
    }
    if (request.method !== 'POST') return reply(405);
    if (!allowed || request.headers.get('Content-Type') !== 'application/json') return reply(403);
    if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return reply(204);
    if (!env.USAGE) return reply(503);
    if (Number(request.headers.get('Content-Length')) > 256) return reply(413);
    // Bound the stream too: Content-Length is not trusted or always present.
    const reader = request.body?.getReader();
    if (!reader) return reply(400);
    let text = '', length = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 256) { await reader.cancel(); return reply(413); }
        text += decoder.decode(value,{stream:true});
      }
      text += decoder.decode();
      const data = JSON.parse(text);
      if (!data || Array.isArray(data) || !['event,mode,source','event,mode,source,tool'].includes(Object.keys(data).sort().join(','))) return reply(400);
      // Retain compatibility with Filename Cleaner's existing three-field events.
      const tool = Object.hasOwn(data, 'tool') ? data.tool : 'filename-cleaner';
      if (![tool, data.event, data.mode, data.source].every(value => typeof value === 'string')) return reply(400);
      if (!Object.hasOwn(modes, tool) || !Object.hasOwn(modes[tool], data.event) || !modes[tool][data.event].includes(data.mode) || !['sample','custom'].includes(data.source)) return reply(400);
      if (origin !== (tool === 'filename-cleaner' ? productionOrigin : tool === 'csv-import-checker' ? csvOrigin : hubOrigin)) return reply(403);
      env.USAGE.writeDataPoint({indexes:[tool],blobs:[data.event,data.mode,data.source],doubles:[1]});
      return reply(204);
    } catch { return reply(400); }
  }
};
