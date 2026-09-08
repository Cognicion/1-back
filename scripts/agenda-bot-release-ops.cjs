// Authorized deployment checks; never accesses Secret Manager payloads.
// Google CLI authenticates API requests in memory. No tokens or raw error bodies
// are printed or saved. Data access is limited to bot configuration/metadata.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),project='cognicion-57052';
process.env.CLOUDSDK_CORE_DISABLE_FILE_LOGGING='true';
process.env.TEMP=process.env.TMP=path.join(root,'.tmp/bot-tests');
const command=process.argv[2];
if(!['lock','status','verify-rules','snapshot','fields','field-status','functions','indexes','smoke'].includes(command))throw Error('Unknown release operation');
const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const headers={authorization:'Bearer '+execFileSync('cmd.exe',['/d','/c','gcloud.cmd auth print-access-token'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim(),'content-type':'application/json','x-goog-user-project':project};
async function api(url,body,method=body?'POST':'GET'){
  const r=await fetch(url,{method,headers,signal:AbortSignal.timeout(30000),...(body?{body:JSON.stringify(body)}:{})});
  if(r.status===404)return null;
  if(!r.ok){const e=await r.json().catch(()=>({}));const reason=e.error?.details?.find(x=>typeof x.reason==='string')?.reason;throw Error('Google API HTTP '+r.status+(reason&&/^[A-Z_]+$/.test(reason)?' '+reason:''));}
  return r.json();
}
const value=(doc,key)=>doc?.fields?.[key];
async function channel(){return api(base+'/whatsappBotConfig/channel?mask.fieldPaths=enabled&mask.fieldPaths=pilot&mask.fieldPaths=allowedSubjects&mask.fieldPaths=professionalIds');}
async function professionals(){return (await api(base+'/whatsappBotProfessionals?pageSize=100&mask.fieldPaths=enabled&mask.fieldPaths=reminders'))?.documents||[];}
async function main(){
  if(command==='functions'){
    const names=['manageAppointment','whatsappWebhook','configureWhatsAppBot','whatsappBotWorkCreated','whatsappBotDrain','whatsappBotAppointmentChanged'];
    const r=await api(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`);
    if(r.nextPageToken)throw Error('Unexpected pagination');
    const before=JSON.parse(fs.readFileSync(path.join(root,'.tmp/bot-tests/functions-before-release.json'),'utf8'));
    const untouched=before.filter(f=>!names.includes(f.name.split('/').at(-1)));
    const unchanged=untouched.every(f=>r.functions.some(g=>g.name===f.name&&g.updateTime===f.updateTime));
    const selected=r.functions.filter(f=>names.includes(f.name.split('/').at(-1))).map(f=>({name:f.name,state:f.state,updateTime:f.updateTime,uri:f.serviceConfig?.uri,runtime:f.buildConfig?.runtime,secrets:f.serviceConfig?.secretEnvironmentVariables?.map(s=>({key:s.key,version:s.version})),account:f.serviceConfig?.serviceAccountEmail,event:f.eventTrigger?{region:f.eventTrigger.triggerRegion,type:f.eventTrigger.eventType,retry:f.eventTrigger.retryPolicy,filters:f.eventTrigger.eventFilters}:null,kmsConfigured:f.serviceConfig?.environmentVariables?.GOOGLE_CALENDAR_KMS_KEY_NAME===`projects/${project}/locations/global/keyRings/cognicion-calendar/cryptoKeys/refresh-tokens`}));
    const result={checkedAt:new Date().toISOString(),total:r.functions.length,otherFunctions:untouched.length,otherFunctionsUnchanged:unchanged,selected};
    fs.writeFileSync(path.join(root,'.tmp/bot-tests/functions-after-release.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));if(!unchanged)throw Error('Unexpected unrelated Function change');
    if(process.argv.includes('--complete')&&(selected.length!==6||selected.some(f=>f.state!=='ACTIVE'||!f.name.includes('/locations/us-central1/')||f.runtime!=='nodejs24'||!f.kmsConfigured||(f.event&&f.event.region!=='northamerica-south1'))))throw Error('Unexpected incomplete Function deployment');return;
  }
  if(command==='indexes'){
    const r=await api(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes`);
    if(r.nextPageToken)throw Error('Unexpected pagination');
    const indexes=(r.indexes||[]).map(i=>({name:i.name,scope:i.queryScope,state:i.state,fields:i.fields}));
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),indexes}));
    if(indexes.length!==11||indexes.some(i=>i.state!=='READY'))throw Error('Unexpected indexes state');return;
  }
  if(command==='smoke'){
    if(value(await channel(),'enabled')?.booleanValue!==false)throw Error('Pilot release must remain stopped');
    const endpoint=`https://us-central1-${project}.cloudfunctions.net/`;
    const metadata=JSON.parse(fs.readFileSync(path.join(root,'.tmp/bot-tests/functions-after-release.json'),'utf8'));
    const privateNames=['whatsappBotDrain','whatsappBotWorkCreated','whatsappBotAppointmentChanged'];
    const privateFunctions=metadata.selected.filter(f=>privateNames.includes(f.name.split('/').at(-1)));
    if(privateFunctions.length!==3||privateFunctions.some(f=>f.state!=='ACTIVE'||!/^https:\/\/whatsappbot[a-z]+-hquasctbdq-uc\.a\.run\.app$/.test(f.uri)))throw Error('Unexpected private Function metadata');
    const checks=[
      {name:'manageAppointment unauthenticated',url:endpoint+'manageAppointment',method:'POST',body:{data:{action:'create'}},status:401,code:'UNAUTHENTICATED'},
      {name:'configureWhatsAppBot unauthenticated',url:endpoint+'configureWhatsAppBot',method:'POST',body:{data:{action:'get'}},status:401,code:'UNAUTHENTICATED'},
      {name:'webhook GET without verification',url:endpoint+'whatsappWebhook',method:'GET',status:403},
      {name:'webhook POST without HMAC',url:endpoint+'whatsappWebhook',method:'POST',body:{object:'whatsapp_business_account',entry:[]},status:403},
      {name:'webhook unsupported method',url:endpoint+'whatsappWebhook',method:'PUT',status:405},
      ...privateFunctions.map(f=>({name:f.name.split('/').at(-1)+' anonymous invocation denied',url:f.uri,method:'GET',status:403})),
      ...['whatsappBotConfig','whatsappBotProfessionals','whatsappBotJobs','whatsappBotSessions','whatsappBotRecipients','whatsappBotBindings','whatsappBotOutbox','whatsappBotMessageIds','whatsappBotRate','whatsappBotAppointmentOwners'].map(group=>({name:group+' anonymous denied',url:base+'/'+group+'/'+(group==='whatsappBotConfig'?'channel':'release-negative-probe'),method:'GET',status:403,code:'PERMISSION_DENIED'}))
    ];
    const results=[];
    for(const c of checks){
      const r=await fetch(c.url,{method:c.method,headers:{'content-type':'application/json'},...(c.body?{body:JSON.stringify(c.body)}:{}),signal:AbortSignal.timeout(45000)});
      const response=await r.text();let code;try{code=JSON.parse(response).error?.status;}catch{}
      const pass=r.status===c.status&&(!c.code||code===c.code);
      results.push({name:c.name,status:r.status,...(c.code?{code}:{}),pass});
    }
    fs.writeFileSync(path.join(root,'.tmp/bot-tests/backend-negative-smoke.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
    console.log(JSON.stringify(results));if(results.some(r=>!r.pass))throw Error('Unexpected smoke response');return;
  }
  if(command==='fields'||command==='field-status'){
    const fields=JSON.parse(fs.readFileSync(path.join(root,'firestore.indexes.json'),'utf8')).fieldOverrides.filter(f=>f.collectionGroup.startsWith('whatsappBot'));
    if(fields.length!==11||fields.some(f=>!['expiresAt','encrypted','phone'].includes(f.fieldPath)||f.indexes.length))throw Error('Unexpected field configuration');
    for(const f of fields){
      const name=`projects/${project}/databases/(default)/collectionGroups/${f.collectionGroup}/fields/${f.fieldPath}`;
      const url='https://firestore.googleapis.com/v1/'+name;
      if(command==='fields'){
        const op=await api(url+'?updateMask=indexConfig'+(f.ttl?',ttlConfig':''),{name,indexConfig:{indexes:[]},...(f.ttl?{ttlConfig:{}}:{})},'PATCH');
        console.log(JSON.stringify({group:f.collectionGroup,field:f.fieldPath,ttl:Boolean(f.ttl),operation:op.name,done:op.done===true}));
      }else{
        const d=await api(url);console.log(JSON.stringify({group:f.collectionGroup,field:f.fieldPath,ttl:d?.ttlConfig?.state||null,indexCount:d?.indexConfig?.indexes?.length||0,inherited:d?.indexConfig?.usesAncestorConfig===true}));
      }
    }return;
  }
  if(command==='snapshot'){
    const r=await api(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`);
    const data=(r.functions||[]).map(f=>({name:f.name,state:f.state,updateTime:f.updateTime,uri:f.serviceConfig?.uri,runtime:f.buildConfig?.runtime,secrets:f.serviceConfig?.secretEnvironmentVariables?.map(s=>({key:s.key,version:s.version})),account:f.serviceConfig?.serviceAccountEmail}));
    fs.writeFileSync(path.join(root,'.tmp/bot-tests/functions-before-release.json'),JSON.stringify(data,null,2));
    console.log(JSON.stringify({functions:data.length,snapshot:'metadata only'}));return;
  }
  if(command==='verify-rules'){
    const release=await api(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
    const rules=await api('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
    const deployed=rules.source.files.find(f=>f.name==='firestore.rules')?.content;
    const local=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
    const digest=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
    if(!deployed||digest(local)!==digest(deployed))throw Error('Rules mismatch');
    console.log(JSON.stringify({ruleset:release.rulesetName,sha256:digest(local),match:true}));return;
  }
  let c=await channel();const ps=await professionals();
  if(ps.length===100)throw Error('Unexpected professional count; no broad writes');
  if(command==='lock'){
    const fields=c?{enabled:{booleanValue:false}}:{enabled:{booleanValue:false},pilot:{booleanValue:true},allowedSubjects:{arrayValue:{values:[]}},professionalIds:{arrayValue:{values:[]}}};
    await api(base+'/whatsappBotConfig/channel?'+Object.keys(fields).map(k=>'updateMask.fieldPaths='+k).join('&'),{fields},'PATCH');
    for(const p of ps){
      await api('https://firestore.googleapis.com/v1/'+p.name+'?updateMask.fieldPaths=enabled&updateMask.fieldPaths=reminders.enabled',{fields:{enabled:{booleanValue:false},reminders:{mapValue:{fields:{enabled:{booleanValue:false}}}}}},'PATCH');
    }
    c=await channel();
  }
  const after=await professionals();
  const groups=['whatsappBotJobs','whatsappBotSessions','whatsappBotOutbox','whatsappBotRecipients','whatsappBotMessageIds','whatsappBotAppointmentOwners','whatsappBotAppointmentBindings'];
  const occupied={};
  for(const collectionId of groups){const rows=await api(base+':runQuery',{structuredQuery:{from:[{collectionId,allDescendants:true}],select:{fields:[{fieldPath:'expiresAt'}]},limit:1}});occupied[collectionId]=rows.some(r=>r.document);}
  const result={channelExists:Boolean(c),enabled:value(c,'enabled')?.booleanValue===true,pilot:value(c,'pilot')?.booleanValue===true,authorizedRecipients:value(c,'allowedSubjects')?.arrayValue?.values?.length||0,configuredProfessionals:value(c,'professionalIds')?.arrayValue?.values?.length||0,enabledProfessionals:after.filter(p=>value(p,'enabled')?.booleanValue===true).length,enabledReminders:after.filter(p=>value(p,'reminders')?.mapValue?.fields?.enabled?.booleanValue===true).length,groupsHaveData:occupied};
  console.log(JSON.stringify(result));
  if(result.enabled||result.enabledProfessionals||result.enabledReminders||result.authorizedRecipients>1)throw Error('Pilot release must remain stopped with at most one recipient');
}
main().catch(e=>{console.error(/^(Google API HTTP|Rules mismatch|Pilot release|Unexpected professional)/.test(e.message)?e.message:'Release check failed; details withheld');process.exitCode=1;});
