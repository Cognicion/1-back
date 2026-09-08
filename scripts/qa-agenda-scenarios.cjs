/* Browser-level interaction checks. All service calls use the in-memory mocks
 * installed by qa-agenda-visual.cjs. This never authenticates a real user. */
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function runAgendaScenarios(page, { size, output }) {
  const results = [];
  const check = async (name, task) => {
    try { await task(); results.push({ name, result: 'PASS' }); }
    catch (error) { results.push({ name, result: 'FAIL', error: error.message.slice(0, 1000) }); }
  };
  const desktop = size.width > 800;
  const closed = async selector => {
    await page.waitForFunction(selector => !document.querySelector(selector)?.open, selector);
  };
  const screenshot = name => page.screenshot({ path: path.join(output, `${size.width}x${size.height}-${name}.png`) });
  const queryCount = () => page.evaluate(() => globalThis.__agendaReads);
  const showSidebar = async () => { if (!await page.locator('#nuevoEvento').isVisible()) await page.locator('#alternarSidebar').click(); };
  const closeSidebar = async () => { if (await page.locator('#cerrarSidebar').isVisible()) await page.locator('#cerrarSidebar').click({ position: { x: size.width - 10, y: 10 } }); };

  await check('Initial workspace, viewport and deferred editor/settings', async () => {
    assert.equal(await page.locator('#vistaAgenda').inputValue(), desktop ? 'week' : 'day');
    assert.equal(await page.locator('#editorAgenda').evaluate(el => el.open), false);
    assert.equal(await page.locator('#configuracionAgenda').evaluate(el => el.open), false);
    const metrics = await page.evaluate(() => ({ w: innerWidth, scrollWidth: document.body.scrollWidth, calendarTop: document.getElementById('calendario').getBoundingClientRect().top }));
    assert.ok(metrics.calendarTop < 260, `Calendar must start in first screen: ${metrics.calendarTop}`);
    assert.ok(metrics.scrollWidth <= metrics.w + 1, `Page horizontal overflow: ${metrics.scrollWidth}>${metrics.w}`);
  });
  await check('Time slots remain a continuous grid at rest and on hover', async () => {
    const slot = page.locator('.time-slot[data-create-date="2026-09-08"][data-time="08:30"]');
    const appearance = () => slot.evaluate(el => { const css = getComputedStyle(el); return { height: el.getBoundingClientRect().height, radius: css.borderRadius, shadow: css.boxShadow, transform: css.transform }; });
    for (const hover of [false, true]) {
      if (hover) await slot.hover();
      const css = await appearance();
      assert.ok(css.height <= 32.1, `Half-hour row height ${css.height}`);
      assert.equal(css.radius, '0px');
      assert.equal(css.shadow, 'none');
      assert.equal(css.transform, 'none');
    }
  });
  await check('Four actual views preserve already-loaded source and visual preference', async () => {
    const reads = await queryCount();
    for (const view of ['day', 'week', 'month', 'list']) {
      await page.locator('#vistaAgenda').selectOption(view);
      assert.equal(await page.locator('#vistaAgenda').inputValue(), view);
      assert.ok((await page.locator('#calendario').innerText()).trim().length > 0);
    }
    assert.equal(await queryCount(), reads, 'View change should reuse loaded date range');
    const stored = await page.evaluate(() => Object.entries(localStorage));
    assert.ok(stored.some(([key, value]) => /agenda/i.test(key) && value.includes('list')), 'List visual preference stored');
    assert.ok(!stored.some(([, value]) => /fixture-patient|Persona ficticia|fixture-appointment/.test(value)), 'No patient/event storage');
  });
  await check('Previous/next and Today act on the current view', async () => {
    await page.locator('#vistaAgenda').selectOption('week');
    await page.locator('#mesActual').click();
    const initial = await page.locator('#tituloMes').innerText();
    await page.locator('#mesSiguiente').click();
    assert.notEqual(await page.locator('#tituloMes').innerText(), initial);
    await page.locator('#mesAnterior').click();
    assert.equal(await page.locator('#tituloMes').innerText(), initial);
    await page.locator('#mesSiguiente').click();
    await page.locator('#mesActual').click();
    assert.equal(await page.locator('#tituloMes').innerText(), initial);
  });
  await check('Create opens the reused editor; Escape restores focus', async () => {
    const create = page.locator('#nuevoEvento');
    if (!await create.isVisible()) await page.locator('#alternarSidebar').click();
    await create.click();
    assert.equal(await page.locator('#editorAgenda').evaluate(el => el.open), true);
    assert.equal(await page.locator('#formCita').count(), 1);
    assert.equal(await page.locator('#eventoId').inputValue(), '');
    await screenshot('editor');
    await page.keyboard.press('Escape');
    await closed('#editorAgenda');
    assert.equal(await page.locator(desktop ? '#nuevoEvento' : '#alternarSidebar').evaluate(el => el === document.activeElement), true);
  });
  await check('Mini calendar date selection and arrow-key navigation', async () => {
    await showSidebar();
    const day = page.locator('[data-mini-date="2026-09-09"]');
    await day.click();
    assert.equal(await day.getAttribute('aria-pressed'), 'true');
    await showSidebar();
    await day.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.miniDate), '2026-09-10');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-mini-date="2026-09-10"]').getAttribute('aria-pressed'), 'true');
    await closeSidebar();
    await page.locator('#mesActual').click();
  });
  await check('Filters only affect presentation; blockers and source documents remain', async () => {
    await page.locator('#vistaAgenda').selectOption('week');
    const before = await page.evaluate(() => ({ fixtures: JSON.stringify(__agendaFixtures), commands: __agendaCommands.length, reads: __agendaReads }));
    assert.ok(await page.locator('#calendario .calendar-event.group-block').count());
    await showSidebar();
    await page.locator('[data-filter-group="block"]').uncheck();
    assert.equal(await page.locator('#calendario .calendar-event.group-block').count(), 0);
    assert.deepEqual(await page.evaluate(() => ({ fixtures: JSON.stringify(__agendaFixtures), commands: __agendaCommands.length, reads: __agendaReads })), before);
    await page.locator('[data-filter-group="block"]').check();
    await closeSidebar();
  });
  await check('Time slot preselects date and time in the same reusable editor', async () => {
    await page.locator('#vistaAgenda').selectOption('day');
    await page.locator('#mesActual').click();
    await page.locator('[data-create-date="2026-09-08"][data-time="08:30"]').click();
    assert.equal(await page.locator('#editorAgenda').evaluate(el => el.open), true);
    assert.equal(await page.locator('#fechaCita').inputValue(), '2026-09-08');
    assert.equal(await page.locator('#horaCita').inputValue(), '08:30');
    assert.equal(await page.locator('#formCita').count(), 1);
    await page.keyboard.press('Escape');
    await closed('#editorAgenda');
  });
  await check('Simultaneous events occupy separate columns with truthful duration', async () => {
    const first = page.locator('#calendario [data-segment^="fixture-event@@"]');
    const second = page.locator('#calendario [data-segment^="fixture-overlap@@"]');
    const a = await first.boundingBox(), b = await second.boundingBox();
    assert.ok(a && b);
    assert.ok(a.x + a.width <= b.x + 3 || b.x + b.width <= a.x + 3, 'Overlapping intervals have separate columns');
    assert.ok(Math.abs(a.height / b.height - 1.5) < .1, `90/60 minute height ratio: ${a.height}/${b.height}`);
  });
  await check('A five-minute event retains its true height and remains selectable', async () => {
    const event = page.locator('#calendario [data-segment^="fixture-short@@"]');
    const box = await event.boundingBox();
    assert.ok(box && Math.abs(box.height - 64 * 5 / 60) < 1, `Five minutes must occupy about 5.33px: ${box?.height}`);
    await event.click();
    assert.equal(await page.locator('#detalleAgenda').evaluate(el => el.open), true);
    assert.match(await page.locator('#tituloDetalle').innerText(), /breve/);
    await page.keyboard.press('Escape');
    await closed('#detalleAgenda');
  });
  await check('Night shift splits at midnight without duplicating the source document', async () => {
    await page.locator('#vistaAgenda').selectOption('week');
    assert.equal(await page.locator('#calendario [data-segment^="fixture-night@@"]').count(), 2);
    assert.equal(await page.evaluate(() => __agendaFixtures.filter(e => e.id === 'fixture-night').length), 1);
    assert.equal(await page.locator('#calendario [data-segment^="fixture-multiday@@"]').count(), 3);
  });
  await check('Settings opens on demand, preserves navigation, and restores focus', async () => {
    await page.locator('#vistaAgenda').selectOption('month');
    const title = await page.locator('#tituloMes').innerText();
    await page.locator('#abrirConfiguracionAgenda').click();
    assert.equal(await page.locator('#configuracionAgenda').evaluate(el => el.open), true);
    await page.locator('[data-timezone]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-timezone]').inputValue(), 'America/Mexico_City');
    assert.equal(await page.locator('[data-weekly-schedule] [data-day]').count(), 7);
    await screenshot('settings');
    await page.locator('#cerrarConfiguracionAgenda').click();
    await closed('#configuracionAgenda');
    assert.equal(await page.locator('#vistaAgenda').inputValue(), 'month');
    assert.equal(await page.locator('#tituloMes').innerText(), title);
    assert.equal(await page.locator('#abrirConfiguracionAgenda').evaluate(el => el === document.activeElement), true);
  });
  await check('Month screenshot and keyboard focus remain usable', async () => {
    await page.locator('#vistaAgenda').selectOption('month');
    await page.locator('#mesActual').click();
    await screenshot('month');
    await page.locator('#mesActual').focus();
    await page.keyboard.press('Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY');
    assert.ok(await page.evaluate(() => document.activeElement?.matches('button,input,select,a,[tabindex]')), 'Keyboard focus reaches an operable control');
  });
  await check('Month overflow opens a contextual list containing every event for that day', async () => {
    await page.locator('[data-more-date="2026-09-14"]').click();
    assert.equal(await page.locator('#detalleAgenda').evaluate(el => el.open), true);
    assert.equal(await page.locator('#detalleAgenda .day-event-row').count(), 6);
    await page.keyboard.press('Escape');
    await closed('#detalleAgenda');
  });
  await check('Availability save and reload persist the edited schedule through the existing command', async () => {
    await page.locator('#abrirConfiguracionAgenda').click();
    await page.locator('[data-settings-section="availability"]').click();
    await page.locator('[data-day="monday"] [data-end]').fill('18:00');
    await page.locator('[data-save-availability]').click();
    await page.waitForFunction(() => __agendaCommands.some(command => command.action === 'updateAvailabilitySettings'));
    assert.equal(await page.evaluate(() => __agendaSettings.weeklySchedule.monday[0].end), '18:00');
    await page.locator('[data-day="monday"] [data-end]').fill('19:00');
    await page.locator('[data-reload-availability]').click();
    await page.waitForFunction(() => document.querySelector('[data-day="monday"] [data-end]').value === '18:00');
    assert.equal(await page.locator('[data-day="sunday"] .working-interval').count(), 0, 'Closed days keep zero intervals');
    await page.locator('#cerrarConfiguracionAgenda').click();
  });
  await check('Appointment creation uses the existing command and prevents duplicate submission', async () => {
    await page.locator('#vistaAgenda').selectOption('day');
    await page.locator('#mesActual').click();
    await showSidebar();
    await page.locator('#nuevaCita').click();
    await page.locator('#pacienteCita').selectOption('fixture-patient');
    await page.locator('#horaCita').fill('15:30');
    await page.locator('#duracionEvento').fill('30');
    await page.evaluate(() => { __agendaCommandDelay = 200; });
    await page.locator('#guardarEvento').click();
    assert.equal(await page.locator('#guardarEvento').isDisabled(), true);
    await page.evaluate(() => document.getElementById('formCita').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await closed('#editorAgenda');
    const commands = await page.evaluate(() => __agendaCommands.filter(command => command.action === 'create'));
    assert.equal(commands.length, 1, 'Only one create command in flight');
    assert.equal(commands[0].input.patientId, 'fixture-patient');
    assert.equal(commands[0].input.startTime, '15:30');
    assert.ok(commands[0].requestId);
    assert.equal(await page.evaluate(() => __agendaDirectWrites.length), 0);
    await page.evaluate(() => { __agendaCommandDelay = 0; });
  });
  await check('Reschedule conflict preserves the source and editor; retry reuses the request ID', async () => {
    await page.locator('#calendario [data-segment^="fixture-appointment@@"]').click();
    await page.locator('#detalleAgenda [data-action="edit"]').click();
    assert.equal(await page.locator('#eventoId').inputValue(), 'fixture-appointment');
    await page.locator('#horaCita').fill('10:00');
    await page.locator('#horaFinEvento').fill('11:00');
    await page.evaluate(() => { __agendaConflict = true; });
    await page.locator('#guardarEvento').click();
    await page.waitForFunction(() => document.querySelector('#estadoEditor')?.textContent.includes('horario original'));
    assert.equal(await page.locator('#editorAgenda').evaluate(el => el.open), true);
    assert.equal(await page.locator('#horaCita').inputValue(), '10:00');
    assert.equal(await page.evaluate(() => __agendaFixtures.find(event => event.id === 'fixture-appointment').startTime), '09:00');
    assert.equal(await page.locator('#calendario [data-segment^="fixture-appointment@@"]').count(), 1);
    await screenshot('reschedule-conflict');
    await page.evaluate(() => { __agendaConflict = false; });
    await page.locator('#guardarEvento').click();
    await closed('#editorAgenda');
    const commands = await page.evaluate(() => __agendaCommands.filter(command => command.action === 'reschedule'));
    assert.equal(commands.length, 2);
    assert.equal(commands[0].requestId, commands[1].requestId);
    assert.equal(await page.evaluate(() => __agendaFixtures.find(event => event.id === 'fixture-appointment').startTime), '10:00');
    assert.equal(await page.evaluate(() => __agendaDirectWrites.length), 0);
  });
  await check('Cancellation is a domain operation and keeps the source document', async () => {
    await page.locator('#calendario [data-segment^="fixture-appointment@@"]').click();
    assert.equal(await page.locator('#detalleAgenda [data-action="delete"]').count(), 0);
    await page.locator('#detalleAgenda [data-action="cancel"]').click();
    await closed('#detalleAgenda');
    assert.equal(await page.evaluate(() => __agendaFixtures.find(event => event.id === 'fixture-appointment')?.status), 'cancelada');
    assert.equal(await page.evaluate(() => __agendaCommands.filter(command => command.action === 'cancel').length), 1);
    assert.equal(await page.evaluate(() => __agendaDirectWrites.length), 0);
  });
  await check('OAuth return opens Integrations, cleans parameters and trusts the backend status', async () => {
    const origin = new URL(page.url()).origin;
    await page.goto(origin + '/agenda.html?googleCalendar=connected#configuracionAgenda', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[data-google-calendar-status]')?.textContent === 'Google Calendar no conectado.');
    assert.equal(await page.locator('#configuracionAgenda').evaluate(el => el.open), true);
    assert.equal(await page.locator('[data-settings-section="integrations"]').getAttribute('aria-pressed'), 'true');
    assert.equal(new URL(page.url()).search, '');
    assert.equal(new URL(page.url()).hash, '#configuracionAgenda');
    assert.equal(await page.evaluate(() => __agendaOAuthReads), 1);
    await page.locator('#cerrarConfiguracionAgenda').click();
    await page.locator('#vistaAgenda').selectOption('day');
    await page.locator('#vistaAgenda').selectOption('week');
    assert.equal(await page.evaluate(() => __agendaOAuthReads), 1, 'View rendering does not repeat OAuth requests');
  });
  await check('Delayed reads from an earlier range cannot overwrite the latest navigation', async () => {
    await page.locator('#vistaAgenda').selectOption('month');
    await page.locator('#mesActual').click();
    await page.evaluate(() => { __agendaFixtures.push({ id:'fixture-race',type:'event',title:'Respuesta actual de prueba',startDate:'2027-09-10',endDate:'2027-09-10',startTime:'10:00',endTime:'11:00',durationMinutes:60,status:'programada' });__agendaReadDelay=500; });
    await showSidebar();
    for (let i=0;i<6;i++) await page.locator('#miniSiguiente').click();
    await page.locator('[data-mini-date="2027-03-10"]').click();
    await page.evaluate(() => { __agendaReadDelay=0; });
    await showSidebar();
    for (let i=0;i<6;i++) await page.locator('#miniSiguiente').click();
    await page.locator('[data-mini-date="2027-09-10"]').click();
    await page.locator('#calendario [data-segment^="fixture-race@@"]').waitFor();
    await page.waitForTimeout(550);
    assert.equal(await page.locator('#calendario [data-segment^="fixture-race@@"]').count(), 1);
    assert.match(await page.locator('#tituloMes').innerText(), /2027/);
    await closeSidebar();
  });
  await check('Query errors show an explicit retry state and never pretend the range is empty', async () => {
    await page.evaluate(() => { __agendaReadError=true; });
    await showSidebar();
    for (let i=0;i<6;i++) await page.locator('#miniSiguiente').click();
    await page.locator('[data-mini-date="2028-03-10"]').click();
    await closeSidebar();
    await page.locator('#reintentarAgenda').waitFor({ state:'visible' });
    assert.match(await page.locator('#estadoCalendario').innerText(), /cargar|carga|consulta/i);
    assert.doesNotMatch(await page.locator('#estadoCalendario').innerText(), /^No hay eventos/i);
    await page.evaluate(() => { __agendaReadError=false; });
    await page.locator('#reintentarAgenda').click();
    await page.locator('#reintentarAgenda').waitFor({ state:'hidden' });
    await page.locator('#mesActual').click();
  });
  return results;
};
