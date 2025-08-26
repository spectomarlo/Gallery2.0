// Three modes with per-mode Size slider (10–2000px) + River speed. No crop. Search + Shuffle.
(async () => {
  const stage      = document.getElementById('stage');
  const statusEl   = document.getElementById('status');
  const toTop      = document.getElementById('toTop');

  const qInput     = document.getElementById('q');
  const shuffleBtn = document.getElementById('shuffle');

  const btnMasonry = document.getElementById('masonryMode');
  const btnRiver   = document.getElementById('riverMode');
  const btnSlide   = document.getElementById('slideshowMode');

  const sizeCtrls  = document.getElementById('sizeCtrls');
  const sizeRange  = document.getElementById('size');
  const sizeVal    = document.getElementById('sizeVal');

  const speedCtrls = document.getElementById('speedCtrls');
  const speedRange = document.getElementById('speed');
  const speedVal   = document.getElementById('speedVal');

  const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

  const withRK = (base, id, rk, extra='') =>
    `${base}${base.includes('?') ? '&' : '?'}${extra ? extra + '&' : ''}id=${encodeURIComponent(id)}${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}`;
  const thumbUrl = (id, rk, w=600) => withRK('https://drive.google.com/thumbnail', id, rk, `sz=w${w}`);
  const viewUrl  = (id, rk)        => withRK('https://drive.google.com/uc?export=view', id, rk);
  const gucUrl   = (id, w=2000)    => `https://lh3.googleusercontent.com/d/${id}=w${w}`;

  // State
  let files = [];
  let view  = [];
  let mode  = localStorage.getItem('mode') || 'masonry';

  // Per-mode size values (px)
  const defaultSizes = { masonry: 200, river: 160, slideshow: 1200 };
  const sizeValues = {
    masonry: +localStorage.getItem('size_masonry') || defaultSizes.masonry,
    river: +localStorage.getItem('size_river') || defaultSizes.river,
    slideshow: +localStorage.getItem('size_slideshow') || defaultSizes.slideshow
  };

  // Helpers
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const updateSizeUI = () => {
    const val = Math.max(10, Math.min(2000, sizeValues[mode] || defaultSizes[mode]));
    sizeRange.value = String(val);
    sizeVal.textContent = `${val}px`;
    speedCtrls.classList.toggle('hidden', mode !== 'river');
  };

  const setActiveModeBtn = () => {
    [btnMasonry, btnRiver, btnSlide].forEach(b => b.classList.remove('active'));
    ({ masonry: btnMasonry, river: btnRiver, slideshow: btnSlide }[mode] || btnMasonry).classList.add('active');
    updateSizeUI();
  };

  /* ---------- Masonry ---------- */
  function buildMasonry() {
    const tileW = Math.max(10, Math.min(2000, sizeValues.masonry));
    const container = document.createElement('div');
    container.className = 'masonry';
    container.style.setProperty('--tileW', tileW + 'px'); // column-width

    container.innerHTML = view.map((f,i) =>
      `<figure class="item" data-index="${i}" data-id="${f.id}" data-rk="${f.rk || ''}" title="${(f.name||'').replace(/"/g,'&quot;')}"></figure>`
    ).join('');

    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const fig = entry.target; obs.unobserve(fig);
        fig.classList.add('reveal');
        const idx = +fig.dataset.index;
        const it  = view[idx];

        const a = document.createElement('a'); a.href = viewUrl(it.id, it.rk || '');
        const img = new Image();
        img.loading='lazy'; img.decoding='async'; img.fetchPriority='low'; img.referrerPolicy='no-referrer';
        img.alt = it.name || '';

        const w1=Math.max(100, Math.round(tileW*0.75));
        const w2=Math.max(140, tileW);
        const w3=Math.max(220, Math.round(tileW*1.5));
        img.src = thumbUrl(it.id, it.rk, w2);
        img.srcset = `${thumbUrl(it.id,it.rk,w1)} ${w1}w, ${thumbUrl(it.id,it.rk,w2)} ${w2}w, ${thumbUrl(it.id,it.rk,w3)} ${w3}w`;
        img.sizes = `${w2}px`;

        img.onerror = () => {
          if (img.dataset.fail === '1') { img.src = gucUrl(it.id, Math.max(800, w3)); img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
          else if (img.dataset.fail === '2') { img.src = viewUrl(it.id, it.rk || ''); }
          else { img.dataset.fail = String((Number(img.dataset.fail||0)+1)); img.src = thumbUrl(it.id,it.rk,w1); }
        };

        a.appendChild(img);
        fig.appendChild(a);
      }
    }, { root:null, rootMargin:'600px 0px', threshold:0.01 });

    container.querySelectorAll('figure.item').forEach(fig => obs.observe(fig));
    return container;
  }

  /* ---------- River ---------- */
  function buildRivers() {
    const laneH = Math.max(10, Math.min(2000, sizeValues.river));
    const DUR   = parseInt(speedRange.value || '80', 10); // seconds

    const laneCount = (() => {
      const w = window.innerWidth;
      if (w < 500) return 3;
      if (w < 900) return 4;
      if (w < 1400) return 5;
      return 6;
    })();

    const wrap = document.createElement('div');
    wrap.className = 'rivers';

    for (let i = 0; i < laneCount; i++) {
      const lane = document.createElement('section');
      lane.className = 'lane' + (i % 2 ? ' rev' : '');
      lane.style.setProperty('--lane-h', laneH + 'px');
      lane.style.setProperty('--dur', (DUR + (i%2?10:-10)) + 's'); // subtle parallax

      const track = document.createElement('div'); track.className = 'track';
      const content = document.createElement('div'); content.className = 'content';

      for (let j = i; j < view.length; j += laneCount) {
        const f = view[j];
        const a = document.createElement('a'); a.href = viewUrl(f.id, f.rk || '');
        const img = new Image();
        img.loading='lazy'; img.decoding='async'; img.fetchPriority='low'; img.referrerPolicy='no-referrer';
        img.alt = f.name || '';

        const w1=Math.max(200, Math.round(laneH*2.2));
        const w2=Math.max(300, Math.round(laneH*3.2));
        const w3=Math.max(400, Math.round(laneH*4.2));
        img.src = thumbUrl(f.id, f.rk, w2);
        img.srcset = `${thumbUrl(f.id,f.rk,w1)} ${w1}w, ${thumbUrl(f.id,f.rk,w2)} ${w2}w, ${thumbUrl(f.id,f.rk,w3)} ${w3}w`;
        img.sizes = Math.ceil((w2 / window.innerWidth) * 100) + 'vw';

        img.onerror = () => {
          if (img.dataset.fail === '1') { img.src = gucUrl(f.id, Math.max(1200, w3)); img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
          else if (img.dataset.fail === '2') { img.src = viewUrl(f.id, f.rk || ''); }
          else { img.dataset.fail = String((Number(img.dataset.fail||0)+1)); img.src = thumbUrl(f.id,f.rk,w1); }
        };

        a.appendChild(img);
        content.appendChild(a);
      }

      // duplicate for seamless loop
      track.appendChild(content);
      track.appendChild(content.cloneNode(true));
      lane.appendChild(track);
      wrap.appendChild(lane);
    }
    return wrap;
  }

  /* ---------- Slideshow ---------- */
  function buildSlideshow() {
    let idx = 0;
    let timer = 0;
    const STEP_MS = 4000;

    const wrap = document.createElement('div');
    wrap.className = 'slideshow';
    wrap.style.setProperty('--slide-max', Math.max(10, Math.min(2000, sizeValues.slideshow)) + 'px');

    const caption = document.createElement('div'); caption.className = 'caption';
    const img = new Image(); img.className = 'slide-img'; img.alt='';

    function show(i) {
      idx = (i + view.length) % view.length;
      const it = view[idx];
      caption.textContent = it.name || '';
      img.src = ''; img.removeAttribute('srcset'); img.removeAttribute('sizes');
      const try1 = gucUrl(it.id, Math.max(1200, sizeValues.slideshow * 1.5));
      const try2 = viewUrl(it.id, it.rk || '');
      img.onerror = () => { if (img.src !== try2) img.src = try2; };
      img.src = try1;
    }

    const controls = document.createElement('div');
    controls.className = 'ss-controls';
    const btnPrev = Object.assign(document.createElement('button'), { className:'ss-btn', textContent:'‹ Prev' });
    const btnPlay = Object.assign(document.createElement('button'), { className:'ss-btn', textContent:'Pause' });
    const btnNext = Object.assign(document.createElement('button'), { className:'ss-btn', textContent:'Next ›' });

    function play() { stop(); timer = setInterval(() => show(idx+1), STEP_MS); btnPlay.textContent='Pause'; }
    function stop() { if (timer) clearInterval(timer); timer = 0; btnPlay.textContent='Play'; }

    btnPrev.onclick = () => { show(idx-1); if (timer) { stop(); play(); } };
    btnNext.onclick = () => { show(idx+1); if (timer) { stop(); play(); } };
    btnPlay.onclick = () => { timer ? stop() : play(); };

    window.addEventListener('keydown', (e) => {
      if (mode !== 'slideshow') return;
      if (e.key === 'ArrowRight') btnNext.click();
      if (e.key === 'ArrowLeft') btnPrev.click();
      if (e.key === ' ') { e.preventDefault(); btnPlay.click(); }
    });

    controls.append(btnPrev, btnPlay, btnNext);
    wrap.append(caption, img, controls);

    show(idx);
    play();

    return wrap;
  }

  /* ---------- Mode switch ---------- */
  function render() {
    stage.innerHTML = '';
    setActiveModeBtn();
    statusEl.hidden = true;

    if (mode === 'masonry') stage.appendChild(buildMasonry());
    else if (mode === 'river') stage.appendChild(buildRivers());
    else stage.appendChild(buildSlideshow());
  }

  // Mode buttons
  btnMasonry.onclick = () => { mode='masonry'; localStorage.setItem('mode',mode); updateSizeUI(); render(); };
  btnRiver.onclick   = () => { mode='river';   localStorage.setItem('mode',mode); updateSizeUI(); render(); };
  btnSlide.onclick   = () => { mode='slideshow'; localStorage.setItem('mode',mode); updateSizeUI(); render(); };

  // Size slider (per-mode values)
  sizeRange.addEventListener('input', () => {
    const v = Math.max(10, Math.min(2000, +sizeRange.value || 10));
    sizeValues[mode] = v;
    localStorage.setItem(`size_${mode}`, String(v));
    sizeVal.textContent = `${v}px`;
    render();
  });

  // River speed slider (river-only)
  speedRange.addEventListener('input', () => {
    const v = Math.max(40, Math.min(200, +speedRange.value || 80));
    speedVal.textContent = `${v}s`;
    if (mode === 'river') render();
  });

  // Search & Shuffle
  qInput.addEventListener('input', () => {
    const t = (qInput.value||'').trim().toLowerCase();
    view = !t ? files.slice() : files.filter(f => (f.name||'').toLowerCase().includes(t));
    render();
  });
  shuffleBtn.addEventListener('click', () => { view = (view.length ? view : files).slice().sort(() => Math.random() - 0.5); render(); });

  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---------- Boot ---------- */
  try {
    const res = await fetch('files.json?' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('files.json missing');
    const data = await res.json();
    files = (Array.isArray(data) ? data : []).filter(f => IMG_EXT_RE.test(f.name || ''));
    view = files.slice();

    if (!view.length) { statusEl.textContent = 'No images found.'; return; }

    // Initialize sliders UI
    speedVal.textContent = `${speedRange.value}s`;
    updateSizeUI();

    render();
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Error loading gallery.';
  }
})();
