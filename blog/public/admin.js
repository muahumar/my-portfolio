(function () {
  'use strict';
  const app = document.getElementById('app');
  const esc = BlogMarkdown.esc;
  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- helpers ---------- */
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.className = ''), 2600);
  }

  async function api(path, opts = {}) {
    const headers = { 'X-Requested-With': 'blog-admin', ...(opts.headers || {}) };
    let body = opts.body;
    if (body && !(body instanceof Blob)) { body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    const res = await fetch(path, { method: opts.method || 'GET', headers, body, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/login') { go('#/login'); throw new Error('Session expired - please log in'); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
  const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  /* ---------- views ---------- */
  function loginView() {
    app.innerHTML = `
      <form class="login" id="login-form">
        <h1>Admin login</h1>
        <div class="field"><label for="u">Username</label><input id="u" autocomplete="username" required></div>
        <div class="field"><label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required></div>
        <p class="error" id="err" role="alert"></p>
        <button class="button button--primary" type="submit">Log in</button>
      </form>`;
    $('#u').focus();
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value } });
        go('#/');
      } catch (err) { $('#err').textContent = err.message; }
    });
  }

  async function listView() {
    const posts = await api('/api/posts');
    app.innerHTML = `
      <div class="container">
        <div class="admin-bar">
          <h1>Blog dashboard</h1>
          <div class="admin-bar__actions">
            <a class="button button--outline button--small" href="/blog" target="_blank">View blog</a>
            <a class="button button--primary button--small" href="#/new">New post</a>
            <button class="button button--outline button--small" id="logout">Log out</button>
          </div>
        </div>
        ${posts.length ? `<table class="posts-table"><thead><tr><th>Title</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>
          ${posts.map((p) => `<tr>
            <td><strong>${esc(p.title)}</strong><br><small>/blog/${esc(p.slug)}</small></td>
            <td><span class="badge badge--${p.status}">${p.status}</span></td>
            <td>${fmt(p.updatedAt)}</td>
            <td>
              <a class="button button--outline button--small" href="/blog/${esc(p.slug)}" target="_blank">${p.status === 'published' ? 'View' : 'Preview'}</a>
              <a class="button button--outline button--small" href="#/edit/${p.id}">Edit</a>
              <button class="button button--danger button--small" data-del="${p.id}" data-title="${esc(p.title)}">Delete</button>
            </td></tr>`).join('')}
        </tbody></table>` : '<p class="empty">No posts yet. Create your first one!</p>'}
      </div>`;
    $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); go('#/login'); };
    app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm(`Delete "${b.dataset.title}"? This cannot be undone.`)) return;
      try { await api('/api/posts/' + b.dataset.del, { method: 'DELETE' }); toast('Deleted'); listView(); }
      catch (e) { toast(e.message, true); }
    }));
  }

  const SAMPLE = `## Hello, world

Write in **Markdown**. Paste a YouTube link on its own line to embed it:

https://www.youtube.com/watch?v=dQw4w9WgXcQ

> [!TIP]
> Drag & drop or paste images straight into the editor.
`;

  async function editorView(id) {
    let post = { title: '', slug: '', excerpt: '', content: '', cover: '', tags: [], status: 'draft' };
    if (id) post = await api('/api/posts/' + id);
    const draftKey = 'blog-draft-' + (id || 'new');
    const saved = (() => { try { return JSON.parse(localStorage.getItem(draftKey)); } catch { return null; } })();
    if (saved && confirm('Restore unsaved local changes for this post?')) post = { ...post, ...saved };
    else if (!id && !post.content) post.content = SAMPLE;

    app.innerHTML = `
      <div class="container">
        <div class="admin-bar">
          <h1>${id ? 'Edit post' : 'New post'}</h1>
          <div class="admin-bar__actions">
            <a class="button button--outline button--small" href="#/">&larr; Back</a>
            <select id="status" class="button button--outline button--small" aria-label="Status">
              <option value="draft">Draft</option><option value="published">Published</option>
            </select>
            <button class="button button--primary button--small" id="save">Save (Ctrl+S)</button>
          </div>
        </div>
        <div class="meta-grid">
          <div class="field"><label for="title">Title</label><input id="title" maxlength="150" required></div>
          <div class="field"><label for="slug">URL slug</label><input id="slug" maxlength="100" placeholder="auto-generated from title"></div>
          <div class="field"><label for="tags">Tags</label><input id="tags" placeholder="qa, testing, odoo"><small>Comma separated, max 8</small></div>
          <div class="field"><label for="cover">Cover image</label>
            <input id="cover" placeholder="/uploads/... or https://...">
            <input id="cover-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp">
            <img id="cover-prev" class="cover-preview" alt="" hidden>
          </div>
        </div>
        <div class="field"><label for="excerpt">Excerpt</label><textarea id="excerpt" rows="2" maxlength="300" placeholder="Short summary for cards and search engines (auto-generated if empty)"></textarea></div>
        <div class="editor-grid">
          <div>
            <div class="toolbar" role="toolbar" aria-label="Formatting">
              <button type="button" data-act="bold" title="Bold"><b>B</b></button>
              <button type="button" data-act="italic" title="Italic"><i>I</i></button>
              <button type="button" data-act="h2" title="Heading 2">H2</button>
              <button type="button" data-act="h3" title="Heading 3">H3</button>
              <button type="button" data-act="link" title="Link">Link</button>
              <button type="button" data-act="code" title="Code block">&lt;/&gt;</button>
              <button type="button" data-act="quote" title="Quote">&ldquo;</button>
              <button type="button" data-act="ul" title="Bulleted list">&bull; List</button>
              <button type="button" data-act="task" title="Task list">&#9745;</button>
              <button type="button" data-act="table" title="Table">Table</button>
              <button type="button" data-act="callout" title="Callout">Callout</button>
              <button type="button" data-act="video" title="Embed YouTube / Vimeo">&#9654; Video</button>
              <button type="button" data-act="image" title="Upload image">Image</button>
              <input type="file" id="img-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
            </div>
            <textarea id="content" spellcheck="true" aria-label="Post content (Markdown)"></textarea>
            <div class="statusbar"><span id="count"></span><span id="autosave"></span></div>
          </div>
          <div class="preview"><div class="prose" id="preview"></div></div>
        </div>
      </div>`;

    const f = { title: $('#title'), slug: $('#slug'), tags: $('#tags'), cover: $('#cover'), excerpt: $('#excerpt'), content: $('#content'), status: $('#status') };
    f.title.value = post.title; f.slug.value = post.slug; f.tags.value = post.tags.join(', ');
    f.cover.value = post.cover; f.excerpt.value = post.excerpt; f.content.value = post.content; f.status.value = post.status;

    const collect = () => ({
      title: f.title.value, slug: f.slug.value, excerpt: f.excerpt.value, content: f.content.value,
      cover: f.cover.value, status: f.status.value,
      tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
    });

    let dirty = false;
    const refresh = () => {
      $('#preview').innerHTML = BlogMarkdown.render(f.content.value).html;
      const s = BlogMarkdown.stats(f.content.value);
      $('#count').textContent = `${s.words} words · ${s.minutes} min read`;
      const c = f.cover.value.trim();
      const img = $('#cover-prev');
      img.hidden = !c; if (c) img.src = c;
    };
    refresh();

    let timer;
    Object.values(f).forEach((el) => el.addEventListener('input', () => {
      dirty = true; refresh();
      clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.setItem(draftKey, JSON.stringify(collect()));
        $('#autosave').textContent = 'Local draft saved ' + new Date().toLocaleTimeString();
      }, 800);
    }));
    window.onbeforeunload = () => (dirty ? true : undefined);

    let currentId = id;
    async function save() {
      try {
        const body = collect();
        const saved = currentId
          ? await api('/api/posts/' + currentId, { method: 'PUT', body })
          : await api('/api/posts', { method: 'POST', body });
        const wasNew = !currentId;
        currentId = saved.id;
        f.slug.value = saved.slug;
        dirty = false;
        localStorage.removeItem(draftKey);
        $('#autosave').textContent = '';
        toast(saved.status === 'published' ? 'Published' : 'Draft saved');
        if (wasNew) history.replaceState(null, '', '#/edit/' + saved.id);
      } catch (e) { toast(e.message, true); }
    }
    $('#save').onclick = save;
    f.content.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (e.key === 'Tab') { e.preventDefault(); insert('  '); }
    });
    document.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };

    /* editing helpers */
    function insert(text, selectStart, selectEnd) {
      const el = f.content;
      const s = el.selectionStart, e = el.selectionEnd;
      el.setRangeText(text, s, e, 'end');
      if (selectStart != null) el.setSelectionRange(s + selectStart, s + selectEnd);
      el.focus();
      el.dispatchEvent(new Event('input'));
    }
    function wrap(before, after, placeholder) {
      const el = f.content;
      const sel = el.value.slice(el.selectionStart, el.selectionEnd) || placeholder;
      insert(before + sel + after, before.length, before.length + sel.length);
    }
    function linePrefix(prefix, placeholder) {
      const el = f.content;
      const sel = el.value.slice(el.selectionStart, el.selectionEnd) || placeholder;
      const needNl = el.selectionStart > 0 && el.value[el.selectionStart - 1] !== '\n' ? '\n' : '';
      insert(needNl + sel.split('\n').map((l) => prefix + l).join('\n') + '\n');
    }

    // Shrink big photos in the browser so they fit the free Firebase limit (700 KB).
    async function shrink(file) {
      const LIMIT = 650 * 1024;
      if (file.size <= LIMIT || file.type === 'image/gif') return file;
      const bmp = await createImageBitmap(file);
      let scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      for (let q = 0.85; ; ) {
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
        if (blob.size <= LIMIT || c.width < 200) return blob;
        if (q > 0.5) q -= 0.1; else scale *= 0.8;
      }
    }
    async function upload(file) {
      if (!file || !file.type.startsWith('image/')) return null;
      if (file.size > 20 * 1024 * 1024) { toast('Image must be under 20 MB', true); return null; }
      try { toast('Uploading…'); const r = await api('/api/upload', { method: 'POST', body: await shrink(file) }); toast('Uploaded'); return r.url; }
      catch (e) { toast(e.message, true); return null; }
    }
    async function insertImage(file) {
      const url = await upload(file);
      if (url) insert(`\n![${file.name.replace(/\.\w+$/, '')}](${url})\n`);
    }

    const actions = {
      bold: () => wrap('**', '**', 'bold text'),
      italic: () => wrap('*', '*', 'italic text'),
      h2: () => linePrefix('## ', 'Heading'),
      h3: () => linePrefix('### ', 'Heading'),
      link: () => { const u = prompt('Link URL', 'https://'); if (u) wrap('[', `](${u})`, 'link text'); },
      code: () => { const l = prompt('Language (js, python, bash…)', '') || ''; wrap('\n```' + l + '\n', '\n```\n', 'code'); },
      quote: () => linePrefix('> ', 'Quote'),
      ul: () => linePrefix('- ', 'Item'),
      task: () => linePrefix('- [ ] ', 'Task'),
      table: () => insert('\n| Column A | Column B |\n| --- | --- |\n| Cell | Cell |\n'),
      callout: () => insert('\n> [!NOTE]\n> Your note here\n'),
      video: () => {
        const u = prompt('YouTube or Vimeo URL');
        if (!u) return;
        if (!BlogMarkdown.parseYouTube(u) && !/vimeo\.com\/\d+/.test(u)) { toast('Not a recognised YouTube/Vimeo URL', true); return; }
        insert(`\n${u.trim()}\n`);
      },
      image: () => $('#img-file').click(),
    };
    app.querySelectorAll('.toolbar [data-act]').forEach((b) => (b.onclick = () => actions[b.dataset.act]()));
    $('#img-file').onchange = (e) => { insertImage(e.target.files[0]); e.target.value = ''; };
    $('#cover-file').onchange = async (e) => {
      const url = await upload(e.target.files[0]);
      if (url) { f.cover.value = url; f.cover.dispatchEvent(new Event('input')); }
      e.target.value = '';
    };
    f.content.addEventListener('paste', (e) => {
      const file = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (file) { e.preventDefault(); insertImage(file); }
    });
    f.content.addEventListener('dragover', (e) => { e.preventDefault(); f.content.classList.add('drag'); });
    f.content.addEventListener('dragleave', () => f.content.classList.remove('drag'));
    f.content.addEventListener('drop', (e) => {
      e.preventDefault(); f.content.classList.remove('drag');
      [...e.dataTransfer.files].forEach(insertImage);
    });
  }

  /* ---------- router ---------- */
  async function route() {
    window.onbeforeunload = null;
    document.onkeydown = null;
    const h = location.hash || '#/';
    try {
      const me = await api('/api/me');
      if (!me.admin) return loginView();
      if (h === '#/login') return go('#/');
      let m;
      if (h === '#/new') return await editorView();
      if ((m = h.match(/^#\/edit\/([\w-]+)$/))) return await editorView(m[1]);
      return await listView();
    } catch (e) { toast(e.message, true); }
  }
  addEventListener('hashchange', route);
  route();
})();
