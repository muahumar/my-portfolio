# Muhammad Umar Abbas — Portfolio

A responsive, single-page personal portfolio built with semantic HTML, plain CSS, and a small inline vanilla JavaScript snippet. There are no frameworks, build tools, or runtime data requests. Google Fonts are the only external design dependency; system fallbacks are provided.

## Preview locally

Open `index.html` directly in a modern browser. All page content is hardcoded into the HTML, so it also works without a server. The Email me button opens the visitor's default email app; it does not send data to a server.

## Customize content

`resume.json` is the source of truth for portfolio content, but the browser does not load it. When `resume.json` changes, update the corresponding hardcoded text, links, dates, and lists in `index.html` as well.

Use the `EDIT` comments in `index.html` as a checklist for remaining personal assets and information:

- Add your resume PDF at `assets/images/resume.pdf` and enable the disabled hero download button.
- Add the Projects navigation link and section when you have real projects to share. Use sanitized QA artifacts (for example, a sample test plan or bug report template); do not include confidential employer details.
- Replace the `YYYY-MM` work start-date note with the actual start date when known.
- Replace the SVG social preview (`assets/images/og-image.svg`) with a public 1200x630 PNG or JPG, since Facebook, LinkedIn, and X do not reliably render SVG previews.

The Projects section is intentionally hidden until real projects are available. The canonical and Open Graph URLs point to the live GitHub Pages site.

## Customize colors and fonts

Edit the custom properties in `:root` at the top of `css/style.css` to change the palette, typefaces, spacing, radii, and content width. The dark palette is the default. The `prefers-color-scheme: light` block provides the light palette; the visitor's system preference selects the theme automatically.

Responsive layout rules are in `css/responsive.css`. Keep focus-visible styles and the reduced-motion override when adjusting effects.

## Deploy to GitHub Pages

1. Create a GitHub repository and add the portfolio files while preserving the folder structure.
2. Push the files to the repository's default branch.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**, choose the default branch and `/ (root)`, then save.
5. After GitHub Pages finishes publishing, open the URL shown in the Pages settings.

No compilation or dependency installation is needed. If a custom domain is used, configure it in the Pages settings and add the appropriate DNS records with the domain provider.

## Blog (admin-only publishing)

A zero-dependency Node.js blog lives in `blog/`. Only the admin can log in and write; visitors can read published posts.

```
npm start            # http://localhost:3000  (portfolio at /, blog at /blog, admin at /admin)
npm test             # smoke tests (auth, XSS, uploads, CRUD)
```

- **First run** prints a generated admin username/password once. Or set `ADMIN_USER` and `ADMIN_PASSWORD` env vars. Other env: `PORT`, `SITE_URL` (public https URL, used for canonical/RSS), `DATA_DIR`, `SESSION_SECRET`.
- **Editor**: Markdown with live preview, toolbar, drag/drop/paste image upload, cover image, tags, drafts, autosave, Ctrl+S.
- **Embeds**: paste a YouTube or Vimeo URL on its own line (also image/video file URLs). Callouts (`> [!NOTE]`), tables, task lists and code blocks are supported.
- **Reader features**: search, tag filter, pagination, reading time, table of contents, progress bar, copy-code, share links, RSS (`/blog/rss.xml`), Open Graph + JSON-LD.
- **Security**: scrypt-hashed password, signed HttpOnly SameSite=Strict session cookie, login rate limiting, custom-header CSRF guard, all post HTML escaped, strict CSP, image uploads verified by magic bytes (no SVG).
- **Hosting**: this needs a Node host (Render, Railway, Fly.io, a VPS) with a persistent disk for `blog/data`. GitHub Pages and Netlify static hosting cannot run it, so the `/blog` nav link only works on the Node-hosted site.

### Firebase backend (free Spark plan)

Set these env vars and posts are stored in **Firestore**; without them the blog falls back to local files. Everything below fits the free plan (Firestore: 1 GiB, 50k reads/day, 20k writes/day).

| Variable | Value |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Service-account JSON (raw or base64), or set `GOOGLE_APPLICATION_CREDENTIALS` to a key file path |
| `FIREBASE_STORAGE_BUCKET` | **Leave unset on the free plan.** Cloud Storage now requires the paid Blaze plan; only set this if you upgrade |

**Images on the free plan** are stored in Firestore (collection `uploads`) and served via `/uploads/...`. Firestore documents are capped at 1 MiB, so images are limited to 700 KB; the editor automatically resizes larger photos to fit.

Setup: Firebase console -> create project (stay on Spark) -> Build -> Firestore Database -> Create database -> Project settings -> Service accounts -> Generate new private key. Never commit the key (`serviceAccount*.json` and `.env` are git-ignored). Set Firestore rules to deny all client access (`allow read, write: if false`); only this server, via the Admin SDK, reads and writes.

**Free hosting for the Node server:** Firebase's free plan cannot run a Node backend (Cloud Functions need Blaze). Deploy the server on a free host such as Render, Koyeb or Railway's trial, with the env vars above plus `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET` and `SITE_URL`. Since all data is in Firestore, an ephemeral disk is fine. Free Render instances sleep when idle, so the first visit may be slow.