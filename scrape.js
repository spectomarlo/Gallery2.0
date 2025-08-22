// Scrapes a public Google Drive folder page (no API) and writes files.json
// Usage: node scrape.js "<public-folder-url>"
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const FOLDER_URL = process.argv[2];
if (!FOLDER_URL || !/drive\.google\.com\/drive\/folders\//.test(FOLDER_URL)) {
  console.error('Provide the public folder URL as the first argument.');
  process.exit(1);
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true, // v22 expects boolean
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);

  await page.goto(FOLDER_URL, { waitUntil: 'networkidle2' });

  // Infinite scroll to load all items
  const seen = new Set();
  let stableRounds = 0;
  for (let i = 0; i < 80; i++) {
    const ids = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/file/d/"]'));
      return anchors.map(a => {
        const m = a.href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        const name = a.getAttribute('aria-label') || a.title || '';
        return m ? { id: m[1], name } : null;
      }).filter(Boolean);
    });

    ids.forEach(x => seen.add(JSON.stringify(x)));

    const before = seen.size;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1800); // was page.waitForTimeout

    if (seen.size === before) {
      stableRounds++;
      if (stableRounds >= 3) break; // likely reached the end
    } else {
      stableRounds = 0;
    }
  }

  await browser.close();

  const files = Array.from(seen).map(s => JSON.parse(s));
  files.sort((a,b)=> (a.name||'').localeCompare((b.name||''), undefined, {numeric:true, sensitivity:'base'}));

  fs.writeFileSync(path.join(process.cwd(), 'files.json'), JSON.stringify(files, null, 2));
  console.log(`Wrote files.json with ${files.length} items`);
})();
