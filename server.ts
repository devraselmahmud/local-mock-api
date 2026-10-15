import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

type Route = { method: string; path: string; body: unknown; status?: number; delay?: number };
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function validateRoutes(value: unknown): Route[] {
  if (!Array.isArray(value)) throw new Error('Routes must be an array');
  const keys = new Set<string>();
  for (const route of value) {
    if (!route || typeof route !== 'object' || Array.isArray(route)) throw new Error('Route must be an object');
    if (route.method === 'OPTIONS') throw new Error('OPTIONS is reserved for CORS preflight');
    if (!methods.includes(route.method)) throw new Error('Route method must be GET, POST, PUT, PATCH, DELETE or HEAD');
    if (typeof route.path !== 'string' || !route.path.startsWith('/') || /[?#\s]/.test(route.path)) {
      throw new Error('Route path must be absolute, without query, fragment or whitespace');
    }
    if (!Object.hasOwn(route, 'body')) throw new Error('Route body is required');
    if (route.status !== undefined && (!Number.isInteger(route.status) || route.status < 200 || route.status > 599)) {
      throw new Error('Route status must be an integer from 200 to 599');
    }
    if (route.delay !== undefined && (!Number.isInteger(route.delay) || route.delay < 0 || route.delay > 60000)) {
      throw new Error('Route delay must be an integer from 0 to 60000 ms');
    }
    const key = `${route.method} ${route.path}`;
    if (keys.has(key)) throw new Error(`Duplicate route: ${key}`);
    keys.add(key);
  }
  return value;
}

export function createMockServer(routes: Route[]) {
  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    response.setHeader('Access-Control-Allow-Headers', '*');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const path = (request.url ?? '/').split('?')[0];
    const route = routes.find((item) => item.method === request.method && item.path === path);
    if (route?.delay) await setTimeout(route.delay);
    response.writeHead(route?.status ?? (route ? 200 : 404), { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(route ? route.body : { error: 'Route not found' }));
  });
}

if (import.meta.main) {
  try {
    const port = Number(process.env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
    const routes = validateRoutes(JSON.parse(readFileSync(process.env.ROUTES_FILE ?? new URL('./routes.json', import.meta.url), 'utf8')));
    const server = createMockServer(routes);
    server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '0.0.0.0', () => console.log(`Mock API listening on port ${port}`));
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => server.close());
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
