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
  } catch (e) {
    console.error('No tiles found in the embedded view.');
  }

  // Scroll to load all tiles
  let stable = 0, lastCount = 0;
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(900);
    const count = await page.evaluate(() => document.querySelectorAll('a[href*="/file/d/"], img[src*="thumbnail?id="]').length);
    if (count === lastCount) {
      stable++;
      if (stable >= 4) break;
    } else {
      stable = 0;
      lastCount = count;
    }
  }

  // Extract file IDs + names
  const items = await page.evaluate(() => {
    const map = new Map();

    // Anchors to files
    document.querySelectorAll('a[href*="/file/d/"]').forEach(a => {
      const m = a.href.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
      if (m) {
        const id = m[1];
        const name = a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent.trim() || '';
        map.set(id, { id, name });
      }
    });

    // Thumbnails that carry ?id=FILEID
    document.querySelectorAll('img[src*="thumbnail?id="]').forEach(img => {
      const m = img.src.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
      if (m) {
        const id = m[1];
        const name = img.getAttribute('alt') || '';
        if (!map.has(id)) map.set(id, { id, name });
      }
    });

    return Array.from(map.values());
  });

  // Debug artifacts (optional)
  fs.writeFileSync('debug.html', await page.content());
  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });

  await browser.close();

  items.sort((a,b) => (a.name||'').localeCompare(b.name||'', undefined, { numeric: true, sensitivity: 'base' }));
  fs.writeFileSync(path.join(process.cwd(), 'files.json'), JSON.stringify(items, null, 2));
  console.log(`Wrote files.json with ${items.length} items from ${EMBED_URL}`);
})();
