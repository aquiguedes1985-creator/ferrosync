const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const profile = path.resolve(process.env.DEMO_PROFILE || 'perfil-github-demo');
const artifacts = path.resolve(process.env.ARTIFACT_DIR || 'artifacts/operacion');
const users = [
  { name: 'GitHub Maquinista Uno', role: 'Maquinista' },
  { name: 'GitHub Maquinista Dos', role: 'Maquinista' },
  { name: 'GitHub Logística', role: 'Logística' }
];
const password = 'FerroGitHub2026!'; // Credencial exclusiva de la demostración local.
let context;

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Montevideo'
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(baseURL);
  await page.waitForFunction(() => window.ferroReady);
  if (await page.locator('#company-screen').isVisible()) {
    await page.locator('[onclick="selectCompany(\'RAS\', this)"]').click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  } else if (await page.evaluate(() => currentCompany !== 'RAS')) {
    await page.locator('#form-login [onclick="volverAEmpresa()"] ').click();
    await page.locator('[onclick="selectCompany(\'RAS\', this)"]').click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  }
  for (const user of users) {
    if (await page.evaluate(name => usuariosBD.some(u => u.empresa === 'RAS' && u.name === name), user.name)) continue;
    await page.locator('#form-login [onclick="toggleAuthMode(\'register\')"]').click();
    await page.locator(`#form-register [onclick="selectRegRole('${user.role}', this)"]`).click();
    await page.locator('#reg-name').fill(user.name);
    await page.locator('#reg-pass').fill(password);
    await page.getByRole('button', { name: 'Registrarse', exact: true }).click();
    await page.locator('#form-login').waitFor({ state: 'visible' });
  }
  async function login(name) {
    await page.locator('#login-name').fill(name);
    await page.locator('#login-pass').fill(password);
    await page.getByRole('button', { name: 'Ingresar al Sistema', exact: true }).click();
    await page.locator('#main-app').waitFor({ state: 'visible' });
  }
  async function logout() { await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); }
  await login(users[2].name);
  const start = Date.now() + 2 * 60000;
  const plans = [
    { id: 'GH-001', loco: 'RAS-01', conductor: users[0].name, origin: '0', destination: '6', ton: '400', description: 'Prueba GitHub: Puerto — Florida', departure: start },
    { id: 'GH-002', loco: 'RAS-02', conductor: users[1].name, origin: '6', destination: '7', ton: '500', description: 'Prueba GitHub: Florida — Durazno', departure: start + 3 * 3600000 }
  ];
  for (const plan of plans) {
    if (await page.evaluate(id => trenesActivos.some(t => t.empresa === 'RAS' && t.nroPlan === id), plan.id)) continue;
    await page.locator('#nav-logistica .nav-item').nth(1).click();
    await page.getByRole('button', { name: 'Nueva planificación / cancelar edición' }).click();
    // Dar formato en la zona horaria del navegador, también en equipos fuera de Uruguay.
    const times = await page.evaluate(departure => {
      const local = millis => { const d = new Date(millis); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString(); };
      return { from: local(departure), to: local(departure + 2 * 3600000) };
    }, plan.departure);
    const fields = { 'd-id': plan.id, 'd-desc': plan.description, 'd-tonelaje': plan.ton, 'd-f-ini': times.from.slice(0, 10), 'd-h-ini': times.from.slice(11, 16), 'd-f-fin': times.to.slice(0, 10), 'd-h-fin': times.to.slice(11, 16) };
    for (const [id, value] of Object.entries(fields)) await page.locator('#' + id).fill(value);
    await page.locator('#d-locomotora').selectOption(plan.loco);
    await page.locator('#d-conductor').selectOption(plan.conductor);
    await page.locator('[id^="tl-ori-"]').selectOption(plan.origin);
    await page.locator('[id^="tl-dst-"]').selectOption(plan.destination);
    await page.getByRole('button', { name: 'Guardar Planificación' }).click();
    await page.locator('#panel-dashboard.active').waitFor();
  }
  assert.equal(await page.evaluate(() => trenesActivos.filter(t => t.empresa === 'RAS' && ['GH-001', 'GH-002'].includes(t.nroPlan)).length), 2);
  // Verificar la asignación del segundo maquinista sin iniciar su locomotora.
  await logout(); await login(users[1].name);
  assert.match(await page.locator('#maq-tren-id').textContent(), /GH-002/);
  await logout(); await login(users[0].name);
  assert.match(await page.locator('#maq-tren-id').textContent(), /GH-001/);
  if (await page.locator('#maq-tramo-inicio').isVisible()) {
    await page.locator('#maq-comb-inicio').fill('1800');
    await page.getByRole('button', { name: 'Iniciar Tramo y Activar GPS' }).click();
    await page.locator('#maq-tramo-fin').waitFor({ state: 'visible' });
  }
  await page.waitForFunction(() => miTren.estado === 'En Tránsito' && currTramo.estado === 'En Curso');
  await page.reload(); await page.waitForFunction(() => window.ferroReady); await login(users[0].name);
  await page.locator('#maq-tramo-fin').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('maq-timer').textContent !== '00:00:00');
  assert.equal(await page.evaluate(() => currTramo.combInicio), 1800);
  await page.screenshot({ path: path.join(artifacts, 'locomotora-en-marcha.png'), fullPage: true, animations: 'disabled' });
  const gpsStatus = await page.locator('#gps-status').textContent();
  await logout(); await login(users[2].name);
  assert.equal(await page.locator('#kpi-activos').textContent(), '1');
  assert.equal(await page.locator('#kpi-prog').textContent(), '1');
  await page.screenshot({ path: path.join(artifacts, 'panel-operacion.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, 'panel-celular.png'), fullPage: true, animations: 'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const state = await page.evaluate(() => ({ usuarios: usuariosBD.map(({ name, role, empresa }) => ({ name, role, empresa })), viajes: trenesActivos }));
  assert.equal(state.viajes.find(t => t.nroPlan === 'GH-002').estado, 'Programado');
  assert.deepEqual(errors, []);
  const result = { at: new Date().toISOString(), baseURL, gpsStatus, checks: ['Registro por interfaz de dos maquinistas y un operador logístico', 'Creación de dos viajes por interfaz', 'Asignación verificada con ambos maquinistas', 'Inicio de RAS-01 con 1800 litros de ejemplo', 'Estado y cronómetro recuperados al recargar', 'Logística muestra un viaje en tránsito y otro programado', 'Vista móvil sin desborde'], ...state, errors };
  fs.writeFileSync(path.join(artifacts, 'resultado.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (context) await context.close(); });
