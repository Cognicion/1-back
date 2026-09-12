import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, open, writeFile, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationFetch as fetch } from './migration-http.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
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
  if(!account) throw new Error('Firebase CLI authentication required');
  api.setScopes(['https://www.googleapis.com/auth/cloud-platform']);
  const firebaseToken=await auth.getAccessToken(account.tokens.refresh_token,api.getScopes());
  let cloudflareToken=process.env.CLOUDFLARE_API_TOKEN||process.env.CF_API_TOKEN;
  if(!cloudflareToken) {
    try {
      cloudflareToken=execFileSync('powershell.exe',['-NoProfile','-Command',"Add-Type -AssemblyName System.Security; $encrypted=[IO.File]::ReadAllBytes('.firebase/migration/cloudflare-token.dpapi'); $plain=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); try { [Console]::Write([Text.Encoding]::UTF8.GetString($plain)) } finally { [Array]::Clear($plain,0,$plain.Length) }"],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    } catch { throw new Error('Cloudflare scoped token required in local protected prompt'); }
  }
  async function request(base,path,token,method='GET',body) {
    const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    if(!response.ok || data.success===false) throw new Error(`${method} ${path}: HTTP ${response.status}`);
    return data;
  }
  const firebase=(path)=>request('https://firebasehosting.googleapis.com/v1beta1/',path,firebaseToken.access_token);
  const cf=(path,method,body)=>request('https://api.cloudflare.com/client/v4/',path,cloudflareToken,method,body);
  const zones=await cf('zones?name=cognicionlabs.com');
  if(zones.result?.length!==1 || zones.result[0].name!=='cognicionlabs.com') throw new Error('Zone identity ambiguous');
  const zone=zones.result[0];
  const hostname=process.argv.includes('--www')?'www.cognicionlabs.com':'cognicionlabs.com';
  const domain=await firebase('projects/cognicion-57052/sites/cognicion-57052/customDomains/'+hostname);
  if(domain.deleteTime || !domain.name.endsWith('/sites/cognicion-57052/customDomains/'+hostname)) throw new Error('Domain identity mismatch');
  const readRecords=async()=>{
    const records=[];
    for(let page=1;page<=100;page++) {
      const data=await cf(`zones/${zone.id}/dns_records?per_page=100&page=${page}`);
      records.push(...data.result);
      if(page>=(data.result_info?.total_pages||1)) return records;
    }
    throw new Error('DNS pagination limit reached');
  };
  const records=await readRecords();
  const backup=join(output,'dns-'+new Date().toISOString().replaceAll(':','-')+'.json');
  await writeFile(backup,JSON.stringify({timestamp:new Date().toISOString(),zone:{id:zone.id,name:zone.name,accountId:zone.account?.id},domain,records},null,2),{flag:'wx'});
  const requested=[...(domain.requiredDnsUpdates?.desired||[]),...(domain.cert?.verification?.dns?.desired||[])].flatMap(x=>x.records||[]);
  const additions=requested.filter(record=>record.requiredAction==='ADD'&&record.type==='TXT'&&[hostname,'_acme-challenge.'+hostname].includes(record.domainName));
  const normalize=value=>value.startsWith('"')&&value.endsWith('"')?value.slice(1,-1):value;
  const missing=additions.filter(record=>!records.some(existing=>existing.name===record.domainName&&existing.type===record.type&&normalize(existing.content)===record.rdata));
  console.log(JSON.stringify({zone:zone.name,site:'cognicion-57052',domain:domain.name,backup,missing,mode:process.argv.includes('--apply')?'apply':'inspect'}));
  if(process.argv.includes('--apply')) {
    for(const record of missing) {
      if(record.domainName===hostname&&record.rdata!=='hosting-site=cognicion-57052') throw new Error('Refusing unrelated ownership TXT');
      if(records.some(existing=>existing.name===record.domainName&&existing.type==='CNAME')) throw new Error('CNAME conflict needs explicit reconciliation');
      const result=await cf(`zones/${zone.id}/dns_records`,'POST',{type:'TXT',name:record.domainName,content:record.rdata,ttl:300});
      console.log(JSON.stringify({action:'added',id:result.result.id,name:record.domainName,type:'TXT'}));
    }
    const after=await readRecords();
    await writeFile(backup.replace('.json','-after.json'),JSON.stringify(after,null,2));
    for(const before of records) {
      const current=after.find(record=>record.id===before.id);
      if(!current||current.content!==before.content||current.type!==before.type||current.name!==before.name||current.ttl!==before.ttl||current.proxied!==before.proxied) throw new Error('Pre-existing DNS record changed concurrently; inspect backup');
    }
    console.log(JSON.stringify({existingRecordsPreserved:true,added:missing.length}));
  }
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
} finally {
  await lock.close();
  await unlink(lockPath);
}
