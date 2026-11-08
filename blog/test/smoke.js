'use strict';
// Smoke test: starts the server on a temp data dir and exercises auth, CRUD, XSS and embeds.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const PORT = 3999;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-'));
const base = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_USER: 'admin', FIREBASE_PROJECT_ID: '', FIREBASE_SERVICE_ACCOUNT: '', GOOGLE_APPLICATION_CREDENTIALS: '', FIREBASE_STORAGE_BUCKET: '', ADMIN_PASSWORD: 'test-pass-123' },
  stdio: 'ignore',
});
const H = { 'X-Requested-With': 'blog-admin', 'Content-Type': 'application/json' };

(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  try {
    // unauthenticated
    assert.strictEqual((await fetch(base + '/api/posts')).status, 401);
    assert.strictEqual((await fetch(base + '/api/posts', { method: 'POST', body: '{}' })).status, 403);
    let r = await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'admin', password: 'bad' }) });
    assert.strictEqual(r.status, 401);
    r = await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'admin', password: 'test-pass-123' }) });
    assert.strictEqual(r.status, 200);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const A = { ...H, Cookie: cookie };

    // create published post with XSS + embed
    const content = '## Hi\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\nhttps://youtu.be/dQw4w9WgXcQ?t=30\n\n```js\nconst a = "<b>";\n```';
    r = await fetch(base + '/api/posts', { method: 'POST', headers: A, body: JSON.stringify({ title: 'Hello World', content, status: 'published', tags: ['QA', 'Test'] }) });
    assert.strictEqual(r.status, 201);
    const post = await r.json();
    assert.strictEqual(post.slug, 'hello-world');

    let html = await (await fetch(base + '/blog/hello-world')).text();
    assert(!html.includes('<script>alert'), 'script must be escaped');
    assert(!html.includes('href="javascript:'), 'js url must be blocked');
    assert(html.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30'), 'youtube embed');
    assert(html.includes('language-js'));
    assert((await (await fetch(base + '/blog')).text()).includes('Hello World'));

    // drafts hidden from public
    r = await fetch(base + '/api/posts', { method: 'POST', headers: A, body: JSON.stringify({ title: 'Secret', content: 'x', status: 'draft' }) });
    assert.strictEqual((await fetch(base + '/blog/secret')).status, 404);
    assert.strictEqual((await fetch(base + '/blog/secret', { headers: { Cookie: cookie } })).status, 200);
    assert(!(await (await fetch(base + '/blog')).text()).includes('Secret'));

    // static file protection
    assert.strictEqual((await fetch(base + '/blog/lib/store.js')).status, 404);
    assert.strictEqual((await fetch(base + '/_blog/admin.html')).status, 404);
    assert.strictEqual((await fetch(base + '/_blog/..%2f..%2fpackage.json')).status, 404);
    assert.strictEqual((await fetch(base + '/.git/config')).status, 404);
    assert.strictEqual((await fetch(base + '/css/style.css')).status, 200);

    // upload: png ok, svg/html rejected
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    r = await fetch(base + '/api/upload', { method: 'POST', headers: { ...A, 'Content-Type': 'image/png' }, body: png });
    assert.strictEqual(r.status, 201);
    assert.strictEqual((await fetch(base + (await r.json()).url)).status, 200);
    r = await fetch(base + '/api/upload', { method: 'POST', headers: { ...A, 'Content-Type': 'image/svg+xml' }, body: '<svg onload=alert(1)></svg>' });
    assert.strictEqual(r.status, 400);

    // delete
    assert.strictEqual((await fetch(base + '/api/posts/' + post.id, { method: 'DELETE', headers: A })).status, 200);
    assert.strictEqual((await fetch(base + '/blog/hello-world')).status, 404);

    // brute-force limiter
    for (let i = 0; i < 6; i++) r = await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'admin', password: 'nope' }) });
    assert.strictEqual(r.status, 429);
    console.log('All smoke tests passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    srv.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();
