'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Post store. Subclasses implement _all(), _put(post), _del(id).
 * All public methods are async so backends can be local or remote.
 */
class BaseStore {
  async list({ publishedOnly = false, q = '', tag = '' } = {}) {
    const needle = q.trim().toLowerCase();
    return (await this._all())
      .filter((p) => !publishedOnly || p.status === 'published')
      .filter((p) => !tag || p.tags.includes(tag))
      .filter((p) => !needle || `${p.title} ${p.excerpt} ${p.content} ${p.tags.join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));
  }

  async tags() {
    const counts = {};
    (await this._all()).filter((p) => p.status === 'published').forEach((p) => p.tags.forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  async byId(id) { return (await this._all()).find((p) => p.id === id); }
  async bySlug(slug) { return (await this._all()).find((p) => p.slug === slug); }

  async _uniqueSlug(base, ignoreId) {
    const all = await this._all();
    let slug = base || 'post';
    let n = 1;
    while (all.some((p) => p.slug === slug && p.id !== ignoreId)) slug = `${base || 'post'}-${++n}`;
    return slug;
  }

  async create(data, slugify) {
    const now = new Date().toISOString();
    const post = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === 'published' ? now : null,
      ...data,
    };
    post.slug = await this._uniqueSlug(slugify(data.slug || data.title), post.id);
    await this._put(post);
    return post;
  }

  async update(id, data, slugify) {
    const post = await this.byId(id);
    if (!post) return null;
    const wasPublished = post.status === 'published';
    const next = { ...post, ...data, updatedAt: new Date().toISOString() };
    next.slug = await this._uniqueSlug(slugify(data.slug || data.title), id);
    if (next.status === 'published' && !wasPublished && !next.publishedAt) next.publishedAt = next.updatedAt;
    await this._put(next);
    return next;
  }

  async remove(id) {
    if (!(await this.byId(id))) return false;
    await this._del(id);
    return true;
  }
}

/** JSON-file backend with atomic writes (default when Firebase isn't configured). */
class FileStore extends BaseStore {
  constructor(dir) {
    super();
    this.file = path.join(dir, 'posts.json');
    fs.mkdirSync(dir, { recursive: true });
    this.posts = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  _save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.posts, null, 2));
    fs.renameSync(tmp, this.file);
  }
  async _all() { return this.posts; }
  async _put(post) {
    const i = this.posts.findIndex((p) => p.id === post.id);
    if (i >= 0) this.posts[i] = post; else this.posts.push(post);
    this._save();
  }
  async _del(id) { this.posts = this.posts.filter((p) => p.id !== id); this._save(); }
}

module.exports = { BaseStore, FileStore };
