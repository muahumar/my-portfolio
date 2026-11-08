'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const md = require('./lib/markdown');
const { FileStore } = require('./lib/store');
const firebase = require('./lib/firebase');
const auth = require('./lib/auth');
const views = require('./lib/views');

// When bundled (e.g. Netlify esbuild into netlify/functions/web.js), __dirname is
// the bundle output directory rather than blog/, so locate blog/ from candidate roots.
const BLOG_DIR = [
  __dirname,
  path.resolve(__dirname, '..', '..', 'blog'),
  path.resolve(__dirname, '..', 'blog'),
  process.env.LAMBDA_TASK_ROOT && path.join(process.env.LAMBDA_TASK_ROOT, 'blog'),
  path.join(process.cwd(), 'blog'),
].find((d) => d && fs.existsSync(path.join(d, 'public', 'admin.html'))) || __dirname;

// Minimal .env loader (no dependency). Real environment variables win.
for (const file of [path.join(BLOG_DIR, '..', '.env'), path.join(BLOG_DIR, '.env')]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const ROOT = path.resolve(BLOG_DIR, '..');
const SERVERLESS = !!(process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT);
// Serverless filesystems are read-only except tmp; real data lives in Firebase there.
const DATA_DIR = path.resolve(process.env.DATA_DIR || (SERVERLESS ? path.join(require('node:os').tmpdir(), 'blog-data') : path.join(BLOG_DIR, 'data')));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(BLOG_DIR, 'public');
const PORT = +process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const PAGE_SIZE = 9;
const MAX_UPLOAD = 5 * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const config = auth.loadConfig(DATA_DIR);
const useFirebase = firebase.isConfigured();
const store = useFirebase ? new firebase.FirestoreStore() : new FileStore(DATA_DIR);
// Cloud Storage needs the paid Blaze plan; without a bucket, images live in Firestore (free tier).
const storageUploads = useFirebase && process.env.FIREBASE_STORAGE_BUCKET ? new firebase.StorageUploads() : null;
const fsUploads = useFirebase && !storageUploads ? new firebase.FirestoreUploads() : null;
const cloudUploads = storageUploads || fsUploads;
console.log(`Posts: ${useFirebase ? 'Firebase Firestore' : 'local JSON file'} | Uploads: ${storageUploads ? 'Firebase Storage' : fsUploads ? 'Firestore (free tier, max 700 KB)' : 'local disk'}`);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
};

/* Only these parts of the repo root are public (never blog/, .git, data, ...). */
const PUBLIC_ROOT_FILES = new Set(['/', '/index.html', '/resume.json']);
const PUBLIC_ROOT_DIRS = ['/css/', '/assets/'];

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function baseHeaders(extra = {}) {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    ...extra,
  };
}

const send = (res, code, body, type = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(code, baseHeaders({ 'Content-Type': type, ...extra }));
  res.end(body);
};
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...extra });

function serveFile(res, file, cache = 'public, max-age=300') {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, views.notFound(SITE_URL));
    res.writeHead(200, baseHeaders({
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
    }));
    fs.createReadStream(file).pipe(res);
  });
}

function safeJoin(base, rel) {
  let p;
  try { p = path.normalize(path.join(base, decodeURIComponent(rel))); } catch { return null; }
  return p.startsWith(base + path.sep) ? p : null;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const parseCookies = (h = '') =>
  Object.fromEntries(h.split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter(([k]) => k));

const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https' || SITE_URL.startsWith('https');
const cookie = (req, value, maxAge) =>
  `sid=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`;

const session = (req) => auth.readSession(parseCookies(req.headers.cookie).sid, config.secret);
// Behind Netlify the real client IP is in this header (only trusted when running serverless).
const clientIp = (req) => (SERVERLESS && req.headers['x-nf-client-connection-ip']) || (req.socket && req.socket.remoteAddress) || 'unknown';

/* ---------- input validation ---------- */
function cleanPost(b) {
  const err = (m) => { throw Object.assign(new Error(m), { status: 400 }); };
  const str = (v, max, name) => {
    if (v == null) return '';
    if (typeof v !== 'string') err(`${name} must be text`);
    if (v.length > max) err(`${name} is too long (max ${max})`);
    return v.trim();
  };
  const title = str(b.title, 150, 'Title');
  if (!title) err('Title is required');
  const content = str(b.content, 200000, 'Content');
  let excerpt = str(b.excerpt, 300, 'Excerpt');
  if (!excerpt) {
    excerpt = content.replace(/```[\s\S]*?```/g, '').replace(/[#>*_`~|\[\]!]|\(https?:\/\/[^)]*\)|https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  const status = b.status === 'published' ? 'published' : 'draft';
  const cover = str(b.cover, 500, 'Cover');
  if (cover && !/^(\/uploads\/[\w.-]+|https:\/\/\S+)$/.test(cover)) err('Cover must be an uploaded image or https URL');
  const tagsIn = Array.isArray(b.tags) ? b.tags : [];
  const tags = [...new Set(tagsIn.map((t) => md.slugify(String(t)).slice(0, 30)).filter(Boolean))].slice(0, 8);
  if (!md.slugify(str(b.slug, 100, 'Slug') || title)) err('Title must contain letters or numbers');
  return { title, slug: str(b.slug, 100, 'Slug'), excerpt, content, status, cover, tags };
}

function detectImage(buf) {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.subarray(0, 4).toString() === 'GIF8') return '.gif';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const route = url.pathname;
  const sess = session(req);

  if (req.method === 'GET' && route === '/api/me') return json(res, 200, { admin: !!sess, user: sess && sess.u });

  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'blog-admin') {
    return json(res, 403, { error: 'Forbidden' });
  }

  if (req.method === 'POST' && route === '/api/login') {
    const ip = clientIp(req);
    if (auth.limiter.blocked(ip)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    let b;
    try { b = JSON.parse((await readBody(req, 10_000)).toString() || '{}'); } catch { return json(res, 400, { error: 'Bad request' }); }
    const userOk = typeof b.username === 'string' &&
      b.username.length === config.adminUser.length &&
      crypto.timingSafeEqual(Buffer.from(b.username), Buffer.from(config.adminUser));
    const passOk = typeof b.password === 'string' && auth.verifyPassword(b.password, config.passwordHash);
    if (!(userOk && passOk)) {
      auth.limiter.fail(ip);
      return json(res, 401, { error: 'Invalid username or password' });
    }
    auth.limiter.reset(ip);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, auth.createSession(config.adminUser, config.secret), auth.SESSION_MS / 1000) });
  }

  if (req.method === 'POST' && route === '/api/logout') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
  }

  // Everything below requires admin.
  if (!sess) return json(res, 401, { error: 'Unauthorized' });

  if (req.method === 'GET' && route === '/api/posts') return json(res, 200, (await store.list()).map(({ content, ...p }) => p));

  let m = route.match(/^\/api\/posts\/([\w-]+)$/);
  if (m && req.method === 'GET') {
    const p = await store.byId(m[1]);
    return p ? json(res, 200, p) : json(res, 404, { error: 'Not found' });
  }

  if (req.method === 'POST' && route === '/api/posts') {
    const data = cleanPost(JSON.parse((await readBody(req, 400_000)).toString() || '{}'));
    return json(res, 201, await store.create(data, md.slugify));
  }
  if (m && req.method === 'PUT') {
    const data = cleanPost(JSON.parse((await readBody(req, 400_000)).toString() || '{}'));
    const p = await store.update(m[1], data, md.slugify);
    return p ? json(res, 200, p) : json(res, 404, { error: 'Not found' });
  }
  if (m && req.method === 'DELETE') {
    return (await store.remove(m[1])) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Not found' });
  }

  if (req.method === 'POST' && route === '/api/upload') {
    const buf = await readBody(req, MAX_UPLOAD);
    if (fsUploads && buf.length > firebase.FirestoreUploads.MAX_BYTES) return json(res, 413, { error: 'Image must be under 700 KB (free Firebase tier). Large images are resized automatically in the editor.' });
    const ext = detectImage(buf);
    if (!ext) return json(res, 400, { error: 'Only PNG, JPEG, GIF or WebP images are allowed' });
    const name = crypto.randomBytes(12).toString('hex') + ext;
    if (cloudUploads) await cloudUploads.save(name, buf, MIME[ext]);
    else fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return json(res, 201, { url: `/uploads/${name}` });
  }

  return json(res, 404, { error: 'Not found' });
}

/* ---------- pages ---------- */
async function blogPages(req, res, url) {
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (route === '/blog') {
    const q = (url.searchParams.get('q') || '').slice(0, 100);
    const tag = (url.searchParams.get('tag') || '').slice(0, 30);
    const all = await store.list({ publishedOnly: true, q, tag });
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1));
    return send(res, 200, views.listPage({
      posts: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages, q, tag, tags: await store.tags(), siteUrl: SITE_URL,
    }));
  }
  if (route === '/blog/rss.xml') {
    return send(res, 200, views.rss({ posts: await store.list({ publishedOnly: true }), siteUrl: SITE_URL }), 'application/rss+xml; charset=utf-8');
  }
  const m = route.match(/^\/blog\/([a-z0-9-]+)$/);
  if (m) {
    const post = await store.bySlug(m[1]);
    const preview = post && post.status !== 'published';
    if (!post || (preview && !session(req))) return send(res, 404, views.notFound(SITE_URL), undefined, { 'Cache-Control': 'no-store' });
    const related = (await store.list({ publishedOnly: true })).filter((p) => p.id !== post.id).slice(0, 3);
    return send(res, 200, views.postPage({ post, rendered: md.render(post.content), siteUrl: SITE_URL, related, preview }),
      undefined, preview ? { 'Cache-Control': 'no-store' } : {});
  }
  return send(res, 404, views.notFound(SITE_URL));
}

const handler = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (p === '/blog/admin' || p === '/blog/admin/') return send(res, 302, '', 'text/plain', { Location: '/admin' });
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p === '/blog' || p.startsWith('/blog/')) return await blogPages(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');

    if (p === '/admin' || p === '/admin/') return serveFile(res, path.join(PUBLIC_DIR, 'admin.html'), 'no-store');
    if (p === '/_blog/markdown.js') return serveFile(res, path.join(BLOG_DIR, 'lib', 'markdown.js'), 'no-cache');
    if (p.startsWith('/_blog/')) {
      const f = safeJoin(PUBLIC_DIR, p.slice(7));
      return f && path.basename(f) !== 'admin.html' ? serveFile(res, f, 'no-cache') : send(res, 404, 'Not found', 'text/plain');
    }
    if (p.startsWith('/uploads/')) {
      if (cloudUploads) {
        const name = p.slice(9);
        if (!/^[a-f0-9]{24}\.(png|jpg|gif|webp)$/.test(name)) return send(res, 404, 'Not found', 'text/plain');
        if (fsUploads) {
          const img = await fsUploads.read(name);
          if (!img) return send(res, 404, 'Not found', 'text/plain');
          return send(res, 200, img.buffer, img.contentType, { 'Cache-Control': 'public, max-age=31536000, immutable' });
        }
        const stream = await cloudUploads.stream(name);
        if (!stream) return send(res, 404, 'Not found', 'text/plain');
        res.writeHead(200, baseHeaders({ 'Content-Type': MIME[path.extname(name)], 'Cache-Control': 'public, max-age=31536000, immutable' }));
        return stream.pipe(res);
      }
      const f = safeJoin(UPLOAD_DIR, p.slice(9));
      return f ? serveFile(res, f, 'public, max-age=31536000, immutable') : send(res, 404, 'Not found', 'text/plain');
    }
    if (PUBLIC_ROOT_FILES.has(p)) return serveFile(res, path.join(ROOT, p === '/' ? 'index.html' : p));
    if (PUBLIC_ROOT_DIRS.some((d) => p.startsWith(d))) {
      const f = safeJoin(ROOT, p);
      return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain');
    }
    return send(res, 404, views.notFound(SITE_URL));
  } catch (e) {
    const status = e.status || (e instanceof SyntaxError ? 400 : 500);
    if (status === 500) console.error(e);
    if (res.headersSent) return res.end();
    return json(res, status, { error: status === 500 ? 'Server error' : e.message });
  }
};

module.exports = { handler };

if (require.main === module) {
  http.createServer(handler).listen(PORT, () => console.log(`Blog running at ${SITE_URL}/blog  (admin: ${SITE_URL}/admin)`));
}
