const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  console.log("Page loaded");
  
  // click button
  await page.click('#btnImport');
  console.log("Button clicked");
  
  // check modal class
  const modalClass = await page.$eval('#importModal', el => el.className);
  console.log("Modal class:", modalClass);
  
  await page.click('#btnModalUploadPDF');
  console.log("PDF button clicked");
  
  await browser.close();
})();
