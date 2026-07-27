# Contributing

## What's in the stack

| Service | Image | Job |
|---|---|---|
| `db` | `postgres:17-alpine` | Measurements, settings, account, acknowledgements |
| `app` | SvelteKit + adapter-node | Dashboard, alerts, settings |
| `runner` | Node + Ookla CLI + librespeed-cli + iperf3 | Runs the tests, sends alert emails |

The app and runner talk only through Postgres — `LISTEN`/`NOTIFY` carries "run a test now"
and "send a test email". No queue, no broker, no HTTP between containers.

## Adding a provider

Add an entry to [`runner/providers.mjs`](runner/providers.mjs) returning
`{ server, download, upload, ping, jitter, loss }` in Mbps/ms/%, and add its name to
[`shared/providers.mjs`](shared/providers.mjs). Nothing else needs to change — the settings
UI reads the same list, and the runner fails at startup if the two drift apart.

## Where the styles live

No component carries its own `<style>` block. CSS lives in `app/src/styles/`, split so
that shared rules exist exactly once:

| File | Contents |
|---|---|
| `tokens.css` | Every colour, radius and font as a CSS variable. Nothing else defines a hex. |
| `base.css` | Reset and element defaults |
| `layout.css` | App shell: rail, main column, page header, scroll body |
| `components.css` | Cross-page primitives: panel, button, chip, segmented control, form field |
| `table.css` | The results table — **shared** by the dashboard and the log page |
| `chart.css` | SVG axis/tooltip/drag styling — **shared** by `Chart` and `NavStrip` |
| `dashboard.css`, `alerts.css`, `settings.css`, `login.css` | One route each |

`index.css` imports the first four and is loaded once by the root layout; the rest are
imported by the routes that need them, so Vite only ships them where they are used.

Because the rules are global rather than Svelte-scoped, class names have to be unique —
page-specific ones are namespaced (`.login__card`, `.alerts__inner`, `.statcard`) and
genuinely shared ones are not (`.btn`, `.field`, `.datatable`).

## Adding a language

Drop a `messages/<locale>.json` next to the existing ones and add the locale to
`app/project.inlang/settings.json`. Dates, weekdays and months come from `Intl`, so they
follow automatically. Currently ships English and Czech.

## Changing the database schema

[`db/schema.sql`](db/schema.sql) is the whole schema, and the app applies it on every
boot before it starts serving. Upgrading a running instance is therefore just
`docker compose up -d --build` — no manual `ALTER` on the server.

## Alerts

Alerts are derived from the raw measurements on read (see
[`shared/alerts.mjs`](shared/alerts.mjs)) rather than stored, so changing a threshold
immediately re-evaluates history. Only your acknowledgements and which alert IDs have
already been emailed are persisted (`alert_ack`, `alert_sent`). Three kinds:

- **Outage** (critical, immediate) — download or upload below the large-drop floor.
- **Sustained breach** (warning) — below the guaranteed floor for longer than the window.
- **Loss / latency spikes** — suppressed while an outage covers the same period.

With SMTP configured, the runner emails each new alert once.

## Development

```sh
cd app && npm install && npm run dev     # needs DATABASE_URL
npm run check                            # typecheck
node --test 'shared/*.test.mjs'          # alert rules
node runner/schedule.mjs                 # scheduling self-check
```

## Notes

- Sessions are HMAC-signed cookies, not a table — rotating `SESSION_SECRET` logs everyone out.
- Set `INSECURE_COOKIES=1` if you serve plain HTTP with no TLS terminator in front.
- `ORIGIN` must match how you reach the app, or SvelteKit rejects form posts.
- Alerts are derived over the last 90 days; see the note in `runner/run.mjs` before widening.
