// Scrape a PUBLIC Google Drive folder (no API) via the embedded view.
// Also compute average/dominant color (server-side) and assign a color bucket.
// Usage: node scrape.js "$DRIVE_FOLDER_URL_OR_ID"

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

function normalizeFolderId(input) {
  if (!input) return '';
  const s = String(input);
  const m = s.match(/(?:folders\/|id=)([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : s;
}
const arg = process.argv[2] || '';
const FOLDER_ID = normalizeFolderId(arg);
if (!FOLDER_ID) {
  console.error('Provide the public folder URL or raw folder ID as the first argument.');
  process.exit(1);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const embedUrl = (id) => `https://drive.google.com/embeddedfolderview?id=${id}#grid`;
const thumbUrl = (id, rk, w=400) =>
  `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}&sz=w${w}`;

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 2200 });
  page.setDefaultNavigationTimeout(120000);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  const EMBED_URL = embedUrl(FOLDER_ID);
  await page.goto(EMBED_URL, { waitUntil: 'networkidle2' });

  try { await page.waitForSelector('a[href*="/file/d/"], img[src*="thumbnail?id="]', { timeout: 60000 }); } catch {}

  // Scroll until both height and tile count stabilize
  let stableRounds = 0, lastCount = 0, lastHeight = 0;
  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1100);
    const { count, height } = await page.evaluate(() => ({
      count: document.querySelectorAll('a[href*="/file/d/"], img[src*="thumbnail?id="]').length,
      height: document.body.scrollHeight
    }));
    if (count === lastCount && height === lastHeight) {
      if (++stableRounds >= 5) break;
    } else {
      stableRounds = 0; lastCount = count; lastHeight = height;
    }
  }

  // Extract id/name/resourcekey
  const items = await page.evaluate(() => {
    const map = new Map();
    const put = (id, name, rk) => {
      const key = `${id}:${rk || ''}`;
      if (!map.has(key)) map.set(key, { id, name: name || '', rk: rk || '' });
    };
    document.querySelectorAll('a[href*="/file/d/"]').forEach(a => {
      const href = a.href;
      const m = href.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
      if (!m) return;
      let rk = '';
      try { rk = new URL(href).searchParams.get('resourcekey') || a.getAttribute('data-resource-key') || ''; } catch {}
      const name = a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent.trim() || '';
      put(m[1], name, rk);
    });
    document.querySelectorAll('img[src*="thumbnail?id="]').forEach(img => {
      let id = '', rk = '';
      try {
        const u = new URL(img.src);
        id = u.searchParams.get('id') || '';
        rk = u.searchParams.get('resourcekey') || img.getAttribute('data-resource-key') || '';
      } catch {}
      if (id) {
        const name = img.getAttribute('alt') || '';
        put(id, name, rk);
      }
    });
    return Array.from(map.values());
  });

  // Save debug artifacts
  fs.writeFileSync('debug.html', await page.content());
  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
  await browser.close();

  // Helper: RGB -> HSL
  const rgbToHsl = (r, g, b) => {
    r/=255; g/=255; b/=255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d/(2 - max - min) : d/(max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s, l };
  };

  // Bucket by hue with grayscale/brown heuristics
  const bucketOf = ({h, s, l}) => {
    if (isNaN(h)) h = 0;
    if (s < 0.12 || l < 0.08 || l > 0.92) return 'Grayscale';
    // Brown: dark oranges
    if (h >= 15 && h < 45 && l < 0.55) return 'Brown';
    if (h >= 345 || h < 15) return 'Red';
    if (h >= 15 && h < 45) return 'Orange';
    if (h >= 45 && h < 70) return 'Yellow';
    if (h >= 70 && h < 165) return 'Green';
    if (h >= 165 && h < 195) return 'Cyan';
    if (h >= 195 && h < 255) return 'Blue';
    if (h >= 255 && h < 285) return 'Purple';
    if (h >= 285 && h < 345) return 'Magenta';
    return 'Other';
  };

  // Fetch a thumbnail and compute average color using sharp (fast & reliable)
  async function analyzeColor(id, rk) {
    const url = thumbUrl(id, rk, 400);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`thumb fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Resize to 1x1 = average color of the image region
    let out = await sharp(buf).resize(1,1,{fit:'cover'}).removeAlpha().raw().toBuffer();
    // Some images might keep alpha; handle 4-channel
    if (out.length >= 3) {
      const r = out[0], g = out[1], b = out[2];
      const {h, s, l} = rgbToHsl(r,g,b);
      const hex = '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
      const bucket = bucketOf({h,s,l});
      return { hex, h, s, l, bucket };
    }
    return { hex: '#888888', h: 0, s: 0, l: 0.5, bucket: 'Grayscale' };
  }

  // Concurrency helper
  async function mapLimit(arr, limit, fn) {
    const ret = [];
    let i = 0;
    const workers = Array.from({length: limit}).map(async () => {
      while (i < arr.length) {
        const idx = i++;
        try { ret[idx] = await fn(arr[idx], idx); }
        catch(e){ ret[idx] = {...arr[idx], error: String(e)}; }
      }
    });
    await Promise.all(workers);
    return ret;
  }

  const withColor = await mapLimit(items, 6, async (it) => {
    try {
      const color = await analyzeColor(it.id, it.rk || '');
      return { ...it, ...color };
    } catch {
      return { ...it, hex: '#888888', h: 0, s: 0, l: 0.5, bucket: 'Grayscale' };
    }
  });

  // Stable ordering by bucket then name
  const order = ['Red','Orange','Yellow','Green','Cyan','Blue','Purple','Magenta','Brown','Grayscale','Other'];
  withColor.sort((a,b) => {
    const ai = order.indexOf(a.bucket), bi = order.indexOf(b.bucket);
    const ca = ai < 0 ? 999 : ai, cb = bi < 0 ? 999 : bi;
    if (ca !== cb) return ca - cb;
    return (a.name||'').localeCompare(b.name||'', undefined, {numeric:true, sensitivity:'base'});
  });

  fs.writeFileSync('files.json', JSON.stringify(withColor, null, 2));
  console.log(`Wrote files.json with ${withColor.length} items from ${EMBED_URL}`);
})();
