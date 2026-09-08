import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import http from 'node:http';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {doc,setDoc}=require('firebase/firestore');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH);
test('isolated Chrome: real civil overlap query and WebChannel termination against emulator', {timeout:45000}, async()=>{
  assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^127\.0\.0\.1:\d+$/);
  const projectId='demo-agenda-browser',uid='synthetic-doctor';
  const env=await initializeTestEnvironment({projectId,firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated emulator QA</title>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  const failures=[],terminations=[];
  try {
    await env.withSecurityRulesDisabled(async c=>{
      const client=c.firestore();
      await setDoc(doc(client,`usuarios/${uid}`),{rol:'medico'});
      await setDoc(doc(client,`usuarios/${uid}/agenda/fixture`),{type:'event',startDate:'2030-01-08',endDate:'2030-01-08',title:'Ficticio'});
    });
    await context.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(u.hostname==='127.0.0.1'||(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/10.12.2/')))return route.continue();
      return route.abort('accessdenied');
    });
    const page=await context.newPage();
    page.on('requestfailed',r=>failures.push({terminate:new URL(r.url()).searchParams.get('TYPE')==='terminate',error:r.failure()?.errorText}));
    page.on('request',r=>{if(new URL(r.url()).searchParams.get('TYPE')==='terminate')terminations.push({method:r.method()});});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const result=await page.evaluate(async({projectId,uid,port})=>{
      const {initializeApp}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
      const f=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const db=f.getFirestore(initializeApp({projectId,apiKey:'emulator-only',appId:'emulator-only'}));
      f.connectFirestoreEmulator(db,'127.0.0.1',port,{mockUserToken:{sub:uid}});
      const q=f.query(f.collection(db,`usuarios/${uid}/agenda`),f.where('startDate','<=','2030-01-31'),f.where('endDate','>=','2030-01-01'),f.orderBy('startDate','asc'),f.orderBy('endDate','asc'));
      const first=await f.getDocs(q);
      let off;await new Promise((resolve,reject)=>{off=f.onSnapshot(q,s=>{if(!s.metadata.fromCache)resolve();},reject);});off();
      await f.terminate(db);
      return {documents:first.size,fromCache:first.metadata.fromCache,productionRequests:false};
    },{projectId,uid,port:Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1])});
    await page.waitForTimeout(250);
    assert.equal(result.documents,1);assert.equal(result.fromCache,false);
    assert.ok(!failures.some(x=>x.error?.includes('ERR_BLOCKED_BY_CLIENT')));
    await writeFile(new URL('../.tmp/bot-tests/browser-emulator.json',import.meta.url),JSON.stringify({result,failures,terminations,extensions:false},null,2));
  } finally {await context.close();await browser.close();await env.cleanup();await new Promise(resolve=>server.close(resolve));}
});
