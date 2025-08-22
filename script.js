(async () => {
  const status = document.getElementById('status');
  const gallery = document.getElementById('gallery');

  function makeImg(id, alt) {
    const img = new Image();
    img.loading = 'lazy';
    img.alt = alt || '';
    img.referrerPolicy = 'no-referrer';
    // try 1: standard view URL
    img.src = `https://drive.google.com/uc?export=view&id=${id}`;
    img.dataset.step = '1';
    img.onerror = () => {
      const step = Number(img.dataset.step || 1);
      if (step === 1) {
        // try 2: thumbnail endpoint (request large size)
        img.dataset.step = '2';
        img.src = `https://drive.google.com/thumbnail?id=${id}&sz=w2000`;
      } else if (step === 2) {
        // try 3: direct googleusercontent endpoint
        img.dataset.step = '3';
        img.src = `https://lh3.googleusercontent.com/d/${id}=w2000`;
      } else {
        // give up on this image
        img.onerror = null;
        img.alt = (alt || '') + ' (unavailable)';
        img.style.opacity = '0.3';
      }
    };
    return img;
  }

  try {
    const res = await fetch('files.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('files.json missing');
    const files = await res.json();

    if (!Array.isArray(files) || !files.length) {
      status.textContent = 'No images found yet.';
      return;
    }

    const html = files.map(f => {
      const safe = (f.name || '').replace(/"/g, '&quot;');
      return `<figure class="item" title="${safe}"></figure>`;
    }).join('');

    gallery.innerHTML = html;

    // attach images with fallback
    const figs = gallery.querySelectorAll('figure.item');
    files.forEach((f, i) => {
      const fig = figs[i];
      const img = makeImg(f.id, f.name || '');
      fig.appendChild(img);
    });

    status.hidden = true;
    gallery.hidden = false;
  } catch (e) {
    console.error(e);
    status.textContent = 'Error loading gallery.';
  }
})();
