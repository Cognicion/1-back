import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function previousWorkerWithWaitingUpdate() {
  const source=(await readFile(new URL('../js/services/cacheControlService.js',import.meta.url),'utf8'))
    .replace(/^import \{ APP_VERSION \}[^\n]+/m,'const APP_VERSION="2.209";')
    .replace(/^export \{ APP_VERSION \};/m,'')
    .replace(/^export /gm,'');
  let reloads=0;
  let messages=0;
  let click;
  const timers=new Map();
  const button={disabled:false,addEventListener:(event,listener)=>{if(event==='click')click=listener;}};
  const label={textContent:''};
  const banner={style:{},setAttribute(){},querySelector:selector=>selector==='button'?button:label};
  const sw=new EventTarget();
  sw.controller={state:'activated'};
  sw.register=async()=>({waiting:{postMessage:()=>messages++},addEventListener(){}});
  const window={location:{pathname:'/index.html',reload:()=>reloads++},requestIdleCallback:callback=>callback(),setTimeout:callback=>{const id=timers.size+1;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)};
  const document={readyState:'complete',activeElement:null,querySelector:()=>({}),getElementById:()=>null,createElement:()=>banner,body:{appendChild(){}},head:{appendChild(){}}};
  const context=vm.createContext({window,document,navigator:{serviceWorker:sw},console,Event,EventTarget,confirm:()=>true});
  vm.runInContext(source,context);
  await context.iniciarCacheCognicionDiferido();
  return {button,label,click:()=>click(),change:()=>sw.dispatchEvent(new Event('controllerchange')),timeout:()=>[...timers.values()].forEach(callback=>callback()),reloads:()=>reloads,messages:()=>messages};
}

test('worker anterior usable: la actualización waiting no recarga sin aceptar',async()=>{
  const state=await previousWorkerWithWaitingUpdate();
  state.change();
  assert.equal(state.reloads(),0);
  assert.equal(state.messages(),0);
  assert.equal(state.button.disabled,false);
});

test('aceptar actualización dos veces y recibir controllerchange duplicado recarga una vez',async()=>{
  const state=await previousWorkerWithWaitingUpdate();
  state.click();
  state.click();
  assert.equal(state.messages(),1);
  state.change();
  state.change();
  state.timeout();
  assert.equal(state.reloads(),1);
});

test('activación agotada mantiene versión actual sin recarga y permite reintentar',async()=>{
  const state=await previousWorkerWithWaitingUpdate();
  state.click();
  state.timeout();
  state.change();
  assert.equal(state.reloads(),0);
  assert.equal(state.button.disabled,false);
  assert.match(state.label.textContent,/seguir usando esta versión/);
  state.click();
  state.change();
  assert.equal(state.reloads(),1);
});
