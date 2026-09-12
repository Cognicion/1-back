import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, open, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { migrationFetch as fetch } from './migration-http.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Gate on real apex content and TLS before modifying the secondary hostname.
execFileSync(process.execPath,['scripts/smoke-hosting.mjs','cognicionlabs.com'],{cwd:root,stdio:'pipe',timeout:60000});
const output=join(root,'.firebase','migration');
await mkdir(output,{recursive:true});
const lockPath=join(output,'dns.lock');
const lock=await open(lockPath,'wx');
try {
  const require=createRequire(import.meta.url);
  const cli=join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib');
  const auth=require(join(cli,'auth.js'));
  const api=require(join(cli,'api.js'));
  const account=auth.getProjectDefaultAccount(root);
  api.setScopes(['https://www.googleapis.com/auth/cloud-platform']);
  const token=await auth.getAccessToken(account.tokens.refresh_token,api.getScopes());
  const path='projects/cognicion-57052/sites/cognicion-57052/customDomains/www.cognicionlabs.com';
  async function firebase(resource,method='GET',body) {
    const response=await fetch('https://firebasehosting.googleapis.com/v1beta1/'+resource,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error(`Firebase ${method}: HTTP ${response.status}`);
    return response.json();
  }
  async function waitOperation(operation) {
    await writeFile(join(output,'www-operation.json'),JSON.stringify(operation,null,2));
    for(let attempt=0;attempt<12;attempt++) {
      if(operation.done) {
        if(operation.error) throw new Error('Firebase operation: '+operation.error.message);
        return;
      }
      if(!operation.name?.includes('/sites/cognicion-57052/customDomains/www.cognicionlabs.com/operations/')) throw new Error('Unexpected operation scope');
      await delay(2500);
      operation=await firebase(operation.name);
      await writeFile(join(output,'www-operation.json'),JSON.stringify(operation,null,2));
    }
    throw new Error('WWW operation PENDING; saved for resumption');
  }
  let domain=await firebase(path);
  if(!domain.name.endsWith('/sites/cognicion-57052/customDomains/www.cognicionlabs.com')) throw new Error('Unexpected domain');
  await writeFile(join(output,'www-before-'+Date.now()+'.json'),JSON.stringify(domain,null,2));
  if(domain.deleteTime) {
    await firebase(domain.name+':undelete','POST',{etag:domain.etag,validateOnly:true});
    await waitOperation(await firebase(domain.name+':undelete','POST',{etag:domain.etag}));
    domain=await firebase(path);
    console.log('Existing WWW domain restored');
  }
  if(domain.redirectTarget!=='cognicionlabs.com') {
    await waitOperation(await firebase(domain.name+'?updateMask=redirectTarget','PATCH',{etag:domain.etag,redirectTarget:'cognicionlabs.com'}));
    domain=await firebase(path);
    console.log('WWW redirect configured to cognicionlabs.com');
  }
  await writeFile(join(output,'www-current.json'),JSON.stringify(domain,null,2));
  console.log(JSON.stringify({name:domain.name,redirectTarget:domain.redirectTarget,certificate:domain.cert?.state,requiredDnsUpdates:domain.requiredDnsUpdates,verification:domain.cert?.verification}));
} finally { await lock.close(); await unlink(lockPath); }
