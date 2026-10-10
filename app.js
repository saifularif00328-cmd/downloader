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
  function renderQ() {
    $('#ticks').innerHTML = Q[fmt].map(q => `<span>${q}</span>`).join('');
    $('#qLabel').textContent = Q[fmt][$('#qRange').value];
  }
  $$('#fmtSeg button').forEach(b => b.onclick = () => {
    fmt = b.dataset.fmt; $$('#fmtSeg button').forEach(x => x.classList.toggle('active', x === b));
    $('#qRange').value = fmt === 'mp4' ? 3 : 4; renderQ();
  });
  $('#qRange').oninput = renderQ; renderQ();
  $('#par').oninput = e => $('#parLabel').textContent = e.target.value;
  $('#spd').oninput = e => $('#spdLabel').textContent = e.target.value == 0 ? 'Tanpa batas' : e.target.value + ' MB/s';

  /* ---------- queue (simulation) ---------- */
  const HUES = [['#8b5cf6', '#06b6d4'], ['#ec4899', '#f97316'], ['#10b981', '#3b82f6'], ['#f43f5e', '#8b5cf6'], ['#f59e0b', '#ef4444']];
  let queue = [], history = store.get('history', []), uid = 0, allPaused = false;
  const fmtSize = n => n.toFixed(1) + ' MB';

  function addItems(items) {
    items.forEach(it => {
      const h = HUES[uid % HUES.length];
      queue.push({ id: ++uid, title: it.title || 'Video ' + uid + ' — ' + it.name, name: it.name, color: it.color, fmt, q: Q[fmt][$('#qRange').value],
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
      const label = { wait: 'Menunggu', run: `${i.speed.toFixed(1)} MB/s · ETA ${Math.max(1, Math.round((100 - i.pct) / 100 * i.size / Math.max(i.speed, .1)))}s`, paused: 'Dijeda', done: 'Selesai', error: 'Gagal' }[i.status];
      return `<article class="glass item ${i.status === 'run' ? '' : i.status}" data-id="${i.id}">
        <div class="thumb" style="--h1:${i.h1};--h2:${i.h2}">${i.fmt === 'mp3' ? '♪' : '▶'}</div>
        <div class="meta"><h4>${i.num ? String(i.num).padStart(2, '0') + ' · ' : ''}${esc(i.title)}</h4>
          <div class="sub"><span class="badge">${i.fmt.toUpperCase()} ${i.q}</span><span>${i.name}</span><span>${fmtSize(i.size * i.pct / 100)} / ${fmtSize(i.size)}</span><span>${label}</span></div>
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
    if (b.dataset.a === 'del') queue = queue.filter(i => i !== it);
    if (b.dataset.a === 'pause') it.status = it.status === 'paused' ? 'wait' : 'paused';
    if (b.dataset.a === 'retry') { it.status = 'wait'; it.pct = 0; }
    renderQueue();
  };
  $('#pauseAll').onclick = () => {
    allPaused = !allPaused; $('#pauseAll').textContent = allPaused ? '▶ Lanjutkan semua' : '⏸ Jeda semua';
    queue.forEach(i => { if (i.status === 'done') return; i.status = allPaused ? 'paused' : 'wait'; }); renderQueue();
  };
  $('#clearDone').onclick = () => { queue = queue.filter(i => i.status !== 'done'); renderQueue(); };

  setInterval(() => {
    const max = +$('#par').value; let running = queue.filter(i => i.status === 'run').length;
    queue.forEach(i => { if (i.status === 'wait' && running < max) { i.status = 'run'; running++; } });
    queue.filter(i => i.status === 'run').forEach(i => {
      i.speed = 2 + Math.random() * 6; i.pct = Math.min(100, i.pct + i.speed / i.size * 100 * .6);
      if (i.pct >= 100) {
        if (Math.random() < .08) { i.status = 'error'; i.pct = 62; }
        else { i.status = 'done'; i.speed = 0; history.unshift({ title: i.title, name: i.name, fmt: i.fmt, q: i.q, size: i.size, at: new Date().toISOString(), h1: i.h1, h2: i.h2 }); history = history.slice(0, 200); store.set('history', history); renderHistory(); }
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
      <div class="meta"><h4>${esc(h.title)}</h4><div class="sub"><span class="badge">${h.fmt.toUpperCase()} ${h.q}</span><span>${h.name}</span><span>${fmtSize(h.size)}</span><span>${new Date(h.at).toLocaleString('id-ID')}</span></div></div>
      <div class="acts"><button title="Unduh ulang" data-re="${esc(h.title)}">↻</button></div></article>`).join('');
  }
  $('#hSearch').oninput = renderHistory;
  $('#hClear').onclick = () => { history = []; store.set('history', history); renderHistory(); };
  $('#histList').onclick = e => { if (e.target.dataset.re) toast('Ditambahkan ulang ke antrian (simulasi)'); };
  renderHistory();

  /* ---------- playlist import (simulation) ---------- */
  $('#plBtn').onclick = () => {
    const d = detect($('#plUrl').value);
    if (!d) return toast('Masukkan URL playlist/channel yang valid');
    const n = 8 + Math.floor(Math.random() * 8);
    const items = Array.from({ length: n }, (_, i) => ({ title: `${d.name} Playlist — Video ${i + 1}`, dur: `${1 + (i * 7) % 9}:${String((i * 13) % 60).padStart(2, '0')}`, name: d.name, color: d.color }));
    const box = $('#plResult'); box.hidden = false;
    box.innerHTML = `<div class="pl-actions"><label class="switch"><input type="checkbox" id="plAll" checked><i></i><span>Pilih semua (${n})</span></label><button class="btn secondary sm" id="plAdd">Tambah ke antrian</button></div>` +
      items.map((it, i) => `<label class="pl-item"><input type="checkbox" checked data-i="${i}"><span>${esc(it.title)}</span><span class="dur">${it.dur}</span></label>`).join('');
    $('#plAll').onchange = e => $$('.pl-item input', box).forEach(c => c.checked = e.target.checked);
    $('#plAdd').onclick = () => {
      const sel = $$('.pl-item input:checked', box).map(c => items[c.dataset.i]);
      if (!sel.length) return toast('Pilih minimal satu video');
      addItems(sel); toast(`${sel.length} video ditambahkan`); go('queue');
    };
  };

  parse();
})();
