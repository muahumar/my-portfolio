'use strict';
// Copies ONLY the public static portfolio files into dist/ so nothing else
// (blog source, keys, .env) can ever be published as a static file.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'resume.json']) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of ['css', 'assets']) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
fs.cpSync(path.join(root, 'blog', 'public', 'blog.css'), path.join(out, '_blog', 'blog.css'), { recursive: true });
console.log('Built dist/');
