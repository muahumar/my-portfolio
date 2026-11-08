'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const hashPassword = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;

function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Admin credentials come from ADMIN_USER / ADMIN_PASSWORD env vars. If absent, a
 * random password is generated once, stored hashed in data/config.json and
 * printed to the console. There are no default credentials.
 */
function loadConfig(dataDir) {
  if (process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET) {
    return {
      adminUser: process.env.ADMIN_USER || 'admin',
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD),
      secret: process.env.SESSION_SECRET,
    };
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'config.json');
  let cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  let dirty = false;

  if (!cfg.secret) { cfg.secret = crypto.randomBytes(32).toString('hex'); dirty = true; }
  if (!cfg.adminUser) { cfg.adminUser = 'admin'; dirty = true; }
  if (!cfg.passwordHash) {
    const pw = crypto.randomBytes(9).toString('base64url');
    cfg.passwordHash = hashPassword(pw);
    dirty = true;
    console.log(`\n  First run: admin account created.\n    username: ${cfg.adminUser}\n    password: ${pw}\n  (shown once - set ADMIN_PASSWORD to choose your own)\n`);
  }
  if (dirty) fs.writeFileSync(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });

  if (process.env.ADMIN_USER) cfg.adminUser = process.env.ADMIN_USER;
  if (process.env.ADMIN_PASSWORD) cfg.passwordHash = hashPassword(process.env.ADMIN_PASSWORD);
  if (process.env.SESSION_SECRET) cfg.secret = process.env.SESSION_SECRET;
  return cfg;
}

const SESSION_MS = 1000 * 60 * 60 * 12;
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function createSession(user, secret) {
  const payload = b64(JSON.stringify({ u: user, exp: Date.now() + SESSION_MS }));
  return `${payload}.${sign(payload, secret)}`;
}

function readSession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

/** In-memory failed-login limiter: 5 failures / 15 min per IP. */
const fails = new Map();
const WINDOW = 15 * 60 * 1000;
const limiter = {
  blocked(ip) {
    const e = fails.get(ip);
    if (!e) return false;
    if (Date.now() - e.first > WINDOW) { fails.delete(ip); return false; }
    return e.count >= 5;
  },
  fail(ip) {
    const e = fails.get(ip);
    if (!e || Date.now() - e.first > WINDOW) fails.set(ip, { count: 1, first: Date.now() });
    else e.count++;
  },
  reset(ip) { fails.delete(ip); },
};

module.exports = { loadConfig, verifyPassword, createSession, readSession, limiter, SESSION_MS };
