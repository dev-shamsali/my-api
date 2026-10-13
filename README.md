# my-api

JavaScript + ES Modules + MongoDB API built with [Rhea.js](https://rhea.devcodehub.cloud). Developed with Rhea.js by Shams Ali Shaikh.

## Run it

```bash
npm install
npm run dev      # nodemon, restarts on file changes
```

Open http://localhost:5000/api/rhea, your first API. Then:

```bash
npm test                          # Vitest + Supertest
npm start                         # run with node
npx rhea generate module users    # controller, service, routes, schema, test
npx rhea doctor
npx rhea security
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | nodemon with node, loads `.env` |
| `npm start` | `node src/server.js` (no `.env` loading: set real environment variables) |
| `npm run start:env` | same, loading `.env` (handy locally) |
| `npm test` | run tests once |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Endpoints

- `GET /` and `GET /api/rhea`: Rhea.js welcome and info
- `GET /health`: liveness
- `GET /health/ready`: readiness (checks the database)

## Database (MongoDB)

Set `DATABASE_URL` in `.env`. The app connects before it starts listening and closes the connection on shutdown. `GET /health/ready` reports whether the database is reachable. The connection code is in `src/config/database.js`.


## Authentication

Users live in your MongoDB database (`users` and `refresh_tokens`, created on start). Passwords are hashed with scrypt. The **access token** is a JWT that lives 15 minutes (signed with `JWT_SECRET`). The **refresh token** is random, stored only as a hash, valid 7 days unused and 30 days in total, and replaced every time you use it.

- `POST /api/auth/register` with `{ "email", "password" }` (12+ characters, not a common password)
- `POST /api/auth/login` returns `{ accessToken, refreshToken }`
- `POST /api/auth/refresh` with `{ "refreshToken" }` returns a new pair; the old refresh token stops working, and reusing it ends the whole session
- `POST /api/auth/logout` with `{ "refreshToken" }` ends one session; `POST /api/auth/logout-all` (with the access token) ends all of them
- `GET /api/auth/me` with `Authorization: Bearer <access token>`

Five wrong passwords lock an account for 15 minutes. For a browser app set `AUTH_REFRESH_COOKIE=true` and `CORS_ORIGIN` in `.env`: the refresh token then lives in an httpOnly cookie instead of the JSON.

Protect your own routes with `authenticate(jwt)` and `requireRole("admin")` from `@rheajs/auth`. New users get the role `user`; grant `admin` yourself in the database. Register, login and refresh are rate limited per process: use a shared store when you run several instances. Read the authentication guide: https://rhea.devcodehub.cloud/docs/authentication/

## Production

Set `NODE_ENV=production`, provide every variable from `.env.example` as a real environment variable, and run behind a reverse proxy with `TRUST_PROXY=1`. `npx rhea docker` writes a Dockerfile and a docker-compose.yml with a database.
