// Interactive pack: search + shuffle + scroll reveal + lightbox + back-to-top
(async () => {
  const status  = document.getElementById('status');
  const gallery = document.getElementById('gallery');
  const q       = document.getElementById('q');
  const shuffleBtn = document.getElementById('shuffle');

  // Lightbox elements
  const lb      = document.getElementById('lightbox');
  const lbImg   = document.getElementById('lbImg');
  const lbCap   = document.getElementById('lbCaption');
  const lbClose = document.getElementById('lbClose');
  const lbPrev  = document.getElementById('lbPrev');
  const lbNext  = document.getElementById('lbNext');

  const toTop   = document.getElementById('toTop');

  const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

  const withRK = (base, id, rk, extra='') =>
    `${base}${base.includes('?') ? '&' : '?'}${extra ? extra + '&' : ''}id=${encodeURIComponent(id)}${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}`;

  // URLs
  const thumbUrl = (id, rk, w=400) => withRK('https://drive.google.com/thumbnail', id, rk, `sz=w${w}`);
  const viewUrl  = (id, rk)        => withRK('https://drive.google.com/uc?export=view', id, rk);
  const gucUrl   = (id, w=2500)    => `https://lh3.googleusercontent.com/d/${id}=w${w}`;

  // Global state
  let files = [];
  let view  = [];   // filtered & ordered
  let current = -1;

  // Helpers
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Build gallery shells + lazy attach
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const fig = entry.target;
      observer.unobserve(fig);

      const idx = +fig.dataset.index;
      const it  = view[idx];

      // Reveal animation
      requestAnimationFrame(() => fig.classList.add('reveal'));

      // Anchor around image (default same-tab link if user opens in new tab)
      const a = document.createElement('a');
      a.href = viewUrl(it.id, it.rk || '');

      const img = new Image();
      img.loading = 'lazy';
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.referrerPolicy = 'no-referrer';
      img.alt = it.name || '';

      // Responsive thumbs (very small tiles now)
      const w1 = 200, w2 = 400, w3 = 800;
      img.src = thumbUrl(it.id, it.rk, w2);
      img.srcset = [
        `${thumbUrl(it.id, it.rk, w1)} ${w1}w`,
        `${thumbUrl(it.id, it.rk, w2)} ${w2}w`,
        `${thumbUrl(it.id, it.rk, w3)} ${w3}w`
      ].join(', ');
      img.sizes = '(min-width:1200px) 6.7vw, (min-width:900px) 8.3vw, (min-width:640px) 11.1vw, (min-width:360px) 16.7vw, 33vw';

      // Fallbacks
      img.onerror = () => {
        if (img.dataset.fail === '1') {
          img.src = gucUrl(it.id);
          img.removeAttribute('srcset');
          img.removeAttribute('sizes');
        } else if (img.dataset.fail === '2') {
          img.src = viewUrl(it.id, it.rk || '');
        } else {
          img.dataset.fail = String((Number(img.dataset.fail||0) + 1));
          img.src = thumbUrl(it.id, it.rk, w1);
        }
      };

      a.appendChild(img);
      fig.appendChild(a);
    }
  }, { root: null, rootMargin: '600px 0px', threshold: 0.01 });

  function buildGallery() {
    // Build figure shells only (fast)
    gallery.innerHTML = view.map((f, i) =>
      `<figure class="item" data-index="${i}" data-id="${f.id}" data-rk="${f.rk || ''}" data-name="${(f.name||'').replace(/"/g,'&quot;')}"></figure>`
    ).join('');
    // Observe all
    gallery.querySelectorAll('figure.item').forEach(fig => observer.observe(fig));
    status.hidden = true;
    gallery.hidden = false;
  }

  // Search filter (by filename)
  function applyFilter(term) {
    const t = (term || '').trim().toLowerCase();
    if (!t) { view = files.slice(); return; }
    view = files.filter(f => (f.name || '').toLowerCase().includes(t));
  }

  // Lightbox
  function openLightbox(i) {
    if (i < 0 || i >= view.length) return;
    current = i;
    const it = view[i];
    lbImg.src = ''; // clear first
    lbImg.alt = it.name || '';
    lbCap.textContent = it.name || '';
    // Prefer direct img; fallback to view URL
    const try1 = gucUrl(it.id, 3000);
    const try2 = viewUrl(it.id, it.rk || '');
    lbImg.onerror = () => { if (lbImg.src !== try2) lbImg.src = try2; };
    lbImg.src = try1;

    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden'; // lock scroll
    // Preload neighbor
    const n = new Image(); const j = Math.min(view.length - 1, i + 1);
    n.src = gucUrl(view[j].id, 2000);
  }
  function closeLightbox() {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    current = -1;
  }
  function next() { if (current >= 0) openLightbox((current + 1) % view.length); }
  function prev() { if (current >= 0) openLightbox((current - 1 + view.length) % view.length); }

  // Event delegation: click tile -> lightbox (unless meta/ctrl for new tab)
  gallery.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let user open new tab if they want
    e.preventDefault();
    const fig = e.target.closest('figure.item');
    if (!fig) return;
    openLightbox(+fig.dataset.index);
  });

  // Lightbox controls
  lbClose.addEventListener('click', closeLightbox);
  lbNext.addEventListener('click', next);
  lbPrev.addEventListener('click', prev);
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  window.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  });

  // Search & Shuffle
  q.addEventListener('input', () => { applyFilter(q.value); buildGallery(); });
  shuffleBtn.addEventListener('click', () => { view = shuffle(view.length ? view : files); buildGallery(); });

  // Back to top
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  try {
    // Cache-bust files.json so updates show immediately
    const res = await fetch('files.json?' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('files.json missing');
    const raw = await res.json();

    files = (Array.isArray(raw) ? raw : []).filter(f => IMG_EXT_RE.test(f.name || ''));
    view = files.slice();

    if (!view.length) { status.textContent = 'No images found (check sharing and file types).'; return; }

    buildGallery();
  } catch (e) {
    console.error(e);
    status.textContent = 'Error loading gallery.';
  }
})();
