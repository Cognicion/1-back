import https from 'node:https';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fresh = process.argv.includes('--fresh');
const hosts = process.argv.slice(2).filter(value=>value!=='--fresh');
const probeId = Date.now().toString();
if (!hosts.length) hosts.push('cognicionlabs.com','www.cognicionlabs.com','cognicion-57052.web.app');
if (hosts.some(host=>!['cognicionlabs.com','www.cognicionlabs.com','cognicion-57052.web.app','cognicion-57052.firebaseapp.com'].includes(host))) throw new Error('Host out of scope');
const paths=['/','/index.html','/login.html','/biblioteca.html','/agenda.html','/health.json','/service-worker.js','/js/availability-bootstrap.js','/css/theme.css','/assets/favicon-cognicion.png'];
const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
async function probe(host,path) {
  const expected=await readFile(join(root,path==='/'?'index.html':path.slice(1)));
  return new Promise(resolveProbe=>{
    const requestPath=fresh?`${path}?migration_check=${probeId}`:path;
    const request=https.get({hostname:host,path:requestPath,timeout:10000,headers:{'Cache-Control':'no-cache'}},response=>{
      const certificate=response.socket.getPeerCertificate();
      const tls=response.socket.authorized===true;
      const ip=response.socket.remoteAddress;
      const chunks=[];
      response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>{
        clearTimeout(deadline);
        const body=Buffer.concat(chunks);
        resolveProbe({host,path,fresh,status:response.statusCode,tls,certificate:{subjectAltName:certificate.subjectaltname,validTo:certificate.valid_to},ip,edge:response.headers['x-served-by'],cdnCache:response.headers['x-cache'],location:response.headers.location,cacheControl:response.headers['cache-control'],mime:response.headers['content-type'],bytes:body.length,expectedContent:hash(body)===hash(expected),sha256:hash(body)});
      });
    });
    const deadline=setTimeout(()=>request.destroy(new Error('TIMEOUT')),15000);
    request.on('timeout',()=>request.destroy(new Error('TIMEOUT')));
    request.on('error',error=>{clearTimeout(deadline);resolveProbe({host,path,error:error.code||error.message});});
  });
}
const rows=[];
for(const host of hosts) {
  const batch=await Promise.all(paths.map(path=>probe(host,path)));
  rows.push(...batch);
  for(const row of batch) console.log(JSON.stringify(row));
}
const output=join(root,'.firebase','migration');
await mkdir(output,{recursive:true});
await writeFile(join(output,fresh?'smoke-fresh-latest.json':'smoke-latest.json'),JSON.stringify({timestamp:new Date().toISOString(),rows},null,2));
process.exitCode=rows.some(row=>row.error || !row.tls || row.status!==200 || !row.expectedContent)?1:0;
