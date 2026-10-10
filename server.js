#!/usr/bin/env node
// NovaGrab backend — zero dependencies. Requires: node >= 18, yt-dlp, ffmpeg in PATH.
// Local use only: binds to 127.0.0.1. Run: node server.js  →  http://127.0.0.1:8787
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const PORT = +process.env.PORT || 8787;
const BASE = path.resolve(process.env.NOVAGRAB_DIR || path.join(os.homedir(), 'Downloads', 'NovaGrab'));
const WEB = __dirname;
const HEIGHTS = [360, 480, 720, 1080, 1440, 2160];
const ABR = [64, 96, 128, 192, 256, 320];

/* ---------- ffmpeg profiles ---------- */
const vf = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
const dvd = (target, w, h, vb, ab, ac = 'ac3') => ['-target', target, '-vf', vf(w, h), '-b:v', vb, '-maxrate', vb, '-bufsize', '1835k', '-c:a', ac, '-b:a', ab, '-ar', '48000', '-ac', '2'];
const PRESETS = {
  'hu-proven': { ext: 'mpg', safe: true, args: dvd('ntsc-dvd', 720, 480, '9000k', '448k') },
  'hu-eco':    { ext: 'mpg', safe: true, args: dvd('ntsc-dvd', 720, 480, '4500k', '192k', 'mp2') },
  'hu-pal':    { ext: 'mpg', safe: true, args: dvd('pal-dvd', 720, 576, '8000k', '448k') },
  'karaoke':   { ext: 'mpg', safe: true, args: dvd('ntsc-dvd', 720, 480, '2500k', '224k') },
  'dvd':       { ext: 'mpg', safe: true, args: dvd('ntsc-dvd', 720, 480, '6000k', '384k') },
  'hu-xvid':   { ext: 'avi', safe: true, args: ['-c:v', 'mpeg4', '-vtag', 'xvid', '-b:v', '1500k', '-vf', vf(640, 480), '-r', '30', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100'] },
  'hu-avi':    { ext: 'avi', safe: true, args: ['-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '5', '-vf', vf(640, 480), '-r', '30', '-c:a', 'libmp3lame', '-b:a', '128k'] },
  'hu-mp4':    { ext: 'mp4', safe: true, args: ['-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p', '-b:v', '1200k', '-vf', vf(640, 480), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'] },
  'hu-mp3':    { ext: 'mp3', safe: true, audio: true, args: ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2'] },
  'phone':     { ext: '3gp', safe: true, args: ['-c:v', 'mpeg4', '-b:v', '300k', '-vf', vf(320, 240), '-r', '15', '-c:a', 'aac', '-b:a', '64k', '-ar', '22050', '-ac', '1'] },
};
function generic(ext, audio, q) {
  const h = HEIGHTS[q] ?? 720, ab = (ABR[q] ?? 128) + 'k';
  const crf = h >= 1080 ? '22' : '24';
  const v = { // video container → codec args
    mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
    mkv: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-c:a', 'aac', '-b:a', '160k'],
    webm: ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '5', '-b:v', '0', '-crf', '32', '-c:a', 'libopus', '-b:a', '128k'],
    avi: ['-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '4', '-c:a', 'libmp3lame', '-b:a', '160k'],
    mpg: ['-c:v', 'mpeg2video', '-b:v', '5000k', '-c:a', 'mp2', '-b:a', '192k', '-ar', '48000'],
    wmv: ['-c:v', 'wmv2', '-b:v', '2000k', '-c:a', 'wmav2', '-b:a', '160k'],
    '3gp': ['-c:v', 'mpeg4', '-b:v', '400k', '-vf', vf(320, 240), '-c:a', 'aac', '-b:a', '64k', '-ar', '22050', '-ac', '1'],
    flv: ['-c:v', 'flv', '-b:v', '2000k', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100'],
  };
  const a = {
    mp3: ['-c:a', 'libmp3lame', '-b:a', ab], m4a: ['-c:a', 'aac', '-b:a', ab], wma: ['-c:a', 'wmav2', '-b:a', ab],
    wav: ['-c:a', 'pcm_s16le'], flac: ['-c:a', 'flac'], ogg: ['-c:a', 'libvorbis', '-b:a', ab], opus: ['-c:a', 'libopus', '-b:a', ab],
  };
  if (audio) return a[ext] ? ['-vn', ...a[ext]] : null;
  if (!v[ext]) return null;
  const scale = ['3gp', 'avi', 'mpg'].includes(ext) && ext !== '3gp' ? ['-vf', `scale=-2:min(ih\\,${h})`] : [];
  return [...scale, ...v[ext]];
}
function profile(j) {
  const audio = j.fmt === 'mp3';
  const p = j.preset && PRESETS[j.preset];
  if (p) return { ext: p.ext, args: p.args, safe: p.safe, audio: !!p.audio };
  const args = generic(j.ext, audio, j.q);
  return args ? { ext: j.ext, args, audio } : null;
}

/* ---------- helpers ---------- */
const clean = (s, max = 120) => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) || 'video';
const asciiSafe = s => clean(s.normalize('NFKD').replace(/[^\x20-\x7e]/g, ''), 30).replace(/[^\w .-]/g, '').trim() || 'video';
const safeSub = s => String(s || '').split(/[\\/]+/).filter(p => p && p !== '..' && p !== '.').map(p => clean(p, 60)).join('/');
const validUrl = u => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
const platform = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const has = bin => !spawnSync(bin, ['-version'], { stdio: 'ignore', windowsHide: true }).error;
const HAS = { ytdlp: has('yt-dlp'), ffmpeg: has('ffmpeg') };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); });
const runJson = (args) => new Promise((ok, no) => {
  const c = spawn('yt-dlp', args, { windowsHide: true }); let out = '', err = '';
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d);
  c.on('close', code => code === 0 ? ok(out) : no(new Error(err.split('\n').filter(l => l.includes('ERROR')).pop() || err.slice(-300) || 'yt-dlp gagal')));
  c.on('error', no);
});

/* ---------- jobs ---------- */
const jobs = new Map(); let nextId = 1; let parallel = 3, retries = 1, convLimit = Math.max(1, Math.floor(os.cpus().length / 2));
const clients = new Set();
const view = j => ({ id: j.id, url: j.url, title: j.title, site: j.site, fmt: j.fmt, ext: j.outExt || j.ext, q: j.qLabel, status: j.status, pct: j.pct, stage: j.status === 'run' ? j.stage : '', cspeed: j.cspeed || 0, speed: j.speed, eta: j.eta, size: j.size, file: j.file, error: j.error, num: j.num });
let pending = false;
function push() { if (pending) return; pending = true; setTimeout(() => { pending = false; const d = `data: ${JSON.stringify([...jobs.values()].map(view))}\n\n`; clients.forEach(r => r.write(d)); }, 150); }

function pump() {
  const all = [...jobs.values()];
  let running = all.filter(j => j.status === 'run' && (j.stage === 'info' || j.stage === 'download')).length;
  for (const j of all) if (j.status === 'wait' && running < parallel) { running++; start(j); }
  let converting = all.filter(j => j.status === 'run' && j.stage === 'convert').length;
  for (const j of all) if (j.status === 'run' && j.stage === 'cwait' && converting < convLimit) { converting++; convert(j); }
  push();
}
function fail(j, msg) { if (j.status === 'cancel') return; j.status = 'error'; j.error = msg; j.speed = 0; pump(); }

async function start(j) {
  j.status = 'run'; j.error = ''; j.stage = 'info'; push();
  const prof = profile(j); if (!prof) return fail(j, `Format .${j.ext} tidak didukung`);
  try {
    if (!j.meta) {
      j.meta = JSON.parse(await runJson(['--no-playlist', '-j', '--no-warnings', '--', j.url]));
      if (!j.title) j.title = j.meta.title || 'video';
      j.dur = j.meta.duration || 0; j.site = j.meta.extractor_key || j.site;
    }
    if (j.status !== 'run') return;
    const dir = path.join(BASE, j.dest); const tmp = path.join(dir, '.tmp', String(j.id));
    fs.mkdirSync(tmp, { recursive: true });
    j.tmp = tmp; j.dir = dir; j.prof = prof;
    download(j);
  } catch (e) { fail(j, e.message); }
}

function download(j) {
  const { prof, tmp } = j; const h = HEIGHTS[j.q] ?? 720;
  const fmt = prof.audio ? 'ba/b' : `bv*[height<=${h}]+ba/b[height<=${h}]/b`;
  const args = ['--no-playlist', '--newline', '--no-warnings', '--continue', '-f', fmt, '--merge-output-format', 'mkv', '-o', path.join(tmp, 'src.%(ext)s'),
    '--progress-template', 'download:NG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s'];
  if (j.opts.sub) args.push('--write-subs', '--sub-langs', 'id.*,en.*', '--convert-subs', 'srt');
  args.push('--', j.url);
  j.stage = 'download';
  const c = spawn('yt-dlp', args, { windowsHide: true }); j.proc = c; let err = '', buf = '';
  c.stdout.on('data', d => {
    buf += d; const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) if (l.startsWith('NG|')) {
      const [, dl, tot, est, sp, eta] = l.split('|'); const total = +tot || +est || 0;
      if (total) { j.pct = Math.min(30, (+dl / total) * 30); j.size = total / 1048576; }
      j.speed = +sp / 1048576 || 0; j.eta = +eta || 0; push();
    }
  });
  c.stderr.on('data', d => err += d);
  c.on('error', e => fail(j, e.message));
  c.on('close', code => {
    j.proc = null; if (j.status !== 'run') return;
    if (code !== 0) return retryOrFail(j, err.split('\n').filter(l => l.includes('ERROR')).pop() || 'Unduhan gagal');
    j.stage = 'cwait'; j.speed = 0; j.eta = 0; pump();
  });
}

function convert(j) {
  const { prof, tmp, dir } = j;
  const src = fs.readdirSync(tmp).find(f => f.startsWith('src.') && !/\.(part|ytdl|srt)$/.test(f));
  if (!src) return fail(j, 'File sumber tidak ditemukan');
  let base = clean(j.title); if (prof.safe) base = asciiSafe(j.title);
  if (j.num) base = String(j.num).padStart(2, '0') + ' ' + base; if (prof.safe) base = base.slice(0, 30).trim();
  let out = path.join(dir, `${base}.${prof.ext}`), n = 1;
  while (fs.existsSync(out)) out = path.join(dir, `${base} (${n++}).${prof.ext}`);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-i', path.join(tmp, src), ...prof.args];
  if (j.opts.meta) args.push('-metadata', `title=${j.title}`);
  args.push(out);
  j.stage = 'convert'; j.speed = 0; j.eta = 0; j.cspeed = 0; j.pct = 30; push();
  const c = spawn('ffmpeg', args, { windowsHide: true }); j.proc = c; let err = '';
  c.stdout.on('data', d => {
    const m = /out_time_(?:us|ms)=(\d+)/g; let x, last;
    while ((x = m.exec(d))) last = +x[1];
    const sp = /speed=\s*([\d.]+)x/.exec(d); if (sp) j.cspeed = +sp[1];
    if (last != null && j.dur) { const cur = last / 1e6; j.pct = 30 + Math.min(69.5, (cur / j.dur) * 70); j.eta = j.cspeed ? Math.max(0, Math.round((j.dur - cur) / j.cspeed)) : 0; push(); }
  });
  c.stderr.on('data', d => err += d);
  c.on('error', e => fail(j, e.message));
  c.on('close', code => {
    j.proc = null; if (j.status !== 'run') { try { fs.rmSync(out, { force: true }); } catch {} return; }
    if (code !== 0) { try { fs.rmSync(out, { force: true }); } catch {} return retryOrFail(j, 'Konversi gagal: ' + err.trim().split('\n').pop()); }
    for (const f of fs.readdirSync(tmp)) if (f.endsWith('.srt')) fs.renameSync(path.join(tmp, f), path.join(dir, base + f.replace(/^src/, '')));
    fs.rmSync(tmp, { recursive: true, force: true });
    j.file = out; j.outExt = prof.ext; j.pct = 100; j.speed = 0; j.eta = 0; j.status = 'done'; pump();
  });
}
function retryOrFail(j, msg) { if (j.tries++ < retries) { j.status = 'wait'; j.pct = 0; pump(); } else fail(j, msg); }

function stop(j, status) { j.status = status; if (j.proc) { try { j.proc.kill(); } catch {} j.proc = null; } j.speed = 0; }

/* ---------- http ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  // basic CSRF/DNS-rebinding guard: only accept local Host header
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
  try {
    if (p === '/api/health') return send(res, 200, { ok: true, ...HAS, base: BASE, parallel, convert: convLimit });
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      clients.add(res); req.on('close', () => clients.delete(res));
      return res.write(`data: ${JSON.stringify([...jobs.values()].map(view))}\n\n`);
    }
    if (req.method === 'POST' && req.headers['content-type'] !== 'application/json') return send(res, 415, { error: 'JSON required' });
    if (p === '/api/playlist' && req.method === 'POST') {
      const { url } = await body(req); if (!validUrl(url)) return send(res, 400, { error: 'URL tidak valid' });
      const j = JSON.parse(await runJson(['--flat-playlist', '-J', '--no-warnings', '--', url]));
      const items = (j.entries || [j]).filter(Boolean).map(e => ({ title: e.title || e.id, url: e.url && validUrl(e.url) ? e.url : (e.webpage_url || url), dur: e.duration || 0 }));
      return send(res, 200, { title: j.title || '', items });
    }
    if (p === '/api/jobs' && req.method === 'POST') {
      const b = await body(req); const dest = safeSub(b.dest) || '';
      const ids = [];
      for (const it of (b.items || []).slice(0, 500)) {
        if (!validUrl(it.url)) continue;
        const id = nextId++;
        jobs.set(id, { id, url: it.url, title: it.title && !/^(Video|.* Playlist)/.test(it.title) ? clean(it.title) : '', site: platform(it.url), fmt: b.fmt === 'mp3' ? 'mp3' : 'mp4',
          ext: String(b.ext || 'mp4').replace(/[^a-z0-9]/g, ''), q: Math.max(0, Math.min(5, +b.q || 0)), qLabel: b.qLabel || '', preset: PRESETS[b.preset] ? b.preset : '',
          dest, opts: { sub: !!b.sub, meta: !!b.meta }, num: b.number ? id : 0, status: 'wait', pct: 0, speed: 0, eta: 0, size: 0, tries: 0 });
        ids.push(id);
      }
      pump(); return send(res, 200, { ids });
    }
    if (p === '/api/settings' && req.method === 'POST') {
      const b = await body(req); if (b.parallel) parallel = Math.max(1, Math.min(8, +b.parallel)); if (b.convert) convLimit = Math.max(1, Math.min(4, +b.convert)); if ('retry' in b) retries = b.retry ? 1 : 0;
      pump(); return send(res, 200, { parallel, convert: convLimit });
    }
    if (p === '/api/clear-done' && req.method === 'POST') { for (const [k, j] of jobs) if (j.status === 'done') jobs.delete(k); push(); return send(res, 200, {}); }
    const m = /^\/api\/jobs\/(\d+)\/(pause|resume|cancel|retry)$/.exec(p);
    if (m && req.method === 'POST') {
      const j = jobs.get(+m[1]); if (!j) return send(res, 404, { error: 'tidak ada' });
      if (m[2] === 'pause' && (j.status === 'run' || j.status === 'wait')) stop(j, 'paused');
      else if (m[2] === 'resume' && j.status === 'paused') { j.status = 'wait'; }
      else if (m[2] === 'retry' && j.status === 'error') { j.status = 'wait'; j.pct = 0; j.tries = 0; }
      else if (m[2] === 'cancel') { stop(j, 'cancel'); jobs.delete(j.id); if (j.tmp) fs.rmSync(j.tmp, { recursive: true, force: true }); }
      pump(); return send(res, 200, {});
    }
    // static
    let f = path.normalize(path.join(WEB, p === '/' ? 'index.html' : p));
    if (!['index.html', 'styles.css', 'app.js'].includes(path.relative(WEB, f))) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  } catch (e) { send(res, 500, { error: e.message }); }
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`NovaGrab → http://127.0.0.1:${PORT}\nSimpan ke: ${BASE}`);
  if (!HAS.ytdlp) console.warn('! yt-dlp tidak ditemukan di PATH'); if (!HAS.ffmpeg) console.warn('! ffmpeg tidak ditemukan di PATH');
});
process.on('SIGINT', () => { jobs.forEach(j => j.proc && j.proc.kill()); process.exit(0); });
