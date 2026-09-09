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
test('Meta asset inspection proves WABA membership, Cloud API, suffix and subscription without exposing token',async()=>{
  const fetchImpl=async url=>{
    if(url.includes('/phone_numbers?'))return {ok:true,json:async()=>({data:[{id:channel.phoneNumberId,display_phone_number:'+52 669 245 8280',verified_name:'COGNICIÓN',quality_rating:'GREEN',code_verification_status:'VERIFIED',platform_type:'CLOUD_API',name_status:'APPROVED',status:'CONNECTED'}]})};
    if(url.includes('/subscribed_apps?'))return {ok:true,json:async()=>({data:[{id:'app'}]})};
    return {ok:true,json:async()=>({id:channel.wabaId,name:'COGNICIÓN',account_review_status:'APPROVED',business_verification_status:'verified',ownership_type:'SELF'})};
  };
  const result=await createTransport({accessToken:()=> 'fake-token',fetchImpl}).inspectChannel(channel);
  assert.equal(result.verified,true);assert.equal(result.numberSuffix,'8280');assert.equal(result.platformType,'CLOUD_API');assert.equal(result.subscribed,true);assert.doesNotMatch(JSON.stringify(result),/fake-token/);
});
test('Meta asset inspection fails closed when phone does not belong to WABA',async()=>{
  const fetchImpl=async url=>url.includes('/phone_numbers?')?{ok:true,json:async()=>({data:[]})}:{ok:true,json:async()=>({data:[]})};
  const result=await createTransport({accessToken:()=> 'fake-token',fetchImpl}).inspectChannel(channel);
  assert.equal(result.verified,false);assert.equal(result.code,'PHONE_NOT_IN_WABA');
});
