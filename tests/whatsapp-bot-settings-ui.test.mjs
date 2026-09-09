import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH);
test('actual WhatsApp settings controller: save, stop, template check, failure and aborted listeners',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/*',route=>route.abort());
    const html=await readFile(new URL('../agenda.html',import.meta.url),'utf8');
    await page.setContent(html.match(/<section data-settings-content="whatsapp"[\s\S]+?<\/section>/)[0].replace(' hidden',''));
    const source=(await readFile(new URL('../js/services/agendaWhatsAppSettings.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
    await page.evaluate(async source=>{
      window.calls=[];window.abort=new AbortController();window.result={settings:null,admin:false,channel:{configured:true,enabled:false,authorizedRecipientCount:1},templateStatus:'not_checked'};
      const mod=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      await mod.initializeWhatsAppSettings(document.querySelector('section'),{signal:window.abort.signal,call:async data=>{
        window.calls.push(data);if(window.failure)throw Error('Synthetic backend failure');
        if(data.action==='save')window.result.settings=data.settings;
        if(data.action==='stop')window.result.settings.enabled=false;
        return {...window.result,templateStatus:data.action==='checkTemplate'?'REJECTED':'not_checked'};
      }});
    },source);
    await page.fill('[name="label"]','Profesional ficticio');await page.fill('[name="displayName"]','Dra. Profesional Ficticia');await page.fill('[name="specialty"]','Psiquiatría');await page.fill('[name="slug"]','profesional-ficticia');await page.check('[name="enabled"]');
    await page.locator('[data-bot-form] button[type="submit"]').click();
    assert.equal(await page.evaluate(()=>window.calls.at(-1).settings.enabled),true);
    await page.click('[data-bot-stop]');assert.equal(await page.locator('[name="enabled"]').isChecked(),false);
    await page.click('[data-bot-template]');assert.match(await page.locator('[data-bot-status]').innerText(),/REJECTED/);
    assert.equal(await page.locator('[data-bot-admin]').isVisible(),false);
    await page.evaluate(()=>{window.failure=true;});await page.click('[data-bot-reload]');
    assert.match(await page.locator('[data-bot-status]').innerText(),/No se confirmó ningún cambio/);
    const count=await page.evaluate(()=>{window.abort.abort();return window.calls.length;});await page.click('[data-bot-reload]');assert.equal(await page.evaluate(()=>window.calls.length),count);
  }finally{await browser.close();}
});
