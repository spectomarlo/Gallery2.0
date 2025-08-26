// Auto-scrolling "river" layout (alternating directions), ~1.25x bigger tiles, no crop.
(async () => {
  const status  = document.getElementById('status');
  const rivers  = document.getElementById('rivers');

  /* ====== TWEAKS ====== */
  const SCALE = 1.25;          // <- 1.x bigger. Try 1.10 (a bit bigger) or 1.40 (much bigger)
  const BASE_LANE_H = 140;     // px. Final lane height = BASE_LANE_H * SCALE.
  const MIN_LANES = 3, MAX_LANES = 6; // lanes by viewport width (computed below)
  const SPEED_RANGE = [55, 110]; // seconds per cycle (randomized per lane)
  const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
  /* ===================== */

  const withRK = (base, id, rk, extra='') =>
    `${base}${base.includes('?') ? '&' : '?'}${extra ? extra + '&' : ''}id=${encodeURIComponent(id)}${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}`;

  const thumbUrl = (id, rk, w=600) => withRK('https://drive.google.com/thumbnail', id, rk, `sz=w${w}`);
  const viewUrl  = (id, rk)        => withRK('https://drive.google.com/uc?export=view', id, rk);
  const gucUrl   = (id, w=2000)    => `https://lh3.googleusercontent.com/d/${id}=w${w}`;

  const laneHeight = Math.round(BASE_LANE_H * SCALE);
  const laneCount = (() => {
    const w = window.innerWidth;
    if (w < 500) return Math.max(MIN_LANES, 3);
    if (w < 900) return Math.min(MAX_LANES, 4);
    if (w < 1400) return Math.min(MAX_LANES, 5);
    return MAX_LANES;
  })();

  // Build one <a><img></a> for a file
  function makeTile(f, desiredW = 800) {
    const a = document.createElement('a');
    a.href = viewUrl(f.id, f.rk || '');

    const img = new Image();
    img.loading = 'lazy';
    img.decoding = 'async';
    img.fetchPriority = 'low';
    img.referrerPolicy = 'no-referrer';
    img.alt = f.name || '';

    // Responsive thumbs – lane height is fixed; width varies by aspect ratio
    const w1 = Math.max(300, Math.round(desiredW * 0.5));
    const w2 = Math.max(500, desiredW);
    const w3 = Math.round(desiredW * 1.5);
    img.src = thumbUrl(f.id, f.rk, w2);
    img.srcset = [
      `${thumbUrl(f.id, f.rk, w1)} ${w1}w`,
      `${thumbUrl(f.id, f.rk, w2)} ${w2}w`,
      `${thumbUrl(f.id, f.rk, w3)} ${w3}w`
    ].join(', ');
    img.sizes = `${Math.ceil( (desiredW / window.innerWidth) * 100 )}vw`;

    img.onerror = () => {
      if (img.dataset.fail === '1') {
        img.src = gucUrl(f.id, 2000);
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
      } else if (img.dataset.fail === '2') {
        img.src = viewUrl(f.id, f.rk || '');
      } else {
        img.dataset.fail = String((Number(img.dataset.fail||0) + 1));
        img.src = thumbUrl(f.id, f.rk, w1);
      }
    };

    a.appendChild(img);
    return a;
  }

  function randBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Build the rivers
  function buildRivers(files) {
    rivers.innerHTML = '';
    document.documentElement.style.setProperty('--lane-h', laneHeight + 'px');

    // Make lanes
    const lanes = Array.from({ length: laneCount }, (_, i) => {
      const lane = document.createElement('section');
      lane.className = 'lane' + (i % 2 ? ' rev' : '');
      // Randomize speed per lane (parallax feel)
      const dur = randBetween(SPEED_RANGE[0], SPEED_RANGE[1]).toFixed(2) + 's';
      lane.style.setProperty('--dur', dur);

      const track = document.createElement('div');
      track.className = 'track';

      // Primary content
      const content = document.createElement('div');
      content.className = 'content';

      // Distribute images round-robin
      for (let j = i; j < files.length; j += laneCount) {
        content.appendChild( makeTile(files[j]) );
      }

      // Duplicate once for seamless loop
      const clone = content.cloneNode(true);

      track.appendChild(content);
      track.appendChild(clone);
      lane.appendChild(track);
      rivers.appendChild(lane);

      return lane;
    });

    status.hidden = true;
    rivers.hidden = false;
  }

  // Optionally rebuild on resize (debounced)
  let rAF = 0;
  const onResize = () => {
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(() => {
      // Soft refresh: just update sizes attribute of images (avoid full rebuild)
      document.querySelectorAll('.lane img').forEach(img => {
        const wAttr = img.getAttribute('srcset')?.split(' ')[1] || '600w';
        const approxW = parseInt(wAttr) || 600;
        img.sizes = `${Math.ceil( (approxW / window.innerWidth) * 100 )}vw`;
      });
    });
  };
  window.addEventListener('resize', onResize);

  try {
    const res = await fetch('files.json?' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('files.json missing');
    let files = await res.json();

    files = (Array.isArray(files) ? files : []).filter(f => IMG_EXT_RE.test(f.name || ''));
    if (!files.length) {
      status.textContent = 'No images found (check sharing and file types).';
      return;
    }

    buildRivers(files);
  } catch (e) {
    console.error(e);
    status.textContent = 'Error loading gallery.';
  }
})();
