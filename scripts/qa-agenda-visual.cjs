/* Local UI QA only. Serves the canonical checkout; every remote request is blocked.
 * Firebase boundaries are replaced in browser memory with synthetic fixtures.
 * Run: node scripts/qa-agenda-visual.cjs before|after
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.COGNICION_PLAYWRIGHT_MODULE || 'C:/Users/980027131/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const phase = process.argv[2] || 'after';
if (!['before', 'after', 'inspect'].includes(phase)) throw Error('Use before, after or inspect');
const output = path.join(root, '.tmp', 'whatsapp-tests', 'agenda-visual', phase);
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) || /(?:^|[\\/])(?:\.env[^\\/]*|\.git)(?:$|[\\/])/.test(file)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(error ? '' : bytes); });
});
const fixtures = [
  { id:'fixture-appointment', type:'appointment', title:'Consulta de prueba', patientId:'fixture-patient', patientName:'Persona ficticia A', startDate:'2026-09-08', endDate:'2026-09-08', startTime:'09:00', endTime:'10:00', durationMinutes:60, status:'programada' },
  { id:'fixture-event', type:'event', title:'Sesión de equipo', startDate:'2026-09-08', endDate:'2026-09-08', startTime:'11:00', endTime:'12:30', durationMinutes:90, status:'programada' },
  { id:'fixture-overlap', type:'meeting', title:'Reunión de prueba', startDate:'2026-09-08', endDate:'2026-09-08', startTime:'11:30', endTime:'12:30', durationMinutes:60, status:'programada' },
  { id:'fixture-night', type:'shift', title:'Guardia nocturna', startDate:'2026-09-09', endDate:'2026-09-10', startTime:'22:00', endTime:'07:00', durationMinutes:540, status:'programada' },
  { id:'fixture-multiday', type:'vacation', title:'Días personales', startDate:'2026-09-10', endDate:'2026-09-12', allDay:true, status:'programada' },
  { id:'fixture-block', type:'block', title:'Horario reservado', startDate:'2026-09-07', endDate:'2026-09-07', startTime:'14:00', endTime:'16:00', durationMinutes:120, status:'programada' },
  { id:'fixture-short', type:'event', title:'Evento breve de prueba', startDate:'2026-09-08', endDate:'2026-09-08', startTime:'10:30', endTime:'10:35', durationMinutes:5, status:'programada' },
  ...Array.from({length:6}, (_, i) => ({ id:`fixture-overflow-${i}`,type:'event',title:`Evento de prueba ${i+1}`,startDate:'2026-09-14',endDate:'2026-09-14',startTime:`${String(9+i).padStart(2,'0')}:00`,durationMinutes:45,status:'programada' }))
];
const settings = { timeZone:'America/Mexico_City', bookingEnabled:false, weeklySchedule:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday'].map(day=>[day,[{start:'09:00',end:'17:00'}]])) };
const firebaseMock = `export const auth={currentUser:{uid:'fixture-doctor'}}; export const db={}; export const functions={};`;
const storeMock = `export const collection=(...x)=>x;export const doc=(...x)=>x;export const query=(...x)=>x;export const where=(...x)=>x;
export async function getDocs(query){globalThis.__agendaReads++;if(globalThis.__agendaReadError)throw {code:'unavailable'};
const clauses=Array.isArray(query)?query.slice(1):[];const snapshot=structuredClone(globalThis.__agendaFixtures).filter(value=>clauses.every(([field,op,limit])=>op==='in'?limit.includes(value[field]):op==='>='?value[field]>=limit:op==='<='?value[field]<=limit:true));
const delay=globalThis.__agendaReadDelay||0;if(delay)await new Promise(resolve=>setTimeout(resolve,delay));return {docs:snapshot.map(value=>({id:value.id,data:()=>({...value})}))};}
export const getDoc=async()=>({exists:()=>true,data:()=>({rol:'medico'})});export async function addDoc(ref,data){if(data.type==='appointment')throw Error('Direct appointment write prohibited in visual QA');const id=crypto.randomUUID();globalThis.__agendaDirectWrites.push('add');globalThis.__agendaFixtures.push({id,...data});return {id};}export async function updateDoc(ref,data){const id=ref.at(-1),existing=globalThis.__agendaFixtures.find(x=>x.id===id);if(existing?.type==='appointment'||data.type==='appointment')throw Error('Direct appointment write prohibited in visual QA');globalThis.__agendaDirectWrites.push('update');Object.assign(existing,data);}export async function deleteDoc(ref){const id=ref.at(-1);if(globalThis.__agendaFixtures.find(x=>x.id===id)?.type==='appointment')throw Error('Direct appointment delete prohibited in visual QA');globalThis.__agendaDirectWrites.push('delete');globalThis.__agendaFixtures=globalThis.__agendaFixtures.filter(x=>x.id!==id);}export const setDoc=async()=>{throw Error('Unexpected direct write in visual QA')};`;
const commandMock = `export const createRequestId=()=>crypto.randomUUID();export const appointmentErrorCode=e=>e?.details?.appointmentCode||e?.details?.code||e?.code||'internal';export async function executeAppointmentCommand(command){globalThis.__agendaCommands.push(structuredClone(command));if(command.action==='availabilitySettings')return {settings:globalThis.__agendaSettings,bookingReady:false};if(command.action==='updateAvailabilitySettings'){globalThis.__agendaSettings=structuredClone(command.settings);return {settings:globalThis.__agendaSettings,bookingReady:false};}if(globalThis.__agendaCommandDelay)await new Promise(resolve=>setTimeout(resolve,globalThis.__agendaCommandDelay));if(globalThis.__agendaConflict){throw {code:'conflict',details:{appointmentCode:'conflict'}};}const event=globalThis.__agendaFixtures.find(x=>x.id===command.appointmentId);if(command.action==='create'){const id=crypto.randomUUID();globalThis.__agendaFixtures.push({id,...command.input,type:'appointment',title:'Cita médica',status:'programada'});return {appointmentId:id};}if(event&&['reschedule','update'].includes(command.action))Object.assign(event,command.input);if(event&&command.action==='cancel')event.status='cancelada';if(event&&command.action==='complete')event.status='atendida';if(event&&command.action==='confirm')event.confirmation={status:'confirmed'};return {ok:true};}`;
const mocks = new Map([
  ['/js/firebase.js',firebaseMock],
  ['/js/services/usuarios.js',`export const obtenerUsuario=async()=>({rol:'medico',nombre:'Profesional ficticio'});export const listarPacientes=async()=>({docs:[{id:'fixture-patient',data:()=>({nombre:'Persona ficticia A'})}]});`],
  ['/js/services/auditoria.js',`export const registrarEventoAuditoria=async()=>{};`],
  ['/js/services/sesion.js',`export const iniciarMonitoreoSesion=()=>{};`],
  ['/js/services/appointmentCommandService.js',commandMock],
  ['/js/services/googleCalendarService.js',`export const iniciarConexionGoogleCalendar=async()=>{};export const obtenerEstadoGoogleCalendar=async()=>{globalThis.__agendaOAuthReads++;return {connected:false,status:'not_connected'}};export const desconectarGoogleCalendar=async()=>({});`],
  ['/js/services/themeBootstrap.js',`// Theme profile service intentionally isolated; tests exercise the existing CSS tokens.`],
  ['/js/theme-preload.js',`document.documentElement.dataset.theme=globalThis.__agendaTheme;document.documentElement.dataset.themeReady='true';if(globalThis.__agendaTheme==='biocelular')import('./themes/biocellularThemeController.js').then(m=>m.activateBiocellularTheme());if(globalThis.__agendaGlobalHeader)window.addEventListener('DOMContentLoaded',()=>import('./components/globalAppHeader.js').then(m=>m.scheduleGlobalAppHeader()),{once:true});`],
  ['/js/components/accesosRapidos.js',`export const inicializarAccesosRapidos=()=>{};`],
  ['/js/components/themeSelector.js',`export const inicializarSelectorTema=()=>{};`],
  ['/js/services/profilePhotoService.js',`export const renderizarFotoPerfil=element=>{if(element)element.textContent='QA'};`],
  ['/js/reportes.js',`// Global reporting excluded from isolated Agenda QA.`]
]);
for (const [url, source] of [...mocks, ['firebase-firestore-mock', storeMock]]) {
  try { new Function(source.replace(/\bexport\s+/g, '')); }
  catch (error) { throw new Error(`Invalid QA mock ${url}: ${error.message}`); }
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disk-cache-size=1']});
  const results=[];
  try {
    const sizes=[{width:1440,height:900},{width:1366,height:768},{width:390,height:844}];
    if(phase==='after')sizes.push({width:720,height:450,deviceScaleFactor:2,equivalentReflow:'200% of 1440x900; not an actual Chrome zoom setting'});
    for(const size of sizes)for(const theme of (phase==='after'&&[1440,390].includes(size.width)?['light','dark','biocelular']:['light','dark'])){
      const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:size.deviceScaleFactor||1,timezoneId:'America/Mexico_City',reducedMotion:'reduce',locale:'es-MX',serviceWorkers:'block'});
      await context.addInitScript(({fixtures,settings,theme,phase})=>{globalThis.__agendaFixtures=fixtures;globalThis.__agendaSettings=settings;globalThis.__agendaTheme=theme;globalThis.__agendaCommands=[];globalThis.__agendaOAuthReads=0;globalThis.__agendaReads=0;globalThis.__agendaDirectWrites=[];globalThis.__agendaGlobalHeader=phase!=='before';globalThis.__agendaRenderTimings=[];const debug=console.debug.bind(console);console.debug=(message,...args)=>{if(message==='[AGENDA_TRACE] render'&&Number.isFinite(args[0]?.milliseconds))globalThis.__agendaRenderTimings.push(args[0].milliseconds);debug(message,...args);};},{fixtures,settings,theme,phase});
      const errors=[];const blocked=[];
      await context.route('**/*',async route=>{
        const u=new URL(route.request().url());const js=mocks.get(u.pathname);
        if(js!==undefined){await route.fulfill({contentType:'text/javascript',body:js});return;}
        if(u.hostname==='www.gstatic.com'&&u.pathname.endsWith('/firebase-auth.js')){await route.fulfill({contentType:'text/javascript',body:`export const onAuthStateChanged=(auth,cb)=>{setTimeout(()=>cb({uid:'fixture-doctor'}),0);return ()=>{}};`});return;}
        if(u.hostname==='www.gstatic.com'&&u.pathname.endsWith('/firebase-firestore.js')){await route.fulfill({contentType:'text/javascript',body:storeMock});return;}
        if(u.origin!==origin){blocked.push(u.hostname);await route.abort('blockedbyclient');return;}
        await route.continue();
      });
      const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.stack || e.message));
      const diagnostics=[];
      const cdp=await context.newCDPSession(page);
      await cdp.send('Runtime.enable');
      cdp.on('Runtime.exceptionThrown',({exceptionDetails})=>diagnostics.push(exceptionDetails));
      page.on('dialog',dialog=>dialog.accept());
      // Freeze the civil test date while keeping performance.now() and timers real.
      await page.clock.setFixedTime(new Date('2026-09-08T18:00:00Z'));
      await page.goto(origin+'/agenda.html',{waitUntil:'networkidle'});
      await page.waitForTimeout(200);
      await page.screenshot({path:path.join(output,`${size.width}x${size.height}-${theme}.png`),fullPage:false});
      const metrics=await page.evaluate(()=>{const target=document.querySelector('.layout')||document.querySelector('main');const computed=getComputedStyle(target);return {innerWidth,innerHeight,devicePixelRatio,visualViewportScale:visualViewport.scale,bodyZoom:getComputedStyle(document.body).zoom,rootFont:getComputedStyle(document.documentElement).fontSize,containerWidth:target.getBoundingClientRect().width,containerMaxWidth:computed.maxWidth,containerTransform:computed.transform,bodyScrollWidth:document.body.scrollWidth,calendar:document.getElementById('calendario')?.getBoundingClientRect().toJSON(),theme:document.documentElement.dataset.theme,oauthReads:globalThis.__agendaOAuthReads};});
      let scenarios=[];
      if(!errors.length&&phase==='after'&&((size.width===1440&&theme==='dark')||(size.width===390&&theme==='light'))){
        scenarios=await require('./qa-agenda-scenarios.cjs')(page,{size,output});
      }
      if(!errors.length&&phase==='after'&&size.equivalentReflow){
        const name='200% equivalent viewport reflow keeps navigation, editor and settings operable';
        try {
          await page.locator('#vistaAgenda').selectOption('day');await page.locator('#mesActual').click();
          await page.locator('#alternarSidebar').click();await page.locator('#nuevoEvento').click();
          await page.locator('#guardarEvento').scrollIntoViewIfNeeded();
          await page.screenshot({path:path.join(output,`720x450-${theme}-reflow-editor.png`)});
          await page.locator('#cancelarEdicion').click();
          await page.locator('#abrirConfiguracionAgenda').click();await page.locator('[data-timezone]').waitFor();
          await page.locator('#cerrarConfiguracionAgenda').click();
          if(await page.evaluate(()=>document.body.scrollWidth>innerWidth+1))throw Error('Page horizontal overflow at equivalent 200% reflow');
          scenarios.push({name,result:'PASS'});
        }catch(error){scenarios.push({name,result:'FAIL',error:error.message.slice(0,1000)});}
      }
      const renderTimings=await page.evaluate(()=>globalThis.__agendaRenderTimings);
      const computed=await page.evaluate(()=>Object.fromEntries(['.time-slot','.navbar-global-unificada','.navbar-global-contenido','.agenda-filters label','.event-editor','.calendar-event small'].map(selector=>{const el=document.querySelector(selector);if(!el)return [selector,null];const css=getComputedStyle(el);return [selector,{height:css.height,width:css.width,padding:css.padding,margin:css.margin,border:css.border,borderRadius:css.borderRadius,display:css.display,minHeight:css.minHeight,maxWidth:css.maxWidth,color:css.color,background:css.backgroundColor}];})));
      results.push({size,theme,errors,blocked,metrics,scenarios,renderTimings,computed,diagnostics});
      await context.close();
    }
    fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify({phase,output,results},null,2));
    if(results.some(result=>result.errors.length||result.scenarios.some(test=>test.result==='FAIL')))process.exitCode=1;
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
