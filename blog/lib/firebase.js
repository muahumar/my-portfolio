'use strict';
const { BaseStore } = require('./store');

/**
 * Firebase backend: posts in Firestore, images in Cloud Storage (served back
 * through the app at /uploads/<name>, so the bucket can stay private).
 *
 * Config (env):
 *   FIREBASE_SERVICE_ACCOUNT   service-account JSON, raw or base64   (or use GOOGLE_APPLICATION_CREDENTIALS path)
 *   FIREBASE_STORAGE_BUCKET    e.g. my-project.firebasestorage.app   (required for image uploads)
 *   FIREBASE_POSTS_COLLECTION  optional, default "posts"
 */
function isConfigured() {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_PROJECT_ID);
}

function init() {
  const { initializeApp, getApps, cert, applicationDefault } = require('firebase-admin/app');
  if (!getApps().length) {
    const opts = {};
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      opts.credential = cert(JSON.parse(text));
    } else {
      opts.credential = applicationDefault();
    }
    if (process.env.FIREBASE_PROJECT_ID) opts.projectId = process.env.FIREBASE_PROJECT_ID;
    if (process.env.FIREBASE_STORAGE_BUCKET) opts.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    initializeApp(opts);
  }
  return {
    firestore: () => require('firebase-admin/firestore').getFirestore(),
    storage: () => require('firebase-admin/storage').getStorage(),
  };
}
class FirestoreStore extends BaseStore {
  constructor() {
    super();
    const admin = init();
    this.col = admin.firestore().collection(process.env.FIREBASE_POSTS_COLLECTION || 'posts');
    this.cache = null;
    this.cacheAt = 0;
  }

  async _all() {
    if (this.cache && Date.now() - this.cacheAt < 15_000) return this.cache;
    const snap = await this.col.get();
    this.cache = snap.docs.map((d) => ({ tags: [], ...d.data(), id: d.id }));
    this.cacheAt = Date.now();
    return this.cache;
  }
  async _put(post) {
    const { id, ...data } = post;
    await this.col.doc(id).set(data);
    this.cache = null;
  }
  async _del(id) {
    await this.col.doc(id).delete();
    this.cache = null;
  }
}

/** Cloud Storage uploads. */
class StorageUploads {
  constructor() {
    const admin = init();
    this.bucket = admin.storage().bucket(); // throws if no bucket configured
  }
  async save(name, buf, contentType) {
    await this.bucket.file('uploads/' + name).save(buf, {
      contentType,
      resumable: false,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
  }
  /** Returns a readable stream or null. */
  async stream(name) {
    const file = this.bucket.file('uploads/' + name);
    const [exists] = await file.exists();
    return exists ? file.createReadStream() : null;
  }
}


/**
 * Free-tier (Spark plan) uploads: Cloud Storage now requires the paid Blaze plan,
 * so images are stored as small base64 documents in Firestore instead
 * (Firestore docs are capped at 1 MiB, so uploads are limited to MAX_BYTES).
 */
class FirestoreUploads {
  static MAX_BYTES = 700 * 1024;
  constructor() {
    this.col = init().firestore().collection(process.env.FIREBASE_UPLOADS_COLLECTION || 'uploads');
  }
  async save(name, buf, contentType) {
    await this.col.doc(name.replace(/\.\w+$/, '')).set({ name, contentType, data: buf.toString('base64'), createdAt: new Date().toISOString() });
  }
  /** Returns { buffer, contentType } or null. */
  async read(name) {
    const d = await this.col.doc(name.replace(/\.\w+$/, '')).get();
    if (!d.exists) return null;
    const v = d.data();
    return { buffer: Buffer.from(v.data, 'base64'), contentType: v.contentType };
  }
}
module.exports = { isConfigured, FirestoreStore, StorageUploads, FirestoreUploads };
