<img src="app/src/lib/assets/favicon.svg" width="56" height="56" alt="" align="left" />

# SpeedMeasure

Self-hosted internet speed monitoring. Runs speed tests on a schedule, keeps years of
results, and alerts you when your ISP drops below the speed you're paying for.

<br clear="left"/>

## Quick start

```sh
cp .env.example .env
# fill in POSTGRES_PASSWORD and SESSION_SECRET: openssl rand -hex 32
docker compose up -d
```

Open <http://localhost:8080>. The first visit asks you to create the single account.

Three services — `db`, `app`, `runner` (see [docker-compose.yml](docker-compose.yml)) —
running on x86-64 and ARM64.

## Learn more

- [CONTRIBUTING.md](CONTRIBUTING.md) — stack, architecture, adding a speed-test provider,
  adding a language, where the styles live, how alerts work, dev server and tests.
