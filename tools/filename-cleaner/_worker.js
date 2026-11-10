// No request headers, IPs, filenames, prefixes or arbitrary strings are persisted.
const productionOrigin = 'https://filename-cleaner.utilityshelf.site';
const reply = (status, text = '') => new Response(text || null, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/usage') return env.ASSETS.fetch(request);
    if (url.origin !== productionOrigin) return reply(403);
    // A non-writing health check lets the release gate verify the binding.
    if (request.method === 'GET') return reply(env.USAGE ? 200 : 503, env.USAGE ? 'Usage collector ready' : 'Usage collector unavailable');
    if (request.method !== 'POST') return reply(405);
    if (request.headers.get('Origin') !== productionOrigin || request.headers.get('Content-Type') !== 'application/json') return reply(403);
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
      if (!data || Array.isArray(data) || Object.keys(data).sort().join(',') !== 'event,mode,source' || !['ready','copy'].includes(data.event) || !['clean','numbered'].includes(data.mode) || !['sample','custom'].includes(data.source)) return reply(400);
      env.USAGE.writeDataPoint({indexes:['filename-cleaner'],blobs:[data.event,data.mode,data.source],doubles:[1]});
      return reply(204);
    } catch { return reply(400); }
  }
};
