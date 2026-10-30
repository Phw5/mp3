# MP3 setup

Use Node 24 LTS. The project's `.nvmrc` and `package.json` select Node 24.

```sh
nvm install 24
nvm use 24
npm ci
cp .env.example .env
```

Set `MONGODB_URI` in `.env` to your Atlas connection string. Use a database named `mp3`, and URL-encode special characters in the database username/password. Keep `.env` out of Git.

```sh
npm start
```

The API is at `http://localhost:3000/api`. Both JSON and URL-encoded bodies are accepted; JSON bodies preserve booleans and arrays directly.

## Tests

```sh
npm test
```

The 24 integration tests start a temporary MongoDB replica set and send HTTP requests to Express. They do not connect to Atlas or read your `.env`. The first run downloads a MongoDB binary. Tests cover validation, defaults, all endpoints, projections, queries, references, replacement behavior, deletion, concurrency, and transaction rollback.

Writes run inside MongoDB transactions so failed requests cannot leave partial reference updates. Atlas supports these transactions; a standalone local MongoDB server does not. Application startup connects to the database and creates the models' indexes before listening.

`count=true` counts all documents matching `where`, independently of pagination. `limit=0` means unlimited results. Task lists default to 100 results; user lists have no default limit. PUT replaces all writable fields, applies defaults to omitted optional fields, and preserves `dateCreated`. The server ignores client-provided `_id` and `dateCreated` values.

Successful DELETE and OPTIONS responses use HTTP 204 with no body. All other API responses, including errors, use `{ "message": "...", "data": ... }`.

## MongoDB Atlas

1. Sign in at https://cloud.mongodb.com/ and create a project for MP3.
2. Create a free cluster. Avoid paid upgrades and sample datasets.
3. Create a database user that can read and write the MP3 database. Save the password privately.
4. Under Network Access, add `0.0.0.0/0` if required by the course's deployment instructions.
5. Choose Connect > Drivers and copy the connection string. Replace the placeholders and specify `/mp3` before the query string.
6. Save the connection string in the local `.env` and in Render's `MONGODB_URI` environment variable.

## Render

The included `render.yaml` describes a free Node web service. Use a Blueprint from the public repository or create a Web Service manually with these values:

| Setting | Value |
| --- | --- |
| Repository | https://github.com/Phw5/mp3 |
| Branch | main |
| Runtime | Node |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Instance | Free |
| Health check path | `/api` |
| `NODE_VERSION` | `24` |
| `MONGODB_URI` | Your Atlas connection string, stored as a secret |

Render provides `PORT`; the server binds to `0.0.0.0`. Wait until the service is live, then check `/api/users` and `/api/tasks`. A successful response with an empty array is expected for a new database.

Set `API_URL` in `submit.js` to the deployed base URL, without `/api`, and run `npm run submit`. Keep `AUTOGRADER_URL` unchanged. The self-check creates and deletes its own test data. It does not submit the assignment.
