(async () => {
  const status = document.getElementById('status');
  const gallery = document.getElementById('gallery');

  const isImageName = (name='') => /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(name);

  const urlWithRK = (base, id, rk, extra='') =>
    `${base}${base.includes('?') ? '&' : '?'}${extra ? extra + '&' : ''}id=${encodeURIComponent(id)}${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}`;

  function makeImg(id, alt, rk) {
    const img = new Image();
    img.loading = 'lazy';
    img.alt = alt || '';
    img.referrerPolicy = 'no-referrer';

    // Try #1: standard viewer (supports resourcekey)
    img.src = urlWithRK('https://drive.google.com/uc?export=view', id, rk);
    img.dataset.step = '1';

    img.onerror = () => {
      const step = Number(img.dataset.step || 1);
      if (step === 1) {
        // Try #2: thumbnail endpoint (big size) + resourcekey
        img.dataset.step = '2';
        img.src = urlWithRK('https://drive.google.com/thumbnail', id, rk, 'sz=w2000');
      } else if (step === 2) {
        // Try #3: googleusercontent direct (no rk)
        img.dataset.step = '3';
        img.src = `https://lh3.googleusercontent.com/d/${id}=w2000`;
      } else {
        // Give up: link fallback
        const a = document.createElement('a');
        a.href = `https://drive.google.com/file/d/${id}/view${rk ? `?resourcekey=${encodeURIComponent(rk)}` : ''}`;
        a.target = '_blank';
        a.textContent = alt || 'View file';
        img.replaceWith(a);
      }
    };
    return img;
  }

  try {
    const res = await fetch('files.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('files.json missing');
    let files = await res.json();

    // Filter to image-like names (skip PDFs, videos, etc.)
    files = (Array.isArray(files) ? files : []).filter(f => isImageName(f.name || ''));

    if (!files.length) {
      status.textContent = 'No images found (check file sharing and types).';
      return;
    }

    gallery.innerHTML = files.map(f => {
      const safe = (f.name || '').replace(/"/g, '&quot;');
      return `<figure class="item" title="${safe}"></figure>`;
    }).join('');

    const figs = gallery.querySelectorAll('figure.item');
    files.forEach((f, i) => {
      const fig = figs[i];
      const img = makeImg(f.id, f.name || '', f.rk || '');
      fig.appendChild(img);
    });

    status.hidden = true;
    gallery.hidden = false;
  } catch (e) {
    console.error(e);
    status.textContent = 'Error loading gallery.';
  }
})();
