// Menghubungkan UI web ke mesin native (yt-dlp di dalam app) lewat AndroidBridge.
// Hanya dimuat di APK; di desktop UI memakai server.js lewat HTTP.
(() => {
  const B = window.AndroidBridge; if (!B) return;
  document.documentElement.classList.add('android');
  const pending = {}; let n = 0;
  window.__ngResolve = (id, txt) => { const r = pending[id]; delete pending[id]; if (r) r(txt); };
  const call = (method, path, body) => new Promise(res => { const id = ++n; pending[id] = res; B.call(id, method, path, body || ''); });
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    const u = new URL(url, location.href);
    if (!u.pathname.startsWith('/api/')) return realFetch(url, opts);
    return call(opts.method || 'GET', u.pathname, opts.body).then(txt => ({ ok: true, json: async () => JSON.parse(txt) }));
  };
  window.EventSource = class {
    constructor() {
      let busy = false, last = '';
      this.t = setInterval(async () => {
        if (busy) return; busy = true;
        try { const txt = await call('GET', '/api/jobs'); if (txt !== last || this._k++ % 5 === 0) { last = txt; if (this.onmessage) this.onmessage({ data: txt }); } } finally { busy = false; }
      }, 700); this._k = 1;
    }
    close() { clearInterval(this.t); }
  };
})();
