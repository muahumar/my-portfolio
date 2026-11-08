(function () {
  'use strict';
  // Reading progress bar
  const bar = document.getElementById('progress');
  const prose = document.getElementById('prose');
  if (bar && prose) {
    const update = () => {
      const r = prose.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.5;
      const pct = Math.min(1, Math.max(0, -r.top / Math.max(total, 1)));
      bar.style.width = pct * 100 + '%';
    };
    addEventListener('scroll', update, { passive: true });
    update();
  }

  // Copy buttons on code blocks
  document.querySelectorAll('pre.code').forEach((pre) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code').textContent);
        btn.textContent = 'Copied!';
      } catch { btn.textContent = 'Failed'; }
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
    pre.appendChild(btn);
  });

  // Copy post link
  const copy = document.getElementById('copy-link');
  if (copy) {
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href.split('#')[0]); copy.textContent = 'Copied!'; }
      catch { copy.textContent = 'Press Ctrl+C'; }
      setTimeout(() => (copy.textContent = 'Copy link'), 1500);
    });
  }

  // Highlight current section in TOC
  const links = [...document.querySelectorAll('.toc a')];
  if (links.length && 'IntersectionObserver' in window) {
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.remove('active'));
          const a = map.get(e.target.id);
          if (a) a.classList.add('active');
        }
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    map.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
  }
})();
