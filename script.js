// Seamless tiles, min 350px / max 400px height, faster loads, click opens full image (same tab)
(async () => {
  const status = document.getElementById('status');
  const gallery = document.getElementById('gallery');

  const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

  const withRK = (base, id, rk, extra='') =>
    `${base}${base.includes('?') ? '&' : '?'}${extra ? extra + '&' : ''}id=${encodeURIComponent(id)}${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}`;

  // Build URLs
  const thumbUrl = (id, rk, w=1000) => withRK('https://drive.google.com/thumbnail', id, rk, `sz=w${w}`);
  const viewUrl  = (id, rk)          => withRK('https://drive.google.com/uc?export=view', id, rk);
  const gucUrl   = (id, w=2000)      => `https://lh3.googleusercontent.com/d/${id}=w${w}`;

  // Lazy attach images only when near viewport (for speed)
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const fig = entry.target;
      observer.unobserve(fig);

      const { id, name, rk } = fig.dataset;

      // Anchor: clicking opens full image in SAME TAB (default)
      const a = document.createElement('a');
      a.href = viewUrl(id, rk || '');

      // Optimized image element
      const img = new Image();
      img.loading = 'lazy';
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.referrerPolicy = 'no-referrer';
      img.alt = name || '';

      // Serve responsive thumbnails for speed
      const w1 = 600, w2 = 1000, w3 = 1600;
      img.src = thumbUrl(id, rk, w2);
      img.srcset = [
        `${thumbUrl(id, rk, w1)} ${w1}w`,
        `${thumbUrl(id, rk, w2)} ${w2}w`,
        `${thumbUrl(id, rk, w3)} ${w3}w`
      ].join(', ');
      img.sizes = '(min-width:1200px) 20vw, (min-width:900px) 25vw, (min-width:640px) 33vw, (min-width:360px) 50vw, 100vw';

      // Robust fallbacks if thumbnails are blocked
      img.onerror = () => {
        if (img.dataset.fail === '1') {
          img.src = gucUrl(id);
          img.removeAttribute('srcset');
          img.removeAttribute('sizes');
        } else if (img.dataset.fail === '2') {
          img.src = viewUrl(id, rk || '');
        } else {
          img.dataset.fail = String((Number(img.dataset.fail||0) + 1));
          img.src = thumbUrl(id, rk, w1);
        }
      };

      a.appendChild(img);
      fig.appendChild(a);
    }
  }, { root: null, rootMargin: '600px 0px', threshold: 0.01 });

  try {
    const res = await fetch('files.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('files.json missing');
    let files = await res.json();

    // Only image-like files
    files = (Array.isArray(files) ? files : []).filter(f => IMG_EXT_RE.test(f.name || ''));

    if (!files.length) {
      status.textContent = 'No images found (check sharing and file types).';
      return;
    }

    // Create empty figure shells (zero margins)
    gallery.innerHTML = files.map(f =>
      `<figure class="item" data-id="${f.id}" data-rk="${f.rk || ''}" data-name="${(f.name||'').replace(/"/g,'&quot;')}"></figure>`
    ).join('');

    // Observe for lazy insertion
    gallery.querySelectorAll('figure.item').forEach(fig => observer.observe(fig));

    status.hidden = true;
    gallery.hidden = false;
  } catch (e) {
    console.error(e);
    status.textContent = 'Error loading gallery.';
  }
})();
