// Grouped-by-color masonry (no crop). Reads color buckets from files.json (generated in the workflow).
(async () => {
  const status  = document.getElementById('status');
  const gallery = document.getElementById('gallery');

  const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
  const ORDER = ['Red','Orange','Yellow','Green','Cyan','Blue','Purple','Magenta','Brown','Grayscale','Other'];
  const FALLBACK_SWATCH = {
    Red:'#e74c3c', Orange:'#e67e22', Yellow:'#f1c40f', Green:'#2ecc71',
    Cyan:'#1abc9c', Blue:'#3498db', Purple:'#8e44ad', Magenta:'#d252c4',
    Brown:'#8e5b3a', Grayscale:'#bdbdbd', Other:'#95a5a6'
  };

  const withRK = (base, id, rk, extra='') =>
    `${base}${base.includes('?') ? '&' : '?'}${extra ? extra + '&' : ''}id=${encodeURIComponent(id)}${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}`;
  const thumbUrl = (id, rk, w=600) => withRK('https://drive.google.com/thumbnail', id, rk, `sz=w${w}`);
  const viewUrl  = (id, rk)        => withRK('https://drive.google.com/uc?export=view', id, rk);
  const gucUrl   = (id, w=2000)    => `https://lh3.googleusercontent.com/d/${id}=w${w}`;

  function buildItemHTML(f) {
    const safe = (f.name || '').replace(/"/g,'&quot;');
    const rk = f.rk || '';
    return `
      <figure class="item" title="${safe}">
        <a href="${viewUrl(f.id, rk)}">
          <img loading="lazy" decoding="async" referrerpolicy="no-referrer"
               src="${thumbUrl(f.id, rk, 400)}"
               srcset="${thumbUrl(f.id, rk, 300)} 300w, ${thumbUrl(f.id, rk, 400)} 400w, ${thumbUrl(f.id, rk, 800)} 800w"
               sizes="(min-width:1200px) 6.7vw, (min-width:900px) 8.3vw, (min-width:640px) 11.1vw, (min-width:360px) 16.7vw, 33vw"
               alt="${safe}"
               onerror="this.onerror=null; this.removeAttribute('srcset'); this.removeAttribute('sizes'); this.src='${gucUrl(f.id, 1200)}';"
          >
        </a>
      </figure>`;
  }

  function buildGroupSection(bucket, list) {
    const sw = list[0]?.hex || FALLBACK_SWATCH[bucket] || '#bbb';
    return `
      <section class="group">
        <div class="chip"><span class="swatch" style="background:${sw}"></span>${bucket}</div>
        <div class="masonry">
          ${list.map(buildItemHTML).join('')}
        </div>
      </section>`;
  }

  try {
    // Cache-bust files.json to avoid “run twice”
    const res = await fetch('files.json?' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('files.json missing');
    let data = await res.json();

    // Filter to image files only
    data = (Array.isArray(data) ? data : []).filter(f => IMG_EXT_RE.test(f.name || ''));

    if (!data.length) {
      status.textContent = 'No images found (check sharing and file types).';
      return;
    }

    // Group by bucket (fallback "Other")
    const groups = new Map();
    for (const f of data) {
      const b = f.bucket || 'Other';
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b).push(f);
    }

    // Stable order by rainbow
    const orderedBuckets = ORDER.filter(b => groups.has(b));
    const html = orderedBuckets.map(b => buildGroupSection(b, groups.get(b))).join('');
    gallery.innerHTML = html;

    status.hidden = true;
    // no hidden class, because we replace #gallery content directly
  } catch (e) {
    console.error(e);
    status.textContent = 'Error loading gallery.';
  }
})();
