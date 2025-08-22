(async () => {
  const status = document.getElementById('status');
  const gallery = document.getElementById('gallery');

  function makeImg(id, alt) {
    const img = new Image();
    img.loading = 'lazy';
    img.alt = alt || '';
    img.referrerPolicy = 'no-referrer';

    // Try #1: standard viewer
    img.src = `https://drive.google.com/uc?export=view&id=${id}`;
    img.dataset.step = '1';

    img.onerror = () => {
      const step = Number(img.dataset.step || 1);
      if (step === 1) {
        // Try #2: thumbnail endpoint (large size)
        img.dataset.step = '2';
        img.src = `https://drive.google.com/thumbnail?id=${id}&sz=w2000`;
      } else if (step === 2) {
        // Try #3: googleusercontent direct (often works for public files)
        img.dataset.step = '3';
        img.src = `https://lh3.googleusercontent.com/d/${id}=w2000`;
      } else {
        // Give up: show a clickable filename instead of a broken image
        const a = document.createElement('a');
        a.href = `https://drive.google.com/file/d/${id}/view`;
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
    const files = await res.json();

    if (!Array.isArray(files) || !files.length) {
      status.textContent = 'No images found yet.';
      return;
    }

    // Build shells first, then attach imgs
    gallery.innerHTML = files.map(f => {
      const safe = (f.name || '').replace(/"/g, '&quot;');
      return `<figure class="item" title="${safe}"></figure>`;
    }).join('');

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
