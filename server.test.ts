import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMockServer, validateRoutes } from './server.ts';

test('accepts valid route configuration', () => {
  assert.deepEqual(validateRoutes([{ method: 'GET', path: '/users', body: [] }]), [
    { method: 'GET', path: '/users', body: [] },
  ]);
});

for (const [name, value, message] of [
  ['null configuration', null, /Routes must be an array/],
  ['object configuration', {}, /Routes must be an array/],
  ['non-object route', [null], /Route must be an object/],
  ['array route', [[]], /Route must be an object/],
  ['configured OPTIONS route', [{ method: 'OPTIONS', path: '/users', body: {} }], /OPTIONS.*preflight/],
  ['unsupported method', [{ method: 'BAD', path: '/x', body: {} }], /Route method/],
  ['relative path', [{ method: 'GET', path: 'x', body: {} }], /Route path/],
  ['query in path', [{ method: 'GET', path: '/x?q=1', body: {} }], /Route path/],
  ['fragment in path', [{ method: 'GET', path: '/x#part', body: {} }], /Route path/],
  ['whitespace in path', [{ method: 'GET', path: '/x y', body: {} }], /Route path/],
  ['missing body', [{ method: 'GET', path: '/x' }], /Route body/],
  ['status below range', [{ method: 'GET', path: '/x', body: {}, status: 199 }], /Route status/],
  ['status above range', [{ method: 'GET', path: '/x', body: {}, status: 600 }], /Route status/],
  ['fractional status', [{ method: 'GET', path: '/x', body: {}, status: 200.5 }], /Route status/],
  ['negative delay', [{ method: 'GET', path: '/x', body: {}, delay: -1 }], /Route delay/],
  ['delay above range', [{ method: 'GET', path: '/x', body: {}, delay: 60001 }], /Route delay/],
  ['fractional delay', [{ method: 'GET', path: '/x', body: {}, delay: 0.5 }], /Route delay/],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateRoutes(value), message);
  });
}

test('rejects duplicate method and path pairs', () => {
  assert.throws(() => validateRoutes([
    { method: 'GET', path: '/x', body: {} },
    { method: 'GET', path: '/x', body: {} },
  ]), /Duplicate route: GET \/x/);
});

test('accepts status and delay boundaries', () => {
  assert.equal(validateRoutes([
    { method: 'GET', path: '/low', body: null, status: 200, delay: 0 },
    { method: 'GET', path: '/high', body: null, status: 599, delay: 60000 },
  ]).length, 2);
});

test('HTTP responses', async (t) => {
  const server = createMockServer(validateRoutes([
    { method: 'GET', path: '/users', body: [{ id: 1 }] },
    { method: 'POST', path: '/users', status: 201, body: { id: 2 } },
    { method: 'GET', path: '/slow', delay: 50, body: { ready: true } },
  ]));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;

  await t.test('serves JSON and ignores query strings', async () => {
    const response = await fetch(`${base}/users?sort=name`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await response.json(), [{ id: 1 }]);
  });

  await t.test('serves configured status and body for matching method', async () => {
    const response = await fetch(`${base}/users`, { method: 'POST' });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: 2 });
  });

  await t.test('waits for configured delay', async () => {
    const start = performance.now();
    const response = await fetch(`${base}/slow`);
    assert.deepEqual(await response.json(), { ready: true });
    assert.ok(performance.now() - start >= 45);
  });

  for (const [name, path, method] of [
    ['missing path', '/missing', 'GET'],
    ['path prefix', '/users/1', 'GET'],
    ['unconfigured method', '/users', 'DELETE'],
  ]) {
    await t.test(`returns JSON 404 for ${name}`, async () => {
      const response = await fetch(`${base}${path}`, { method });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'Route not found' });
    });
  }

  await t.test('includes CORS origin on responses', async () => {
    const response = await fetch(`${base}/users`);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    await response.arrayBuffer();
  });

  await t.test('handles preflight without configured route', async () => {
    const response = await fetch(`${base}/missing`, {
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Headers': 'Content-Type' },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-headers'), '*');
    assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    assert.equal(await response.text(), '');
  });
});
