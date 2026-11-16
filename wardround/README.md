# Inpatient Schedule

A shared, sleep-aware scheduling demo for a synthetic adult inpatient ward.

The demo starts at 4:55 AM. Use Play or +5 min in the shared demo clock. The physician can restart the synthetic scenario. The shift calendar opens by default. Select an event to review or change its time, or select a room to see all patient tasks. The Agenda shows visit priority and room-to-room walking estimates. Use the provider picker to switch between the physician and nursing views.

## Local development

Requires Node.js 22.13+ and npm. From this directory:

```sh
npm ci
npm run build
npx wrangler d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file drizzle/0000_ward.sql
npm start
```

Open the printed local URL. Apply the schema once per local database. Use `npm run dev` for hot reload against the same local database.

Run the scheduling tests with `node --test tests/*.test.ts`.

## Offline demo

Run `npm run build:offline` to generate `out/acorn`. Upload that directory as static assets to Cloudflare. This demo starts with the seeded scenario and uses the scripted sleep readings. Changes are saved in each browser, and after the first visit the browser caches the app for offline reloads.

The hosted Site is owner-private. Demo roles are selectable personas, and changes are shared across sessions accessing the same Site. Patient orders, diagnoses, and wearable readings are synthetic.
