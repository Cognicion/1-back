const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const files=process.env.BOT_ONLY==='1'?['tests/whatsapp-bot-emulator.test.mjs']:fs.readdirSync(path.join(root,'tests')).filter(x=>/^(appointment-|agenda-|google-calendar-|whatsapp-bot-).*\.test\.mjs$/.test(x)).map(x=>'tests/'+x).concat(['functions/test/whatsappWebhook.test.js','functions/test/emulator/whatsappWebhook.test.mjs']);
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true});
fs.writeFileSync(path.join(root,'.tmp/bot-tests/results.txt'),result.stdout+'\n'+result.stderr);
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exit(result.status??1);
