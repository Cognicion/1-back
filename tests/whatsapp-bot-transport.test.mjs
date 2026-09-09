import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createTransport,outboundBody,deliveryAddress}=require('../functions/whatsappBot/transport');
const channel={graphVersion:'v23.0',phoneNumberId:'1234567890',wabaId:'9876543210'};
const input={channel,to:'5215550000001',content:{text:'Mensaje ficticio'},correlation:'a'.repeat(64)};
test('text, button, list and template Cloud API bodies',()=>{
  assert.equal(outboundBody(input.to,input.content,input.correlation).type,'text');
  assert.equal(outboundBody(input.to,{text:'Elegir',choices:[{id:'1',title:'Confirmar'}]},input.correlation).interactive.type,'button');
  assert.equal(outboundBody(input.to,{text:'Elegir',choices:[1,2,3,4].map(i=>({id:String(i),title:'Opción '+i}))},input.correlation).interactive.type,'list');
  assert.equal(outboundBody(input.to,{template:{name:'recordatorio',language:{code:'es_MX'}}},input.correlation).type,'template');
});
test('normalizes only the unambiguous Mexican legacy mobile delivery address',()=>{
  assert.equal(deliveryAddress('5216691971091'),'526691971091');
  assert.equal(outboundBody('5216691971091',{text:'Mensaje ficticio'},input.correlation).to,'526691971091');
  assert.equal(deliveryAddress('526691971091'),'526691971091');
  assert.equal(deliveryAddress('14155552671'),'14155552671');
  assert.equal(deliveryAddress('521123456789'),'521123456789');
  assert.equal(deliveryAddress('52112345678901'),'52112345678901');
});
test('different Mexican legacy identities retain distinct delivery addresses',()=>{
  assert.notEqual(deliveryAddress('5216691971091'),deliveryAddress('5216691971092'));
});
for(const [status,data,state] of [[200,{messages:[{id:'wamid.test'}]},'accepted'],[429,{error:{code:130429,message:'private'}},'retry'],[500,{error:{message:'private'}},'uncertain'],[400,{error:{code:100,message:'private'}},'failed']])test(`HTTP ${status} classified ${state} without sensitive error`,async()=>{
  const transport=createTransport({accessToken:()=> 'fake-token',fetchImpl:async(_url,options)=>{assert.equal(options.headers.authorization,'Bearer fake-token');assert.ok(options.signal);return {ok:status===200,status,json:async()=>data};}});
  const result=await transport.send(input);assert.equal(result.state,state);assert.doesNotMatch(JSON.stringify(result),/private|fake-token/);
});
test('timeout has uncertain outcome and missing credential prevents request',async()=>{
  assert.equal((await createTransport({accessToken:()=> 'fake',fetchImpl:async()=>{throw Error('timeout');}}).send(input)).state,'uncertain');
  assert.equal((await createTransport({accessToken:()=> '',fetchImpl:async()=>assert.fail('must not fetch')}).send(input)).state,'blocked_credential');
});
