/*
 * Safe Markdown renderer shared by the server (post pages) and the browser
 * (admin live preview). All raw HTML in the source is escaped, so output is safe
 * to inject. Supports: headings, emphasis, links, images (with captions), fenced
 * code, blockquotes, GitHub-style callouts, lists, task lists, tables, rules, and
 * auto-embedding of standalone URLs (YouTube, Vimeo, images, video files).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BlogMarkdown = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const slugify = (s) =>
    String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;
  const safeUrl = (u) => (SAFE_URL.test(u.replace(/&amp;/g, '&')) ? u : '#');

  /* ---------- embeds ---------- */
  function parseYouTube(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const host = u.hostname.replace(/^(www|m)\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
        if (m) id = m[2];
      }
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    let start = 0;
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (t) {
      const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      if (m) start = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    }
    return { id, start };
  }

  function embed(url) {
    const yt = parseYouTube(url);
    if (yt) {
      const q = yt.start ? `?start=${yt.start}` : '';
      return `<div class="embed embed--video"><iframe src="https://www.youtube-nocookie.com/embed/${yt.id}${q}" title="YouTube video" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    }
    const vm = url.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
    if (vm) {
      return `<div class="embed embed--video"><iframe src="https://player.vimeo.com/video/${vm[1]}" title="Vimeo video" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    const safe = esc(url);
    if (/\.(png|jpe?g|gif|webp|svg|avif)(\?\S*)?$/i.test(url)) {
      return `<figure><img src="${safe}" alt="" loading="lazy"></figure>`;
    }
    if (/\.(mp4|webm|ogg)(\?\S*)?$/i.test(url)) {
      return `<figure><video src="${safe}" controls preload="metadata"></video></figure>`;
    }
    return null;
  }

  /* ---------- inline ---------- */
  function inline(text) {
    const codes = [];
    text = text.replace(/`([^`\n]+)`/g, (_, c) => {
      codes.push(`<code>${esc(c)}</code>`);
      return `\u0000${codes.length - 1}\u0000`;
    });
    text = esc(text);

    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, alt, src, cap) => {
      const img = `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy">`;
      return cap ? `<figure>${img}<figcaption>${cap}</figcaption></figure>` : img;
    });
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, label, href) => {
      const external = /^https?:/i.test(href);
      return `<a href="${safeUrl(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });
    // bare URLs -> links (skip ones already inside attributes/tags)
    text = text.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (_, pre, url) =>
      `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

    text = text
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w])__([^_\n]+)__(?!\w)/g, '$1<strong>$2</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    return text.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
  }

  /* ---------- blocks ---------- */
  const RE = {
    fence: /^\s*```\s*([\w+#.-]*)\s*$/,
    heading: /^(#{1,4})\s+(.+?)\s*#*\s*$/,
    hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
    quote: /^\s*>\s?(.*)$/,
    list: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
    tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
    url: /^<?(https?:\/\/\S+?)>?$/,
  };

  const splitRow = (line) =>
    line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  function renderBlocks(src, ctx) {
    const lines = src.split('\n');
    const out = [];
    let i = 0;

    const startsBlock = (l, next) =>
      RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.quote.test(l) ||
      RE.list.test(l) || RE.url.test(l.trim()) || (l.includes('|') && next !== undefined && RE.tableSep.test(next));

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      let m = line.match(RE.fence);
      if (m) {
        const lang = m[1];
        const buf = [];
        i++;
        while (i < lines.length && !RE.fence.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(
          `<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`
        );
        continue;
      }

      m = line.match(RE.heading);
      if (m) {
        const level = m[1].length;
        const raw = m[2];
        let id = slugify(raw.replace(/[`*_~]/g, '')) || 'section';
        const n = ctx.ids[id] = (ctx.ids[id] || 0) + 1;
        if (n > 1) id += '-' + n;
        if (level >= 2 && level <= 3) ctx.toc.push({ level, id, text: raw.replace(/[`*_~]/g, '') });
        out.push(`<h${level} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to section">#</a>${inline(raw)}</h${level}>`);
        i++;
        continue;
      }

      if (RE.hr.test(line)) { out.push('<hr>'); i++; continue; }

      if (RE.quote.test(line)) {
        const buf = [];
        while (i < lines.length && RE.quote.test(lines[i])) buf.push(lines[i++].match(RE.quote)[1]);
        const co = buf[0].match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
        if (co) {
          const kind = co[1].toLowerCase();
          out.push(`<aside class="callout callout--${kind}"><strong class="callout__title">${kind[0].toUpperCase() + kind.slice(1)}</strong>${renderBlocks(buf.slice(1).join('\n'), ctx)}</aside>`);
        } else {
          out.push(`<blockquote>${renderBlocks(buf.join('\n'), ctx)}</blockquote>`);
        }
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
        const head = splitRow(line);
        const aligns = splitRow(lines[i + 1]).map((c) =>
          /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : '');
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
        const cell = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</${tag}>`;
        out.push(
          `<div class="table-wrap"><table><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>${rows
            .map((r) => `<tr>${head.map((_, k) => cell('td', r[k] || '', k)).join('')}</tr>`)
            .join('')}</tbody></table></div>`
        );
        continue;
      }

      m = line.match(RE.list);
      if (m) {
        const ordered = /\d/.test(m[2]);
        const items = [];
        while (i < lines.length) {
          const lm = lines[i].match(RE.list);
          if (lm && /\d/.test(lm[2]) === ordered) {
            items.push({ indent: lm[1].length, text: lm[3] });
            i++;
          } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
            items[items.length - 1].text += ' ' + lines[i].trim();
            i++;
          } else break;
        }
        const tag = ordered ? 'ol' : 'ul';
        // support one level of nesting by indentation
        let html = `<${tag}>`;
        let depth = 0;
        const base = Math.min(...items.map((x) => x.indent));
        items.forEach((it) => {
          const d = it.indent > base ? 1 : 0;
          if (d > depth) { html += `<${tag}>`; depth = 1; }
          if (d < depth) { html += `</${tag}>`; depth = 0; }
          const t = it.text.match(/^\[([ xX])\]\s+(.*)$/);
          html += t
            ? `<li class="task"><input type="checkbox" disabled${t[1] !== ' ' ? ' checked' : ''}> ${inline(t[2])}</li>`
            : `<li>${inline(it.text)}</li>`;
        });
        if (depth) html += `</${tag}>`;
        out.push(html + `</${tag}>`);
        continue;
      }

      m = line.trim().match(RE.url);
      if (m) {
        const e = embed(m[1]);
        if (e) { out.push(e); i++; continue; }
      }

      const buf = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) buf.push(lines[i++]);
      out.push(`<p>${buf.map((l) => inline(l.trim())).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  function render(markdown) {
    const ctx = { ids: {}, toc: [] };
    const src = String(markdown || '').replace(/\r\n?/g, '\n');
    const html = renderBlocks(src, ctx);
    return { html, toc: ctx.toc };
  }

  function stats(markdown) {
    const text = String(markdown || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~|\[\]()!-]/g, ' ');
    const words = (text.match(/\S+/g) || []).length;
    return { words, minutes: Math.max(1, Math.round(words / 220)) };
  }

  return { render, stats, slugify, esc, parseYouTube };
});
