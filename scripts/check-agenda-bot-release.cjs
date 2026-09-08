// Local checks only. --record freezes reviewed paths; default verifies hashes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),manifestPath=path.join(root,'docs/agenda-whatsapp-release-manifest.json');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(path.resolve(git('rev-parse','--show-toplevel')).toLowerCase()!==root.toLowerCase()||git('branch','--show-current')!=='main')throw Error('Canonical main required');
const paths=['.gitignore','agenda.html','css/agenda.css','firestore.indexes.json','firestore.rules','functions/index.js','functions/appointments/domain.mjs','functions/appointments/recurrence.mjs','functions/appointments/service.mjs','functions/whatsappWebhook/handler.js','functions/whatsappWebhook/index.js','functions/whatsappWebhook/store.js','functions/test/whatsappWebhook.test.js','js/agenda.js','js/agenda/visualModel.js','js/config/appVersion.js','js/services/agendaReadDiagnostics.js','js/services/agendaWhatsAppSettings.js','js/themes/biocellularThemeController.js','scripts/qa-agenda-visual.cjs','scripts/audit-agenda-release.cjs','scripts/run-agenda-whatsapp-tests.cjs','scripts/test-agenda-whatsapp.ps1','scripts/check-agenda-bot-release.cjs','tests/appointment-emulator.test.mjs','tests/appointment-modern-recurrence.test.mjs','tests/agenda-browser-emulator.test.mjs','tests/whatsapp-bot-emulator.test.mjs','tests/whatsapp-bot-settings-ui.test.mjs','tests/whatsapp-bot-transport.test.mjs',...fs.readdirSync(path.join(root,'functions/whatsappBot')).filter(x=>/\.(js|mjs)$/.test(x)).map(x=>'functions/whatsappBot/'+x)];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
for(const file of paths.filter(x=>/\.(js|mjs|cjs)$/.test(x)))execFileSync(process.execPath,['--check',path.join(root,file)],{cwd:root,stdio:['ignore','pipe','pipe']});
git('diff','--check');
const version=fs.readFileSync(path.join(root,'js/config/appVersion.js'),'utf8').match(/APP_VERSION = "([^"]+)"/)[1];
const html=fs.readFileSync(path.join(root,'agenda.html'),'utf8');
if(!html.includes('css/agenda.css?v='+version)||!html.includes('js/agenda.js?v='+version+'-workspace'))throw Error('Agenda version mismatch');
if(process.argv.includes('--record'))fs.writeFileSync(manifestPath,JSON.stringify({head:git('rev-parse','HEAD'),version,recordedAt:new Date().toISOString(),files:Object.fromEntries(paths.sort().map(x=>[x,digest(x)]))},null,2)+'\n');
const manifest=JSON.parse(fs.readFileSync(manifestPath));
if(manifest.head!==git('rev-parse','HEAD'))throw Error('HEAD changed after review');
for(const [file,hash] of Object.entries(manifest.files))if(digest(file)!==hash)throw Error('Reviewed file changed: '+file);
console.log(JSON.stringify({version,head:manifest.head,files:Object.keys(manifest.files).length,syntax:'PASS',diffCheck:'PASS',manifest:'PASS',divergence:git('rev-list','--left-right','--count','HEAD...origin/main')}));
