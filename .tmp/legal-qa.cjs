const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/980027131/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const files = ['privacidad.html','terminos.html','eliminacion-datos.html'];
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.' + new URL(req.url,'http://localhost').pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404).end();return;}
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=process.env.LEGAL_QA_ORIGIN || `http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    for(const colorScheme of ['light','dark']) for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const context=await browser.newContext({viewport,colorScheme,deviceScaleFactor:1});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
      for(const file of files){
        const response=await page.goto(base+'/'+file,{waitUntil:'networkidle'});
        assert.equal(response.status(),200);assert.equal(page.url(),base+'/'+file);
        assert.match(await page.locator('main').innerText(),/dr.sandokan@cognicionlabs.com/);
        assert.equal(await page.locator('script').count(),0);
        assert.equal(await page.locator('nav a').count(),4);
        assert.equal(await page.locator('h1').count(),1);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(__dirname,`legal-${process.env.LEGAL_QA_ORIGIN?'public':'local'}-${file}-${colorScheme}-${viewport.width}.png`)});
        console.log(JSON.stringify({file,colorScheme,width:viewport.width,status:response.status(),errors:errors.length}));
      }
      await context.close();
    }
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e.message);server.close();process.exitCode=1;});
