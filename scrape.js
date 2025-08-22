// Scrapes a PUBLIC Drive folder (no API) via the embedded folder view and writes files.json
// Usage in workflow: node scrape.js "$DRIVE_FOLDER_URL"   (can be full URL or just the ID)

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

function normalizeFolderId(input) {
  if (!input) return '';
  const m = String(input).match(/(?:folders\/|id=)([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : String(input);
}
const arg = process.argv[2] || '';
const FOLDER_ID = normalizeFolderId(arg);

if (!FOLDER_ID) {
  console.error('Provide the public folder URL or raw folder ID as the first argument.');
  process.exit(1);
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);

  // Use the embedded folder viewer (stable markup)
  const EMBED_URL = `https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}#grid`;
  await page.goto(EMBED_URL, { waitUntil: 'networkidle2' });

  // Scroll a few times to ensure all tiles render
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(800);
  }

  // Collect IDs from thumbnail URLs and anchors
  const items = await page.evaluate(() => {
    const unique = new Map();

    // Thumbnails like https://drive.google.com/thumbnail?id=FILEID&...
    document.querySelectorAll('img[src*="thumbnail?id="]').forEach(img => {
      const m = img.src.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
      if (m) {
        const id = m[1];
        const name = img.getAttribute('alt') || '';
        unique.set(id, { id, name });
      }
    });

    // Fallback: anchors to /file/d/FILEID/
    document.querySelectorAll('a[href*="/file/d/"]').forEach(a => {
      const m = a.href.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
      if (m) {
        const id = m[1];
        const name = a.getAttribute('title') || a.getAttribute('aria-label') || '';
        if (!unique.has(id)) unique.set(id, { id, name });
      }
    });

    return Array.from(unique.values());
  });

  await browser.close();

  // Basic sort by name (created time not available from this view)
  items.sort((a,b) => (a.name||'').localeCompare(b.name||'', undefined, {numeric:true, sensitivity:'base'}));

  fs.writeFileSync(path.join(process.cwd(), 'files.json'), JSON.stringify(items, null, 2));
  console.log(`Wrote files.json with ${items.length} items from ${EMBED_URL}`);
})();
