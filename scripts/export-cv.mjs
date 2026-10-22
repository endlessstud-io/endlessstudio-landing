import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const output = resolve(root, 'artifacts/javier-abia-cv.pdf');
const expectedPages = 3;
if (!existsSync(resolve(dist, 'cv/index.html'))) {
  throw new Error('Build the site first, or run npm run cv:pdf.');
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(dist, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
    if (!path.startsWith(`${dist}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', accept);
});

let browser;
try {
  const launch = process.env.CV_CHROME_PATH
    ? { executablePath: process.env.CV_CHROME_PATH }
    : existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' };
  try {
    browser = await chromium.launch({ ...launch, headless: true });
  } catch (cause) {
    throw new Error('PDF export needs Chromium or Google Chrome. Run npx playwright install chromium, or set CV_CHROME_PATH to a Chrome executable.', { cause });
  }
  const page = await browser.newPage({ viewport: { width: 1200, height: 1300 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/cv/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });
  if (errors.length) throw new Error(errors.join('\n'));

  await page.emulateMedia({ media: 'print' });
  const sheets = await page.locator('.cv-sheet').evaluateAll((elements) => elements.map((element) => ({
    height: element.getBoundingClientRect().height,
    width: element.getBoundingClientRect().width,
    overflow: element.scrollWidth > element.clientWidth,
  })));
  if (sheets.length !== expectedPages || sheets.some((sheet) => sheet.height > 1123 || sheet.width > 794 || sheet.overflow)) {
    throw new Error(`The CV no longer fits ${expectedPages} A4 pages. Shorten the copy or adjust src/styles/cv.css. Measurements: ${JSON.stringify(sheets)}`);
  }

  const pdf = await page.pdf({
    format: 'A4', preferCSSPageSize: true, printBackground: true,
    displayHeaderFooter: false, tagged: true, outline: true,
  });
  // Chromium writes uncompressed page dictionaries; exclude the /Pages tree.
  const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (pageCount !== expectedPages) throw new Error(`Expected ${expectedPages} PDF pages, got ${pageCount}. Check the print layout.`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, pdf);

  await page.emulateMedia({ media: 'screen' });
  for (const [index, sheet] of (await page.locator('.cv-sheet').all()).entries()) {
    await sheet.screenshot({ path: resolve(root, `artifacts/cv-page-${index + 1}.png`) });
  }
  console.log(`Saved ${output} (${pageCount} A4 pages, selectable text, embedded fonts).`);
} finally {
  await browser?.close();
  await new Promise((accept) => server.close(accept));
}
