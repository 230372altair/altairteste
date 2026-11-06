import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadCoordinator, mapWithConcurrency } from '../public/report-requests.js';

test('consultas iguais compartilham o pedido em andamento, mas consultam novamente depois', async () => {
  const read = createReadCoordinator(2);
  let resolve;
  let calls = 0;
  const task = () => { calls++; return new Promise(r => { resolve = r; }); };
  const first = read('relatorio', { turma: '601', ano: 2026 }, task);
  const second = read('relatorio', { ano: 2026, turma: '601' }, task);
  assert.equal(first, second);
  await Promise.resolve();
  resolve(['novo']);
  assert.deepEqual(await first, ['novo']);
  assert.equal(calls, 1);
  assert.deepEqual(await read('relatorio', { turma: '601', ano: 2026 }, () => ['atualizado']), ['atualizado']);
});

test('fila respeita o limite e continua após falha', async () => {
  const read = createReadCoordinator(2);
  let active = 0;
  let maximum = 0;
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => read('relatorio', { i }, async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(r => setTimeout(r, 2));
    active--;
    if (i === 0) throw new Error('falha simulada');
    return i;
  })));
  assert.equal(maximum, 2);
  assert.equal(outcomes[0].status, 'rejected');
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 11);
  assert.equal(await read('relatorio', { i: 0 }, () => 'recuperado'), 'recuperado');
});

test('relatório em lote preserva a ordem, limita alunos simultâneos e aceita lista vazia', async () => {
  let active = 0;
  let maximum = 0;
  const result = await mapWithConcurrency([5, 4, 3, 2, 1], 3, async value => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(r => setTimeout(r, value));
    active--;
    return value * 2;
  });
  assert.equal(maximum, 3);
  assert.deepEqual(result, [10, 8, 6, 4, 2]);
  assert.deepEqual(await mapWithConcurrency([], 3, () => assert.fail()), []);
});
