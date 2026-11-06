export async function readWithDeadline(operation, timeoutMs = 15000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('A consulta excedeu o tempo de espera. Reduza o período ou consulte uma turma por vez.'));
          controller.abort();
        }, timeoutMs);
      })
    ]);
  } finally { clearTimeout(timer); }
}

// Compartilha apenas consultas em andamento: não guarda relatórios antigos.
export function createReadCoordinator(limit = 6) {
  const pending = new Map();
  const queue = [];
  let active = 0;
  function drain() {
    while (active < limit && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active--;
        drain();
      });
    }
  }
  return function read(name, args, task) {
    const key = JSON.stringify([name, Object.entries(args || {}).sort(([a], [b]) => a.localeCompare(b))]);
    if (pending.has(key)) return pending.get(key);
    const request = new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
    });
    const tracked = request.finally(() => pending.delete(key));
    pending.set(key, tracked);
    drain();
    return tracked;
  };
}

// Mantém a ordem dos alunos sem abrir centenas de consultas de uma vez.
export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
