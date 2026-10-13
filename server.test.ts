import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMockServer, validateRoutes } from './server.ts';

 test('validates route configuration', () => {
  assert.deepEqual(validateRoutes([{ method: 'GET', path: '/users', body: [] }]), [{ method: 'GET', path: '/users', body: [] }]);
  for (const value of [null, {}, [{ method: 'BAD', path: '/x', body: {} }], [{ method: 'GET', path: 'x', body: {} }], [{ method: 'GET', path: '/x', status: 99, body: {} }], [{ method: 'GET', path: '/x', delay: -1, body: {} }], [{ method: 'GET', path: '/x' }], [{ method: 'GET', path: '/x', body: {} }, { method: 'GET', path: '/x', body: {} }]]) {
    assert.throws(() => validateRoutes(value));
  }
});

test('serves configured responses, delay, exact routes and CORS', async (t) => {
  const server = createMockServer(validateRoutes([
    { method: 'GET', path: '/users', body: [{ id: 1 }] },
    { method: 'POST', path: '/users', status: 201, delay: 50, body: { id: 2 } },
  ]));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/users?sort=name`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: 1 }]);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  const start = performance.now();
  const created = await fetch(`${base}/users`, { method: 'POST' });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { id: 2 });
  assert.ok(performance.now() - start >= 45);
  for (const [path, method] of [['/missing', 'GET'], ['/users/1', 'GET'], ['/users', 'DELETE']]) {
    const missing = await fetch(`${base}${path}`, { method });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Route not found' });
  }
  const options = await fetch(`${base}/users`, { method: 'OPTIONS', headers: { 'Access-Control-Request-Headers': 'Content-Type' } });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-headers'), '*');
});
