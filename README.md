# Local Mock API

A small, dependency-free mock HTTP API written in TypeScript. Define routes in JSON and run locally or inside Docker—no database or backend framework required.

Use it to build frontend screens before a backend exists, create repeatable demos, and test loading states or error responses.

## Quick start with Docker

From this repository's root:

```bash
docker build -t local-mock-api:1.0.0 .
docker run --rm -p 127.0.0.1:3000:3000 local-mock-api:1.0.0
```

In another terminal:

```bash
curl http://localhost:3000/users
```

The image uses Node.js 24.21.0 and runs as a non-root user.

## Run locally

Requires Node.js 24.12.0 or newer with native TypeScript support. No `npm install` is needed.

```bash
npm start
```

TypeScript runs directly through Node.js. No compiler or static type-checking is included.

## Sample endpoints

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | Health status |
| GET | `/users` | Sample user list |
| POST | `/users` | Fixed sample user with HTTP 201 |
| GET | `/slow` | Response delayed by 1 second |
| GET | `/error` | Example HTTP 500 response |

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/users
curl http://localhost:3000/slow
curl http://localhost:3000/error
```

## Configure routes

Edit `routes.json`. Its top-level value must be an array:

```json
[
  {
    "method": "GET",
    "path": "/products",
    "body": [{ "id": 1, "name": "Keyboard", "price": 49 }]
  },
  {
    "method": "POST",
    "path": "/products",
    "status": 201,
    "delay": 500,
    "body": { "id": 2, "name": "Mouse" }
  }
]
```

| Field | Required | Rules |
| --- | --- | --- |
| `method` | Yes | Uppercase `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS` |
| `path` | Yes | Starts with `/`; no whitespace, query string, or fragment |
| `body` | Yes | Any JSON value, including `null` |
| `status` | No | Integer from 200 to 599; defaults to 200 |
| `delay` | No | Integer from 0 to 60000 milliseconds; defaults to no delay |

Each method/path pair must be unique. Invalid configuration stops startup with an error.

Routes match the HTTP method and exact path. Query strings are ignored: `/products?sort=name` matches `/products`, but `/products/1` does not. Unknown routes return HTTP 404 with `{"error":"Route not found"}`.

All `OPTIONS` requests return HTTP 204 for CORS preflight, regardless of configured routes. HTTP rules suppress response bodies for `HEAD` requests and bodyless status codes such as 204 and 304.

Configuration loads once at startup. Restart after editing it. For Docker, mount your configuration instead of rebuilding:

```bash
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  --mount type=bind,src="$(pwd)/routes.json",dst=/app/routes.json,readonly \
  local-mock-api:1.0.0
```

The file must exist and be readable by the container's non-root user.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listening port; integer from 1 to 65535 |
| `ROUTES_FILE` | `routes.json` next to `server.ts` | Path to a custom route configuration |

Local example:

```bash
PORT=4000 ROUTES_FILE=./routes.json npm start
```

Docker example with a different port:

```bash
docker run --rm -e PORT=4000 \
  -p 127.0.0.1:4000:4000 \
  local-mock-api:1.0.0
```

## Tests

Run the native Node.js test suite:

```bash
npm test
```

Tests cover configuration validation, duplicate routes, method/path matching, custom status codes, delays, missing routes, and CORS.

## Publish to Docker Hub

Create a Docker Hub repository named `local-mock-api`. Replace `YOUR_DOCKERHUB_USERNAME` below with your actual username:

```bash
docker login
docker build -t YOUR_DOCKERHUB_USERNAME/local-mock-api:1.0.0 .
docker push YOUR_DOCKERHUB_USERNAME/local-mock-api:1.0.0
```

After publishing, others can run:

```bash
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  YOUR_DOCKERHUB_USERNAME/local-mock-api:1.0.0
```

Copy relevant usage sections into your Docker Hub repository's Overview. Uploading source to GitHub does not automatically publish a Docker image. These build commands publish for the build machine's default platform, not every CPU architecture.

## Limits and safety

- Fixed responses only: request bodies do not change the returned data.
- No persistence, automatic CRUD, authentication, dynamic path parameters, or hot reload.
- CORS allows any origin, method in the supported list, and non-credentialed request headers. Credentialed browser requests are not supported.
- Intended for local development, not a production API. Do not put secrets or real personal data in sample responses.
- Docker examples bind the host port to localhost. Local `npm start` listens on all network interfaces; use trusted networks or firewall restrictions.
