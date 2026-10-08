# Learn with Seyi — deployment-ready

This project is a language-learning website with student accounts, saved progress and an admin dashboard.

## Recommended production architecture

- Frontend: Netlify
- API: Railway (recommended) or Render
- Database: PostgreSQL (Railway is recommended because it can live in the same project as the API)
- Source control: GitHub

## Required API environment variables

Set these on the Railway/Render API service:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — long random secret
- `ADMIN_EMAIL` — exact email address for your administrator account
- `FRONTEND_URL` — your Netlify site URL, e.g. `https://your-site.netlify.app`
- `NODE_ENV=production`

## Required Netlify environment variable

Set:

- `LEARN_WITH_SEYI_API` = the public Railway/Render API URL, e.g. `https://learn-with-seyi-api.up.railway.app`

Netlify runs `node scripts/netlify-config.js` during deployment and writes `config.js` with that value.

## Railway setup

1. Push this folder to a private GitHub repository.
2. In Railway, create a project and deploy the GitHub repository.
3. Add a PostgreSQL service to the same Railway project.
4. On the API service, set `DATABASE_URL=${{Postgres.DATABASE_URL}}` (adjust the service name if Railway names it differently).
5. Set `JWT_SECRET`, `ADMIN_EMAIL`, `FRONTEND_URL`, and `NODE_ENV=production`.
6. Generate a public domain for the API service.
7. Test `https://YOUR-API-DOMAIN/api/ping`; it should return `{ "ok": true }`.
8. Put that API URL into Netlify as `LEARN_WITH_SEYI_API` and redeploy the Netlify site.

## Admin account

Register on the website using the exact email configured as `ADMIN_EMAIL`. The API assigns that account the `admin` role. Then open `/admin` on the Netlify site.

## Database

The API creates the `users` table automatically on first startup. Student progress is stored in PostgreSQL and is therefore not dependent on the browser's local storage.

## Security notes

- Never commit `.env`, database passwords or JWT secrets.
- Keep the GitHub repository private.
- Use a strong unique `JWT_SECRET`.
- Set `FRONTEND_URL` to the real Netlify origin(s), not `*`, in production.
