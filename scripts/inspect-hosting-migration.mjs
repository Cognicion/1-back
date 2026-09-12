import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resolver } from 'node:dns/promises';
import { migrationFetch as fetch } from './migration-http.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const cli = join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib');
const auth = require(join(cli, 'auth.js'));
const api = require(join(cli, 'api.js'));
const account = auth.getProjectDefaultAccount(root);
if (!account) throw new Error('Firebase CLI authentication required');
const config = JSON.parse(execFileSync(process.execPath, ['-e', 'process.stdout.write(require("fs").readFileSync(".firebaserc","utf8"))'], {cwd: root, encoding:'utf8'}));
if (config.projects.default !== 'cognicion-57052') throw new Error('Wrong project');
const backup = join(root, '.firebase', 'migration', new Date().toISOString().replaceAll(':','-'));
await mkdir(backup, { recursive: true });
for (const file of ['firebase.json','.firebaserc','scripts/build-firebase-hosting.mjs']) await copyFile(join(root,file),join(backup,file.replaceAll('/','_')));
for (const [file,args] of [['git-status.txt',['status','--branch','--short']],['git-diff.patch',['diff']],['git-head.txt',['rev-parse','HEAD']]]) await writeFile(join(backup,file),execFileSync('git',args,{cwd:root,encoding:'utf8'}));
api.setScopes(['https://www.googleapis.com/auth/cloud-platform']);
const token = await auth.getAccessToken(account.tokens.refresh_token, api.getScopes());
const resources = {
  site: 'v1beta1/projects/cognicion-57052/sites/cognicion-57052',
  domains: 'v1beta1/projects/cognicion-57052/sites/cognicion-57052/customDomains',
  apex: 'v1beta1/projects/cognicion-57052/sites/cognicion-57052/customDomains/cognicionlabs.com',
  www: 'v1beta1/projects/cognicion-57052/sites/cognicion-57052/customDomains/www.cognicionlabs.com',
  releases: 'v1beta1/sites/cognicion-57052/releases?pageSize=5'
};
for (const [name,path] of Object.entries(resources)) {
  const response = await fetch('https://firebasehosting.googleapis.com/'+path,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});
  const body = await response.json();
  await writeFile(join(backup,name+'.json'),JSON.stringify({status:response.status,body},null,2));
  const summary = name === 'releases' ? {releases:body.releases?.map(r=>({name:r.name,version:r.version?.name,time:r.releaseTime}))} : body;
  console.log(JSON.stringify({resource:name,status:response.status,body:summary}));
}
const dnsSnapshots = [];
for (const server of ['1.1.1.1','8.8.8.8']) {
  const resolver = new Resolver({timeout:3000,tries:1});
  resolver.setServers([server]);
  const queries = [['cognicionlabs.com','A'],['cognicionlabs.com','AAAA'],['cognicionlabs.com','CNAME'],['cognicionlabs.com','TXT'],['cognicionlabs.com','CAA'],['cognicionlabs.com','NS'],['www.cognicionlabs.com','CNAME'],['_acme-challenge.cognicionlabs.com','TXT']];
  for (const [domain,type] of queries) {
    try { dnsSnapshots.push({server,domain,type,answers:await resolver.resolve(domain,type)}); }
    catch (error) { dnsSnapshots.push({server,domain,type,error:error.code}); }
  }
}
await writeFile(join(backup,'dns-public.json'),JSON.stringify(dnsSnapshots,null,2));
console.log(JSON.stringify({dns:dnsSnapshots}));
try {
  const credentialText = execFileSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},stdio:['pipe','pipe','pipe'],timeout:10000});
  const credential = Object.fromEntries(credentialText.trim().split('\n').map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));
  for(const resource of ['pages','branches/main','actions/workflows']) {
    const response=await fetch('https://api.github.com/repos/Cognicion/1-back/'+resource,{headers:{Authorization:'Bearer '+credential.password,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    await writeFile(join(backup,'github-'+resource.replaceAll('/','-')+'.json'),JSON.stringify({status:response.status,body},null,2));
    console.log(JSON.stringify({github:resource,status:response.status,source:body.source,cname:body.cname,httpsEnforced:body.https_enforced,protected:body.protected,workflows:body.workflows?.map(workflow=>({name:workflow.name,path:workflow.path,state:workflow.state}))}));
  }
} catch { console.log(JSON.stringify({github:'authenticated read unavailable'})); }
for (const [name,url] of [
  ['auth','https://identitytoolkit.googleapis.com/admin/v2/projects/cognicion-57052/config'],
  ['appcheck','https://firebaseappcheck.googleapis.com/v1/projects/1037684177162/services']
]) {
  try {
    const response=await fetch(url,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});
    const body=await response.json();
    const summary={resource:name,status:response.status,...(name==='auth'?{authorizedDomains:body.authorizedDomains}:{services:body.services?.map(service=>({name:service.name,enforcementMode:service.enforcementMode}))})};
    await writeFile(join(backup,name+'-settings.json'),JSON.stringify(summary,null,2));
    console.log(JSON.stringify(summary));
  } catch { console.log(JSON.stringify({resource:name,status:'unavailable'})); }
}
console.log(JSON.stringify({backup,cloudflareEnvironmentCredential:!!(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN)}));
