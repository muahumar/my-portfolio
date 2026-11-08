'use strict';
const md = require('./markdown');
const { esc } = md;

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

function layout({ title, description, url, image, type = 'website', body, extraHead = '', scripts = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  ${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
  <link rel="alternate" type="application/rss+xml" title="Blog RSS" href="/blog/rss.xml">
  <link rel="icon" type="image/svg+xml" href="/assets/icons/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/_blog/blog.css">
  ${extraHead}
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="site-header">
    <div class="container site-header__inner">
      <a class="site-header__logo" href="/" aria-label="MUA home">MUA<span>.</span></a>
      <nav class="blog-nav" aria-label="Main navigation">
        <a href="/">Portfolio</a>
        <a href="/blog" aria-current="page">Blog</a>
      </nav>
    </div>
  </header>
  <main id="main">${body}</main>
  <footer class="blog-footer container">
    <p>&copy; ${new Date().getFullYear()} Muhammad Umar Abbas &middot; <a href="/blog/rss.xml">RSS</a> &middot; <a href="/admin">Admin</a></p>
  </footer>
  ${scripts}
</body>
</html>`;
}

function card(p) {
  return `<article class="card">
    ${p.cover ? `<a class="card__cover" href="/blog/${esc(p.slug)}" tabindex="-1" aria-hidden="true"><img src="${esc(p.cover)}" alt="" loading="lazy"></a>` : ''}
    <div class="card__body">
      <p class="card__meta"><time datetime="${p.publishedAt}">${fmtDate(p.publishedAt)}</time> &middot; ${md.stats(p.content).minutes} min read</p>
      <h2 class="card__title"><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2>
      <p class="card__excerpt">${esc(p.excerpt)}</p>
      <p class="tags">${p.tags.map((t) => `<a class="tag" href="/blog?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</p>
    </div>
  </article>`;
}

function listPage({ posts, page, pages, q, tag, tags, siteUrl }) {
  const qs = (n) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (tag) p.set('tag', tag);
    if (n > 1) p.set('page', n);
    const s = p.toString();
    return '/blog' + (s ? '?' + s : '');
  };
  const body = `
  <section class="container blog-hero">
    <p class="eyebrow"><span class="eyebrow__dot"></span> Blog</p>
    <h1>Notes on QA, software &amp; learning</h1>
    <form class="blog-search" role="search" action="/blog" method="get">
      <label class="sr-only" for="q">Search posts</label>
      <input id="q" name="q" type="search" placeholder="Search posts…" value="${esc(q)}">
      ${tag ? `<input type="hidden" name="tag" value="${esc(tag)}">` : ''}
      <button class="button button--primary button--small" type="submit">Search</button>
    </form>
    ${tags.length ? `<p class="tags tags--filter"><a class="tag${tag ? '' : ' tag--active'}" href="/blog">All</a>${tags
      .map(([t, n]) => `<a class="tag${t === tag ? ' tag--active' : ''}" href="/blog?tag=${encodeURIComponent(t)}">#${esc(t)} <small>${n}</small></a>`)
      .join('')}</p>` : ''}
  </section>
  <section class="container">
    ${posts.length ? `<div class="grid">${posts.map(card).join('')}</div>` : `<p class="empty">No posts found${q || tag ? ' for this filter' : ' yet'}.</p>`}
    ${pages > 1 ? `<nav class="pager" aria-label="Pagination">
      ${page > 1 ? `<a class="button button--outline button--small" href="${qs(page - 1)}">&larr; Newer</a>` : '<span></span>'}
      <span>Page ${page} of ${pages}</span>
      ${page < pages ? `<a class="button button--outline button--small" href="${qs(page + 1)}">Older &rarr;</a>` : '<span></span>'}
    </nav>` : ''}
  </section>`;
  return layout({
    title: 'Blog | Muhammad Umar Abbas',
    description: 'Articles on QA engineering, software, and learning.',
    url: siteUrl + '/blog',
    body,
  });
}

function postPage({ post, rendered, siteUrl, related, preview }) {
  const url = `${siteUrl}/blog/${post.slug}`;
  const img = post.cover ? (post.cover.startsWith('/') ? siteUrl + post.cover : post.cover) : '';
  const { minutes } = md.stats(post.content);
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: 'Muhammad Umar Abbas' },
    ...(img && { image: img }),
    mainEntityOfPage: url,
  };
  const toc = rendered.toc.length > 2
    ? `<nav class="toc" aria-label="Table of contents"><strong>On this page</strong><ul>${rendered.toc
        .map((h) => `<li class="toc--l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></nav>`
    : '';
  const body = `
  <div class="progress" id="progress" aria-hidden="true"></div>
  <article class="container post">
    ${preview ? '<p class="draft-banner">Draft preview - not visible to the public.</p>' : ''}
    <header class="post__header">
      <p class="card__meta"><a href="/blog">&larr; All posts</a></p>
      <h1>${esc(post.title)}</h1>
      <p class="card__meta"><time datetime="${post.publishedAt || post.createdAt}">${fmtDate(post.publishedAt || post.createdAt)}</time> &middot; ${minutes} min read</p>
      <p class="tags">${post.tags.map((t) => `<a class="tag" href="/blog?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</p>
    </header>
    ${post.cover ? `<img class="post__cover" src="${esc(post.cover)}" alt="">` : ''}
    <div class="post__layout">
      <div class="prose" id="prose">${rendered.html}</div>
      <aside class="post__side">${toc}</aside>
    </div>
    <footer class="post__footer">
      <button class="button button--outline button--small" type="button" id="copy-link">Copy link</button>
      <a class="button button--outline button--small" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&amp;text=${encodeURIComponent(post.title)}">Share on X</a>
      <a class="button button--outline button--small" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">Share on LinkedIn</a>
    </footer>
    ${related.length ? `<section class="related"><h2>More posts</h2><div class="grid">${related.map(card).join('')}</div></section>` : ''}
  </article>`;
  return layout({
    title: `${post.title} | Muhammad Umar Abbas`,
    description: post.excerpt,
    url,
    image: img,
    type: 'article',
    body,
    extraHead: `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>${preview ? '<meta name="robots" content="noindex">' : ''}`,
    scripts: '<script src="/_blog/blog.js" defer></script>',
  });
}

function notFound(siteUrl) {
  return layout({
    title: 'Not found | Blog',
    description: 'Page not found',
    url: siteUrl + '/blog',
    body: '<section class="container blog-hero"><h1>404</h1><p>That post could not be found.</p><p><a class="button button--primary" href="/blog">Back to blog</a></p></section>',
  });
}

function rss({ posts, siteUrl }) {
  const x = (s) => esc(s).replace(/'/g, '&apos;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Muhammad Umar Abbas - Blog</title><link>${x(siteUrl)}/blog</link><description>Articles on QA engineering, software, and learning.</description>
${posts.slice(0, 20).map((p) => `<item><title>${x(p.title)}</title><link>${x(siteUrl)}/blog/${x(p.slug)}</link><guid>${x(siteUrl)}/blog/${x(p.slug)}</guid><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${x(p.excerpt)}</description></item>`).join('\n')}
</channel></rss>`;
}

module.exports = { listPage, postPage, notFound, rss };
