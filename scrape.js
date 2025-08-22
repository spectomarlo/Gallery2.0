// Scrape a PUBLIC Google Drive folder (no API) via the embedded view and write files.json
// Usage in workflow: node scrape.js "$DRIVE_FOLDER_URL_OR_ID"
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

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

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  const EMBED_URL = `https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}#grid`;
  await page.goto(EMBED_URL, { waitUntil: 'networkidle2' });

  // Wait until any tile appears
  try {
    await page.waitForSelector('a[href*="/file/d/"], img[src*="thumbnail?id="]', { timeout: 60000 });
  } catch {}

  // Scroll to load everything
  let stable = 0, lastCount = 0;
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(900);
    const count = await page.evaluate(() =>
      document.querySelectorAll('a[href*="/file/d/"], img[src*="thumbnail?id="]').length
    );
    if (count === lastCount) { if (++stable >= 4) break; } else { stable = 0; lastCount = count; }
  }

  // Extract: id, name, resourcekey (rk)
  const items = await page.evaluate(() => {
    const map = new Map();

    const put = (id, name, rk) => {
      const key = `${id}:${rk || ''}`;
      if (!map.has(key)) map.set(key, { id, name: name || '', rk: rk || '' });
    };

    // Anchors like .../file/d/ID/view?resourcekey=0-XXXX
    document.querySelectorAll('a[href*="/file/d/"]').forEach(a => {
      const href = a.href;
      const m = href.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
      if (!m) return;
      let rk = '';
      try { rk = new URL(href).searchParams.get('resourcekey') || a.getAttribute('data-resource-key') || ''; } catch {}
      const name = a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent.trim() || '';
      put(m[1], name, rk);
    });

    // Thumbnails like .../thumbnail?id=ID&resourcekey=0-XXXX
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

  // Optional debug artifacts
  fs.writeFileSync('debug.html', await page.content());
  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });

  await browser.close();

  items.sort((a,b) => (a.name||'').localeCompare(b.name||'', undefined, { numeric: true, sensitivity: 'base' }));
  fs.writeFileSync(path.join(process.cwd(), 'files.json'), JSON.stringify(items, null, 2));
  console.log(`Wrote files.json with ${items.length} items from ${EMBED_URL}`);
})();

