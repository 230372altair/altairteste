import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve('public');
const server = http.createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    const file = resolve(root, relative);
    if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) throw new Error('caminho inválido');
    const body = await readFile(file);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
await context.route('**/*', async route => {
  const url = route.request().url();
  if (url.includes('esm.sh/@supabase/supabase-js')) return route.fulfill({ contentType: 'text/javascript', body: `
    export function createClient() {
      window.__calls = [];
      window.__active = 0; window.__maxActive = 0;
      return {
        auth: { getSession: async () => ({ data: { session: { user: { email: 'teste@example.invalid' } } } }), onAuthStateChange() {}, signOut: async () => ({}) },
        rpc: async (name, args) => {
          window.__calls.push({ name, args });
          window.__active++; window.__maxActive = Math.max(window.__maxActive, window.__active);
          await new Promise(r => setTimeout(r, 25)); window.__active--;
          const base = { turma: '601', coordenacao_codigo: 'EF', coordenacao_nome: 'Ensino Fundamental', turno: 'Matutino', total_alunos_ativos: 30, total_p: 120, total_f: 8, total_lancamentos: 128 };
          if (name === 'fn_ranking_turmas_faltas_parametrizado' && window.__rankingFailure) return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
          let data = [];
          if (name === 'fn_iee_acesso_autorizado') data = true;
          if (name === 'fn_iee_painel_resumo_turmas' || name === 'fn_ranking_turmas_faltas_parametrizado' || name === 'fn_frequencia_diaria_parametrizada') data = [base];
          if (name === 'fn_relatorio_apoia_parametrizado') data = Array.from({ length: 12 }, (_, i) => ({ turma: base.turma, coordenacao_nome: base.coordenacao_nome, aluno_nome: 'Estudante fictício ' + i, matricula: 'TESTE-' + i, faltas_no_periodo: 8, maior_sequencia: 5, criterio_acionamento: 'CONSEC' }));
          return { data, error: null };
        }
      };
    }
  ` });
  if (url.endsWith('/supabase-config.js')) return route.fulfill({ contentType: 'text/javascript', body: 'export const SUPABASE_URL="https://example.invalid"; export const SUPABASE_PUBLISHABLE_KEY="teste"; export const ANO_LETIVO=2026;' });
  if (!url.startsWith(origin)) return route.abort();
  // Arquivos locais também são respondidos pelo teste, sem acessar a rede.
  const relative = decodeURIComponent(new URL(url).pathname).slice(1) || 'index.html';
  const file = resolve(root, relative);
  if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) return route.abort();
  try {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
    return route.fulfill({ contentType: types[extname(file)] || 'application/octet-stream', body: await readFile(file) });
  } catch { return route.fulfill({ status: 404, body: '' }); }
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
async function openView(view) {
  if (page.viewportSize().width <= 900) await page.locator('#mobile-menu-toggle').click();
  await page.locator(`#mobile-navigation .nav-button[data-view="${view}"]`).first().click();
  await page.waitForFunction(() => document.querySelector('#loading').classList.contains('hidden'));
}
try {
  await page.goto(origin);
  await page.waitForFunction(() => !document.querySelector('#app-view').classList.contains('hidden') && document.querySelector('#loading').classList.contains('hidden'));
  const startup = await page.evaluate(() => window.__calls.map(r => r.name));
  assert.deepEqual(startup.sort(), ['fn_iee_acesso_autorizado', 'fn_iee_painel_resumo_turmas', 'fn_painel_cache_frequencia'].sort());
  await openView('dashboard');
  assert.equal(await page.evaluate(() => window.__calls.filter(r => r.name === 'fn_ranking_turmas_faltas_parametrizado').length), 0);
  assert.match(await page.locator('#dashboard-data-status').innerText(), /datas não são aplicadas/);
  await page.locator('#apply-filters').click();
  await page.waitForFunction(() => document.querySelector('#loading').classList.contains('hidden'));
  assert.match(await page.locator('#dashboard-data-status').innerText(), /concluído para as datas/);
  assert.equal(await page.locator('#class-table-body tr').count(), 1);
  assert.match(await page.locator('#class-table-body').innerText(), /601/);
  await page.evaluate(() => { window.__rankingFailure = true; });
  await page.locator('#apply-filters').click();
  await page.waitForFunction(() => document.querySelector('#loading').classList.contains('hidden'));
  assert.match(await page.locator('#dashboard-data-status').innerText(), /Consulta não concluída/);
  assert.match(await page.locator('#dashboard-data-status').innerText(), /último relatório concluído/);
  await page.locator('#dashboard-consolidated').click();
  await page.waitForFunction(() => document.querySelector('#loading').classList.contains('hidden'));
  assert.match(await page.locator('#dash-eva-periodo').innerText(), /sem filtro por datas/);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true, animations: 'disabled' });
  const layouts = [];
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, input: document.querySelector('#dashboard-student-search').getBoundingClientRect().width, container: document.querySelector('.dashboard-filter-card').getBoundingClientRect().width }));
    assert.ok(layout.page <= width + 1, JSON.stringify(layout));
    assert.ok(layout.input <= layout.container, JSON.stringify(layout));
    layouts.push(layout);
    if (width === 390) await page.screenshot({ path: 'test-results/mobile.png', fullPage: true, animations: 'disabled' });
  }
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('.mobile-logout').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded'), 'false');
  await openView('daily-attendance');
  await page.locator('#daily-apply').click();
  await page.waitForFunction(() => document.querySelector('#loading').classList.contains('hidden'));
  assert.match(await page.locator('#daily-kpi-total').innerText(), /30/);
  await openView('absence-alert');
  await page.locator('#absence-alert-generate').click();
  await page.waitForFunction(() => document.querySelector('#loading').classList.contains('hidden'));
  assert.equal(await page.locator('#absence-alert-body tr').count(), 12);
  assert.equal(await page.locator('#absence-alert-max').innerText(), '8');
  assert.equal(await page.locator('#absence-alert-body tr').first().locator('td').nth(4).innerText(), '8');
  assert.equal(await page.locator('#absence-alert-body tr').first().locator('td').nth(5).innerText(), '5');
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#absence-council-report-all').click();
  const popup = await popupPromise;
  popup.on('pageerror', e => errors.push(e.message));
  await popup.waitForSelector('.page');
  assert.equal(await popup.locator('.page').count(), 12);
  const maxActive = await page.evaluate(() => window.__maxActive);
  assert.ok(maxActive <= 6, String(maxActive));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ startupQueries: startup.length, layouts, councilStudents: 12, maxConcurrentQueries: maxActive, errors }, null, 2));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
