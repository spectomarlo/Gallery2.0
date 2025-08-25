// Faster loads + no gaps + 400px max height + click to full image (same tab)
(async () => {
  const status = document.getElementById('status');
  const gallery = document.getElementById('gallery');

  const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

  const withRK = (base, id, rk, extra='') =>
    `${base}${base.includes('?') ? '&' : '?'}${extra ? extra + '&' : ''}id=${encodeURIComponent(id)}${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}`;

  // Build best thumbnail URL(s) for speed
  const thumbUrl = (id, rk, w=1000) => withRK('https://drive.google.com/thumbnail', id, rk, `sz=w${w}`);
  const viewUrl  = (id, rk) => withRK('https://drive.google.com/uc?export=view', id, rk);
  const gucUrl   = (id) => `https://lh3.googleusercontent.com/d/${id}=w2000`;

  // IntersectionObserver to only create <img> when near viewport
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const fig = entry.target;
      observer.unobserve(fig);
      const { id, name, rk } = fig.dataset;

      // Wrap image in <a> so clicking opens full image in SAME TAB
      // (full image = direct view URL; same tab is default behavior)
      const a = document.createElement('a');
      a.href = viewUrl(id, rk || '');
      // default target is same tab (no target attribute)

      const img = new Image();
      img.loading = 'lazy';
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.referrerPolicy = 'no-referrer';
      img.alt = name || '';

      // Use responsive thumbnails (browser picks the best width)
      const w1 = 600, w2 = 1000, w3 = 1600;
      img.src = thumbUrl(id, rk, w2);
      img.srcset = [
        `${thumbUrl(id, rk, w1)} ${w1}w`,
        `${thumbUrl(id, rk, w2)} ${w2}w`,
        `${thumbUrl(id, rk, w3)} ${w3}w`
      ].join(', ');
      img.sizes = '(min-width:1200px) 20vw, (min-width:900px) 25vw, (min-width:640px) 33vw, (min-width:360px) 50vw, 100vw';

      // Fallbacks if Drive blocks thumbnails
      img.onerror = () => {
        if (img.dataset.fail === '1') {
          img.src = gucUrl(id);   // googleusercontent direct
          img.removeAttribute('srcset');
          img.removeAttribute('sizes');
        } else if (img.dataset.fail === '2') {
          // final fallback: view URL (may be larger)
          img.src = viewUrl(id, rk || '');
        } else {
          img.dataset.fail = String((Number(img.dataset.fail||0) + 1));
          img.src = thumbUrl(id, rk, w1); // try smaller thumb first
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

    // Keep only image-like names (skip PDFs/videos)
    files = (Array.isArray(files) ? files : []).filter(f => IMG_EXT_RE.test(f.name || ''));

    if (!files.length) {
      status.textContent = 'No images found (check file sharing and types).';
      return;
    }

    // Shell figures first (fast DOM)
    gallery.innerHTML = files.map(f =>
      `<figure class="item" data-id="${f.id}" data-rk="${f.rk || ''}" data-name="${(f.name||'').replace(/"/g,'&quot;')}"></figure>`
    ).join('');

    // Observe for lazy attach
    gallery.querySelectorAll('figure.item').forEach(fig => observer.observe(fig));

    status.hidden = true;
    gallery.hidden = false;
  } catch (e) {
    console.error(e);
    status.textContent = 'Error loading gallery.';
  }
})();
