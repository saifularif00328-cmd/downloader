(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  /* ---------- theme & accent ---------- */
  const root = document.documentElement;
  const mq = matchMedia('(prefers-color-scheme: light)');
  let themePref = store.get('theme', 'dark');
  function applyTheme() {
    root.dataset.theme = themePref === 'auto' ? (mq.matches ? 'light' : 'dark') : themePref;
    $$('#themeSeg button').forEach(b => b.classList.toggle('active', b.dataset.t === themePref));
  }
  mq.addEventListener('change', applyTheme);
  $('#themeBtn').onclick = () => { themePref = root.dataset.theme === 'dark' ? 'light' : 'dark'; store.set('theme', themePref); applyTheme(); };
  $$('#themeSeg button').forEach(b => b.onclick = () => { themePref = b.dataset.t; store.set('theme', themePref); applyTheme(); });
  const setAccent = a => { root.dataset.accent = a; $$('#accents button').forEach(b => b.classList.toggle('active', b.dataset.a === a)); store.set('accent', a); };
  $$('#accents button').forEach(b => b.onclick = () => setAccent(b.dataset.a));
  let lite = store.get('lite', !!window.AndroidBridge || matchMedia('(max-width:860px)').matches);
  const applyLite = () => { root.classList.toggle('lite', lite); $('#optLite').checked = lite; };
  $('#optLite').onchange = e => { lite = e.target.checked; store.set('lite', lite); applyLite(); };
  applyLite();
  applyTheme(); setAccent(store.get('accent', 'violet'));

  /* ---------- tabs ---------- */
  function go(t) {
    $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + t));
    scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('.tab').forEach(t => t.onclick = () => go(t.dataset.tab));

  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    $('#toasts').append(t); setTimeout(() => t.remove(), 3200);
  }

  /* count-up */
  $$('[data-count]').forEach(el => {
    const end = +el.dataset.count; const t0 = performance.now();
    const step = t => { const p = Math.min((t - t0) / 1200, 1); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('id-ID'); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });

  /* ---------- platform detection ---------- */
  const PLATFORMS = [
    ['YouTube', /(^|\.)(youtube\.com|youtu\.be)$/, '#ff3b3b'],
    ['TikTok', /(^|\.)tiktok\.com$/, '#25f4ee'],
    ['Facebook', /(^|\.)(facebook\.com|fb\.watch)$/, '#4c8bff'],
    ['Instagram', /(^|\.)instagram\.com$/, '#e1306c'],
    ['X / Twitter', /(^|\.)(x\.com|twitter\.com)$/, '#9aa0c0'],
    ['Vimeo', /(^|\.)vimeo\.com$/, '#1ab7ea'],
    ['Twitch', /(^|\.)twitch\.tv$/, '#9146ff'],
    ['Dailymotion', /(^|\.)dailymotion\.com$/, '#3b82f6'],
  ];
  function detect(line) {
    let u; try { u = new URL(line.trim()); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const p = PLATFORMS.find(p => p[1].test(u.hostname));
    return { url: u.href, name: p ? p[0] : u.hostname.replace(/^www\./, ''), color: p ? p[2] : '#a78bfa' };
  }
  let parsed = [];
  function parse() {
    const lines = $('#urls').value.split(/\s+/).filter(Boolean);
    const seen = new Set(); parsed = []; let bad = 0, dup = 0;
    lines.forEach(l => { const d = detect(l); if (!d) return bad++; if (seen.has(d.url)) return dup++; seen.add(d.url); parsed.push(d); });
    const counts = {}; parsed.forEach(p => (counts[p.name] ||= { n: 0, c: p.color }).n++);
    const box = $('#detected'); box.innerHTML = '';
    if (!lines.length) box.innerHTML = '<span class="muted">Belum ada link terdeteksi</span>';
    Object.entries(counts).forEach(([k, v]) => box.insertAdjacentHTML('beforeend', `<span class="tag"><i style="--c:${v.c}"></i>${k} · ${v.n}</span>`));
    if (bad) box.insertAdjacentHTML('beforeend', `<span class="tag bad">⚠ ${bad} tidak valid</span>`);
    if (dup) box.insertAdjacentHTML('beforeend', `<span class="tag">♻ ${dup} duplikat dilewati</span>`);
    $('#startCount').textContent = parsed.length + ' link';
    $('#startBtn').disabled = !parsed.length;
  }
  $('#urls').addEventListener('input', parse);
  $('#clearBtn').onclick = () => { $('#urls').value = ''; parse(); };
  $('#pasteBtn').onclick = async () => {
    try { const t = await navigator.clipboard.readText(); $('#urls').value += ($('#urls').value ? '\n' : '') + t; parse(); }
    catch { toast('Izin clipboard ditolak — tempel manual dengan Ctrl+V'); }
  };
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', async ev => {
    const f = ev.dataTransfer.files[0]; if (!f) return;
    $('#urls').value += '\n' + await f.text(); parse(); toast('File dimuat: ' + f.name);
  });

  /* ---------- format & quality ---------- */
  const Q = { mp4: ['360p', '480p', '720p', '1080p', '1440p', '4K'], mp3: ['64k', '96k', '128k', '192k', '256k', '320k'] };
  let fmt = 'mp4';
  const EXT = {
    mp4: [['mp4', 'MP4 (H.264) — universal'], ['mkv', 'MKV'], ['webm', 'WebM'], ['avi', 'AVI (MPEG-4) — perangkat lawas'], ['mpg', 'MPEG-1/2 — DVD player & head unit'], ['wmv', 'WMV'], ['3gp', '3GP — HP jadul'], ['flv', 'FLV']],
    mp3: [['mp3', 'MP3 — paling kompatibel'], ['m4a', 'M4A / AAC'], ['wma', 'WMA — head unit lawas'], ['wav', 'WAV (lossless)'], ['flac', 'FLAC (lossless)'], ['ogg', 'OGG Vorbis'], ['opus', 'Opus']]
  };
  if (window.AndroidBridge) { EXT.mp4 = EXT.mp4.slice(0, 1); EXT.mp3 = EXT.mp3.slice(0, 1); $('#presets').closest('.field').style.display = 'none'; } // APK: hanya MP4 & MP3
  // idx kualitas mengacu ke Q[kind]: mp4 [360p,480p,720p,1080p,1440p,4K], mp3 [64k..320k]
  const PRESETS = [
    ['🚗 Head unit (terbukti jalan)', 'mp4', 'mpg', 1, 'MPEG-2 DVD NTSC: 720×480, 29,97 fps, video 9000 kbps, audio 448 kbps 48 kHz stereo. Setara ffmpeg -target ntsc-dvd. Cocok dengan file .mpg yang sudah terbaca di head unit kamu.'],
    ['🚗 Head unit hemat', 'mp4', 'mpg', 1, 'MPEG-2 NTSC 720×480, 29,97 fps, video 4500 kbps, audio MP2 192 kbps 48 kHz. File ±50% lebih kecil; uji dulu di head unit.'],
    ['🚗 Head unit PAL', 'mp4', 'mpg', 1, 'MPEG-2 PAL 720×576, 25 fps, video 8000 kbps, audio 448 kbps 48 kHz. Setara ffmpeg -target pal-dvd.'],
    ['🚗 Head unit AVI/Xvid', 'mp4', 'avi', 1, 'AVI MPEG-4 ASP (Xvid) 640×480, 30 fps, video 1500 kbps, audio MP3 128 kbps. Kecil & kompatibel luas.'],
    ['🚗 Head unit MP4 baseline', 'mp4', 'mp4', 1, 'MP4 H.264 baseline 640×480, video 1200 kbps, audio AAC 128 kbps. Untuk head unit yang lebih baru.'],
    ['🎤 Karaoke / video lagu', 'mp4', 'mpg', 0, 'MPEG-2 NTSC 720×480, video 2500 kbps, audio 224 kbps — hemat ruang untuk video lagu.'],
    ['🚗 Head unit lawas (video)', 'mp4', 'avi', 1, 'AVI MPEG-4 480p. Gunakan flashdisk FAT32, nama file pendek tanpa simbol.'],
    ['🚗 Head unit lawas (audio)', 'mp3', 'mp3', 2, 'MP3 128 kbps CBR — didukung hampir semua head unit. Nama file ≤ 30 karakter.'],
    ['📼 DVD / MPEG', 'mp4', 'mpg', 1, 'MPEG 480p untuk DVD player & TV lama.'],
    ['📱 HP jadul', 'mp4', '3gp', 0, '3GP 360p, ukuran kecil.'],
    ['📺 Smart TV', 'mp4', 'mp4', 3, 'MP4 H.264 1080p.'],
    ['🎵 Audio hi-fi', 'mp3', 'flac', 5, 'FLAC lossless, ukuran besar.']
  ];
  const PRESET_IDS = ['hu-proven', 'hu-eco', 'hu-pal', 'hu-xvid', 'hu-mp4', 'karaoke', 'hu-avi', 'hu-mp3', 'dvd', 'phone', 'tv', 'hifi'];
  let ext = 'mp4', presetId = '';
  function renderExt() {
    $('#ext').innerHTML = EXT[fmt].map(e => `<option value="${e[0]}">${e[1]}</option>`).join('');
    $('#ext').value = ext; $('#extHint').textContent = '.' + ext;
  }
  $('#ext').onchange = e => { ext = e.target.value; $('#extHint').textContent = '.' + ext; clearPreset(); };
  function clearPreset() { presetId = ''; $$('#presets button').forEach(b => b.classList.remove('active')); $('#presetNote').textContent = ''; }
  $('#presets').innerHTML = PRESETS.map((p, i) => `<button data-i="${i}">${p[0]}</button>`).join('');
  $('#presets').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const p = PRESETS[b.dataset.i];
    fmt = p[1]; ext = p[2]; presetId = PRESET_IDS[b.dataset.i];
    $$('#fmtSeg button').forEach(x => x.classList.toggle('active', x.dataset.fmt === fmt));
    $('#qRange').value = p[3]; renderQ(); renderExt();
    $$('#presets button').forEach(x => x.classList.toggle('active', x === b)); $('#presetNote').textContent = p[4];
  };
  function renderQ() {
    $('#ticks').innerHTML = Q[fmt].map(q => `<span>${q}</span>`).join('');
    $('#qLabel').textContent = Q[fmt][$('#qRange').value];
  }
  $$('#fmtSeg button').forEach(b => b.onclick = () => {
    fmt = b.dataset.fmt; ext = EXT[fmt][0][0]; $$('#fmtSeg button').forEach(x => x.classList.toggle('active', x === b));
    $('#qRange').value = fmt === 'mp4' ? 3 : 4; renderQ(); renderExt(); clearPreset();
  });
  $('#qRange').oninput = () => { renderQ(); clearPreset(); }; renderQ(); renderExt();
  $('#conv').oninput = e => { $('#convLabel').textContent = e.target.value; if (API) post('/api/settings', { convert: +e.target.value }); };
  $('#par').oninput = e => { $('#parLabel').textContent = e.target.value; if (API) post('/api/settings', { parallel: +e.target.value }); };
  $('#spd').oninput = e => $('#spdLabel').textContent = e.target.value == 0 ? 'Tanpa batas' : e.target.value + ' MB/s';

  /* ---------- queue (simulation) ---------- */
  const HUES = [['#8b5cf6', '#06b6d4'], ['#ec4899', '#f97316'], ['#10b981', '#3b82f6'], ['#f43f5e', '#8b5cf6'], ['#f59e0b', '#ef4444']];
  let queue = [], history = store.get('history', []), uid = 0, allPaused = false;
  const fmtT = s => s >= 60 ? Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's' : s + 's';
  const fmtSize = n => n.toFixed(1) + ' MB';

  let API = false, evt = null;
  const clientOpts = () => ({ fmt, ext, q: +$('#qRange').value, qLabel: Q[fmt][$('#qRange').value], preset: presetId, dest: $('#dest').value.replace(/^Downloads\/Josjis\/?/, ''),
    sub: $('#optSub').checked, meta: $('#optThumb').checked, number: $('#optNum').checked });
  const post = (url, data = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
  function addItems(items) {
    if (API) return post('/api/jobs', { ...clientOpts(), items: items.map(i => ({ url: i.url, title: i.title })) }).then(r => { if (!r.ids || !r.ids.length) toast('Tidak ada URL valid yang ditambahkan'); });
    items.forEach(it => {
      const h = HUES[uid % HUES.length];
      queue.push({ id: ++uid, title: it.title || 'Video ' + uid + ' — ' + it.name, name: it.name, color: it.color, fmt, ext, q: Q[fmt][$('#qRange').value],
        size: 8 + Math.random() * 180, pct: 0, speed: 0, status: 'wait', h1: h[0], h2: h[1], num: $('#optNum').checked ? uid : null });
    });
    renderQueue();
  }
  $('#startBtn').onclick = () => {
    if (!parsed.length) return;
    addItems(parsed); toast(`${parsed.length} link masuk antrian`);
    $('#urls').value = ''; parse(); go('queue');
  };

  function renderQueue() {
    $('#qBadge').textContent = queue.filter(i => i.status !== 'done').length;
    $('#queueEmpty').hidden = queue.length > 0;
    $('#queueList').innerHTML = queue.map(i => {
      const label = { wait: 'Menunggu', run: i.stage === 'cwait' ? 'Menunggu giliran konversi…' : i.stage === 'convert' ? `Mengonversi ${Math.round((i.pct - 30) / 70 * 100)}%${i.cspeed ? ' · ' + i.cspeed + 'x' : ''}${i.eta ? ' · ETA ' + fmtT(i.eta) : ''}` : i.stage === 'info' ? 'Mengambil info…' : `${i.speed.toFixed(1)} MB/s · ETA ${i.eta ?? Math.max(1, Math.round((100 - i.pct) / 100 * i.size / Math.max(i.speed, .1)))}s`, paused: 'Dijeda', done: 'Selesai', error: 'Gagal' + (i.error ? ': ' + esc(i.error).slice(0, 90) : '') }[i.status];
      return `<article class="glass item ${i.status === 'run' ? '' : i.status}" data-id="${i.id}">
        <div class="thumb" style="--h1:${i.h1};--h2:${i.h2}">${i.fmt === 'mp3' ? '♪' : '▶'}</div>
        <div class="meta"><h4>${i.num ? String(i.num).padStart(2, '0') + ' · ' : ''}${esc(i.title)}</h4>
          <div class="sub"><span class="badge">${(i.ext || i.fmt).toUpperCase()} ${i.q}</span><span>${i.name}</span><span>${fmtSize(i.size * i.pct / 100)} / ${fmtSize(i.size)}</span><span>${label}</span></div>
          <div class="meter"><i style="width:${i.pct}%"></i></div></div>
        <div class="acts">
          ${i.status === 'error' ? '<button data-a="retry" title="Coba lagi">↻</button>' : ''}
          ${i.status === 'run' || i.status === 'paused' || i.status === 'wait' ? `<button data-a="pause" title="Jeda/Lanjut">${i.status === 'paused' ? '▶' : '⏸'}</button>` : ''}
          <button data-a="del" title="Hapus">✕</button></div></article>`;
    }).join('');
    const act = queue.filter(i => i.status !== 'done');
    const tot = queue.length ? queue.reduce((s, i) => s + i.pct, 0) / queue.length : 0;
    $('#overallBar').style.width = tot + '%';
    $('#overallTxt').textContent = queue.length ? `${queue.length - act.length}/${queue.length} selesai · ${Math.round(tot)}%` : 'Tidak ada unduhan aktif';
  }
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  $('#queueList').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const it = queue.find(i => i.id == b.closest('.item').dataset.id); if (!it) return;
    if (API) {
      const a = { del: 'cancel', retry: 'retry', pause: it.status === 'paused' ? 'resume' : 'pause' }[b.dataset.a];
      return post(`/api/jobs/${it.id}/${a}`);
    }
    if (b.dataset.a === 'del') queue = queue.filter(i => i !== it);
    if (b.dataset.a === 'pause') it.status = it.status === 'paused' ? 'wait' : 'paused';
    if (b.dataset.a === 'retry') { it.status = 'wait'; it.pct = 0; }
    renderQueue();
  };
  $('#pauseAll').onclick = () => {
    allPaused = !allPaused;
    if (API) { queue.forEach(i => { if (i.status === 'done') return; post(`/api/jobs/${i.id}/${allPaused ? 'pause' : 'resume'}`); }); $('#pauseAll').textContent = allPaused ? '▶ Lanjutkan semua' : '⏸ Jeda semua'; return; }
     $('#pauseAll').textContent = allPaused ? '▶ Lanjutkan semua' : '⏸ Jeda semua';
    queue.forEach(i => { if (i.status === 'done') return; i.status = allPaused ? 'paused' : 'wait'; }); renderQueue();
  };
  $('#clearDone').onclick = () => { if (API) post('/api/clear-done'); queue = queue.filter(i => i.status !== 'done'); renderQueue(); };

  setInterval(() => {
    if (API) return;
    const max = +$('#par').value; let running = queue.filter(i => i.status === 'run').length;
    queue.forEach(i => { if (i.status === 'wait' && running < max) { i.status = 'run'; running++; } });
    queue.filter(i => i.status === 'run').forEach(i => {
      i.speed = 2 + Math.random() * 6; i.pct = Math.min(100, i.pct + i.speed / i.size * 100 * .6);
      if (i.pct >= 100) {
        if (Math.random() < .08) { i.status = 'error'; i.pct = 62; }
        else { i.status = 'done'; i.speed = 0; history.unshift({ title: i.title, name: i.name, fmt: i.fmt, ext: i.ext, q: i.q, size: i.size, at: new Date().toISOString(), h1: i.h1, h2: i.h2 }); history = history.slice(0, 200); store.set('history', history); renderHistory(); }
      }
    });
    if (queue.some(i => i.status === 'run')) renderQueue();
  }, 600);

  /* ---------- history ---------- */
  function renderHistory() {
    const q = $('#hSearch').value.toLowerCase();
    const list = history.filter(h => h.title.toLowerCase().includes(q));
    $('#histEmpty').hidden = list.length > 0;
    $('#histList').innerHTML = list.map(h => `<article class="glass item done">
      <div class="thumb" style="--h1:${h.h1};--h2:${h.h2}">${h.fmt === 'mp3' ? '♪' : '▶'}</div>
      <div class="meta"><h4>${esc(h.title)}</h4><div class="sub"><span class="badge">${(h.ext || h.fmt).toUpperCase()} ${h.q}</span><span>${h.name}</span><span>${fmtSize(h.size)}</span><span>${new Date(h.at).toLocaleString('id-ID')}</span></div></div>
      <div class="acts"><button title="Unduh ulang" data-re="${esc(h.title)}">↻</button></div></article>`).join('');
  }
  $('#hSearch').oninput = renderHistory;
  $('#hClear').onclick = () => { history = []; store.set('history', history); renderHistory(); };
  $('#histList').onclick = e => { if (e.target.dataset.re) toast('Ditambahkan ulang ke antrian (simulasi)'); };
  renderHistory();

  /* ---------- playlist import (simulation) ---------- */
  function showPlaylist(items, d) {
    const box = $('#plResult'); box.hidden = false; const n = items.length;
    box.innerHTML = `<div class="pl-actions"><label class="switch"><input type="checkbox" id="plAll" checked><i></i><span>Pilih semua (${n})</span></label><button class="btn secondary sm" id="plAdd">Tambah ke antrian</button></div>` +
      items.map((it, i) => `<label class="pl-item"><input type="checkbox" checked data-i="${i}"><span>${esc(it.title)}</span><span class="dur">${it.dur}</span></label>`).join('');
    $('#plAll').onchange = e => $$('.pl-item input', box).forEach(c => c.checked = e.target.checked);
    $('#plAdd').onclick = () => {
      const sel = $$('.pl-item input:checked', box).map(c => items[c.dataset.i]);
      if (!sel.length) return toast('Pilih minimal satu video');
      addItems(sel); toast(`${sel.length} video ditambahkan`); go('queue');
    };
  }
  const mmss = s => s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '';
  $('#plBtn').onclick = async () => {
    const d = detect($('#plUrl').value);
    if (!d) return toast('Masukkan URL playlist/channel yang valid');
    if (API) {
      $('#plBtn').disabled = true; $('#plBtn').textContent = 'Mengambil…';
      try { const r = await post('/api/playlist', { url: d.url }); if (r.error) throw new Error(r.error); showPlaylist(r.items.map(i => ({ ...i, dur: mmss(i.dur) })), d); }
      catch (e) { toast('Gagal: ' + e.message); }
      $('#plBtn').disabled = false; $('#plBtn').textContent = 'Ambil Daftar'; return;
    }
    const n = 8 + Math.floor(Math.random() * 8);
    const items = Array.from({ length: n }, (_, i) => ({ title: `${d.name} Playlist — Video ${i + 1}`, dur: `${1 + (i * 7) % 9}:${String((i * 13) % 60).padStart(2, '0')}`, name: d.name, color: d.color }));
    showPlaylist(items, d);
  };

  /* ---------- backend connection ---------- */
  const seenDone = new Set();
  function onJobs(list) {
    queue = list.map(v => { const h = HUES[v.id % HUES.length]; return { id: v.id, title: v.title || v.url, name: v.site, fmt: v.fmt, ext: v.ext, q: v.q, size: v.size || 0, pct: v.pct, speed: v.speed, eta: v.eta,
      status: { wait: 'wait', run: 'run', paused: 'paused', done: 'done', error: 'error' }[v.status], stage: v.stage, cspeed: v.cspeed, error: v.error, num: v.num, h1: h[0], h2: h[1] }; });
    queue.forEach(i => { if (i.status === 'done' && !seenDone.has(i.id)) { seenDone.add(i.id); history.unshift({ title: i.title, name: i.name, fmt: i.fmt, ext: i.ext, q: i.q, size: i.size, at: new Date().toISOString(), h1: i.h1, h2: i.h2 }); history = history.slice(0, 200); store.set('history', history); renderHistory(); } });
    renderQueue();
  }
  fetch('/api/health').then(r => r.json()).then(h => {
    if (!h.ok) return; API = true;
    if (!h.ytdlp || !h.ffmpeg) toast('Backend aktif, tapi ' + [!h.ytdlp && 'yt-dlp', !h.ffmpeg && 'ffmpeg'].filter(Boolean).join(' & ') + ' belum terpasang');
    $('#dest').value = 'Downloads/Josjis'; $('#dest').title = 'Folder dasar: ' + h.base + ' (isi subfolder opsional setelah Downloads/Josjis/)';
    $('footer').textContent = 'Downloader Josjis by Digitalku · Backend aktif — file disimpan di ' + h.base + '. Hanya unduh konten milik Anda atau yang berizin.';
    $('#conv').value = h.convert || 1; $('#convLabel').textContent = $('#conv').value;
    post('/api/settings', { parallel: +$('#par').value });
    evt = new EventSource('/api/events'); evt.onmessage = e => onJobs(JSON.parse(e.data));
  }).catch(() => {});

  parse();
})();
