import { createRequire } from 'node:module';
import { readFile, writeFile, open, unlink, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { migrationFetch } from './migration-http.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'.firebase','migration');
await mkdir(output,{recursive:true});
const lockPath=join(output,'monitor.lock');
const lock=await open(lockPath,'wx');
try {
  const require=createRequire(import.meta.url);
  const cli=join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib');
  const auth=require(join(cli,'auth.js'));
  const api=require(join(cli,'api.js'));
  const account=auth.getProjectDefaultAccount(root);
  api.setScopes(['https://www.googleapis.com/auth/cloud-platform']);
  const token=await auth.getAccessToken(account.tokens.refresh_token,api.getScopes());
  const expected=JSON.parse(await readFile(join(root,'health.json'),'utf8'));
  const deadline=Date.now()+600000;
  let attempt=0;
  let ready=false;
  while(Date.now()<deadline) {
    attempt++;
    try {
      const response=await migrationFetch('https://firebasehosting.googleapis.com/v1beta1/projects/cognicion-57052/sites/cognicion-57052/customDomains/cognicionlabs.com',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});
      if(!response.ok) throw new Error('Firebase HTTP '+response.status);
      const domain=await response.json();
      const state={timestamp:new Date().toISOString(),attempt,deadline:new Date(deadline).toISOString(),hostState:domain.hostState,ownershipState:domain.ownershipState,certificate:domain.cert?.state,checkTime:domain.requiredDnsUpdates?.checkTime,issues:domain.issues||[]};
      if(domain.hostState==='HOST_ACTIVE'&&domain.ownershipState==='OWNERSHIP_ACTIVE') {
        const healthResponse=await migrationFetch('https://cognicionlabs.com/health.json',{signal:AbortSignal.timeout(15000)});
        state.http=healthResponse.status;
        if(healthResponse.status===200) {
          const health=await healthResponse.json();
          state.expectedHealth=health.appVersion===expected.appVersion&&health.build===expected.build&&health.service===expected.service;
        }
      }
      await writeFile(join(output,'monitor-state.json'),JSON.stringify(state,null,2));
      console.log(JSON.stringify(state));
      if(state.expectedHealth) { ready=true; break; }
    } catch(error) { console.log(JSON.stringify({attempt,error:error.message})); }
    if(process.argv.includes('--once')) break;
    await delay(Math.min(attempt===1?15000:attempt===2?30000:60000,Math.max(0,deadline-Date.now())));
  }
  process.exitCode=ready?0:1;
} finally { await lock.close(); await unlink(lockPath); }
