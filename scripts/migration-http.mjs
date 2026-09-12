import https from 'node:https';
import dns from 'node:dns';
import { Resolver } from 'node:dns/promises';
import { setTimeout as delay } from 'node:timers/promises';
const resolver=new Resolver({timeout:3000,tries:2});
resolver.setServers(['1.1.1.1','8.8.8.8']);
const allowed=new Set(['firebasehosting.googleapis.com','api.cloudflare.com','api.github.com','identitytoolkit.googleapis.com','firebaseappcheck.googleapis.com','cognicionlabs.com']);
function lookup(host,options,callback) {
  dns.lookup(host,options,(error,address,family)=>{
    if(!error) return callback(null,address,family);
    resolver.resolve4(host).then(addresses=>options?.all?callback(null,addresses.map(address=>({address,family:4}))):callback(null,addresses[0],4),callback);
  });
}
export async function migrationFetch(url,options={}) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!allowed.has(parsed.hostname)) throw new Error('API host outside migration scope');
  const method=options.method||'GET';
  for(let attempt=0;attempt<(method==='GET'?3:1);attempt++) {
    try {
      return await new Promise((resolve,reject)=>{
        const request=https.request(parsed,{method,headers:options.headers,lookup,signal:options.signal,agent:false},response=>{
          const chunks=[];
          response.on('data',chunk=>chunks.push(chunk));
          response.on('error',reject);
          response.on('end',()=>{
            clearTimeout(timer);
            const text=Buffer.concat(chunks).toString('utf8');
            resolve({status:response.statusCode,ok:response.statusCode>=200&&response.statusCode<300,json:async()=>JSON.parse(text)});
          });
        });
        const timer=setTimeout(()=>request.destroy(new Error('API_TIMEOUT')),20000);
        request.on('error',error=>{clearTimeout(timer);reject(new Error(`${parsed.hostname}: ${error.code||error.message}`));});
        request.end(options.body);
      });
    } catch(error) {
      if(method!=='GET'||attempt===2) throw error;
      await delay(500*(attempt+1));
    }
  }
}
