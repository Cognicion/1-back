// Read-only: query planning on a nonexistent synthetic parent, no patient reads.
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
async function main() {
  const token = execFileSync('cmd.exe', ['/d', '/c', 'gcloud.cmd auth print-access-token'], { encoding: 'utf8', windowsHide: true }).trim();
  const base = 'https://firestore.googleapis.com/v1/projects/cognicion-57052/databases/(default)/documents';
  for (const [name, fields] of Object.entries({ civil: [['startDate', 'LESS_THAN_OR_EQUAL', '2026-09-30'], ['endDate', 'GREATER_THAN_OR_EQUAL', '2026-09-01']], civilExplicit: [['startDate', 'LESS_THAN_OR_EQUAL', '2026-09-30'], ['endDate', 'GREATER_THAN_OR_EQUAL', '2026-09-01']], modernExplicit: [['startAt','LESS_THAN','2026-09-30T00:00:00Z'],['endAt','GREATER_THAN','2026-09-01T00:00:00Z']], legacy: [['fecha', 'GREATER_THAN_OR_EQUAL', '2026-09-01'], ['fecha', 'LESS_THAN_OR_EQUAL', '2026-09-30']] })) {
    const query = { from: [{ collectionId: 'agenda' }], where: { compositeFilter: { op: 'AND', filters: fields.map(([fieldPath, op, stringValue]) => ({ fieldFilter: { field: { fieldPath }, op, value: { stringValue } } })) } }, limit: 1 };
    if(name.endsWith('Explicit'))query.orderBy=fields.map(([fieldPath])=>({field:{fieldPath},direction:'ASCENDING'}));
    if(name==='modernExplicit')query.where.compositeFilter.filters.forEach(f=>{f.fieldFilter.value={timestampValue:f.fieldFilter.value.stringValue};});
    const res = await fetch(base + '/usuarios/qa-agenda-query-plan-only:runQuery', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ structuredQuery: query, explainOptions: { analyze: false } }) });
    const json = await res.json();
    const error = Array.isArray(json) ? json.find(x => x.error)?.error : json.error;
    console.log(JSON.stringify({ source: name, operation: 'runQuery/explain', scope: 'COLLECTION', collection: 'agenda', fields: fields.map(([field, op]) => ({ field, op })), http: res.status, code: error?.status, message: error ? (/requires an index/i.test(error.message) ? 'Query requires a composite index' : String(error.message).replace(/https?:\/\/\S+/g, '[index-console-link]').slice(0, 1000)) : 'Query plan accepted', plan: json?.[0]?.explainMetrics?.planSummary }));
  }
  for (const file of ['agenda.html', 'js/agenda.js', 'js/config/appVersion.js', 'functions/appointments/recurrence.mjs']) {
    const res = await fetch('https://cognicionlabs.com/' + file, { cache: 'no-store' });
    const body = await res.text();
    const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
    const local = fs.readFileSync(path.join(root, file), 'utf8');
    const committed = execFileSync('git', ['show', 'HEAD:' + file], { cwd: root, encoding: 'utf8' });
    console.log(JSON.stringify({ file, status: res.status, localHash: hash(local), headHash: hash(committed), servedHash: hash(body), servedVersion: body.match(/APP_VERSION = "([^"]+)"/)?.[1], servedAgendaRef: body.match(/src="(js\/agenda\.js[^\"]+)"/)?.[1] }));
  }
}
main().catch(() => { console.error('Read-only audit failed; no credentials or response bodies logged'); process.exitCode = 1; });
